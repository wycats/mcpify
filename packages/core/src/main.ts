/* eslint-disable @typescript-eslint/no-base-to-string */
/**
 * MCPify: Convert OpenAPI specifications into MCP servers
 */

// Node.js core modules
import { randomUUID } from 'crypto';
import { URL } from 'url';

// External dependencies
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import axios from 'axios';
import type { Method } from 'axios';
import { Command } from 'commander';
import express from 'express';
import type { Request, Response } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import SwaggerParser from 'swagger-parser';

// Internal dependencies
import { extractParameterSchemas } from './parameter-mapper.ts';

// Define the version from package.json
const version = '0.1.0';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options']);

// Log level priority order
const LOG_LEVEL_PRIORITIES = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

// Tool types mapping from HTTP methods
const TOOL_TYPES: Map<string, 'query' | 'mutation'> = new Map(
  Object.entries({
    get: 'query',
    post: 'mutation',
    put: 'mutation',
    delete: 'mutation',
    patch: 'mutation',
    head: 'query',
    options: 'query',
  }),
);

/**
 * Main class for the MCPify proxy server
 */
class MCPify {
  // Private class properties
  readonly #server: McpServer;
  readonly #specPath: string;
  #baseUrl: string | undefined;
  readonly #headers: Record<string, string> = {};
  #openApiSpec: OpenAPIV3.Document = {} as OpenAPIV3.Document;
  readonly #port: number;
  readonly #logLevel: 'debug' | 'info' | 'warn' | 'error';

  // No static constants needed here anymore

  /**
   * Create a new MCPify server
   */
  constructor(options: {
    specPath: string;
    baseUrl?: string;
    port?: number;
    headers?: string[];
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
  }) {
    this.#specPath = options.specPath;
    this.#baseUrl = options.baseUrl;
    this.#port = options.port ?? 8080;
    this.#logLevel = options.logLevel ?? 'info';

    // Parse headers if provided
    if (options.headers) {
      for (const header of options.headers) {
        const [name, value] = header.split(':', 2).map((part) => part.trim());
        if (name && value) {
          this.#headers[name] = value;
        }
      }
    }

    // Initialize the MCP server
    this.#server = new McpServer({
      name: 'MCPify Proxy',
      version,
    });
  }

  /**
   * Log a message based on the current log level
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    if (LOG_LEVEL_PRIORITIES[level] >= LOG_LEVEL_PRIORITIES[this.#logLevel]) {
      if (level === 'error') {
        console.error(`[ERROR] ${message}`);
      } else if (level === 'warn') {
        console.warn(`[WARN] ${message}`);
      } else if (level === 'info') {
        console.info(`[INFO] ${message}`);
      } else {
        console.debug(`[DEBUG] ${message}`);
      }
    }
  }

  /**
   * Check if a string is a valid HTTP method
   */
  private isHttpMethod(method: string): boolean {
    return HTTP_METHODS.has(method.toLowerCase());
  }

  /**
   * Get the MCP tool type for a given HTTP method
   */
  private getToolType(method: string): string {
    const httpMethod = method.toLowerCase();
    return TOOL_TYPES.get(httpMethod) ?? 'query';
  }

  /**
   * Extract path parameters from a path template
   */
  private extractPathParams(pathTemplate: string): string[] {
    const matches = pathTemplate.match(/\{([^}]+)\}/g) ?? [];
    return matches.map((match) => match.slice(1, -1));
  }

  /**
   * Get the appropriate tool annotations for a given HTTP method
   */
  private getAnnotationsForMethod(method: string): Record<string, boolean> {
    switch (method.toUpperCase()) {
      case 'GET':
      case 'HEAD':
      case 'OPTIONS':
        return { query: true };
      case 'DELETE':
        return { destructive: true, mutation: true };
      case 'PUT':
        return { idempotent: true, mutation: true };
      case 'PATCH':
      case 'POST':
      default:
        return { mutation: true };
    }
  }

  /**
   * Parse the OpenAPI specification
   */
  async parseSpec(): Promise<void> {
    try {
      this.log('info', `Loading OpenAPI specification from ${this.#specPath}`);
      this.#openApiSpec = (await SwaggerParser.parse(this.#specPath)) as OpenAPIV3.Document;
      this.log('info', 'Validating OpenAPI document');
      await SwaggerParser.validate(this.#specPath);

      // Determine base URL if not provided
      if (!this.#baseUrl && this.#openApiSpec.servers && this.#openApiSpec.servers.length > 0) {
        this.#baseUrl = this.#openApiSpec.servers[0].url;
        this.log('info', `Using base URL from OpenAPI spec: ${this.#baseUrl}`);
      }

      if (!this.#baseUrl) {
        throw new Error(
          "Base URL is required. Provide it with --base-url or ensure it's defined in the OpenAPI spec.",
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', `Failed to parse OpenAPI spec: ${errorMessage}`);
      throw error;
    }
  }

  // The extractOperationParameterNames method has been replaced by the extractParameterSchemas function

  /**
   * Convert OpenAPI paths to MCP tools
   */
  // This method doesn't have awaited operations but is marked async for API consistency
  // eslint-disable-next-line @typescript-eslint/require-await
  async createTools(): Promise<void> {
    // Ensure we have a valid paths object, even if empty
    // The OpenAPI spec should always have a paths object after parsing
    const paths = this.#openApiSpec.paths ?? {};
    if (Object.keys(paths).length === 0) {
      this.log('warn', 'No paths found in the OpenAPI specification');
    }

    let endpointCount = 0;

    // Process each path in the OpenAPI spec
    for (const [path, pathItem] of Object.entries(paths)) {
      if (!pathItem) continue;

      // Process each HTTP method (GET, POST, etc.) for this path
      for (const [method, operationValue] of Object.entries(pathItem)) {
        if (!this.isHttpMethod(method) || method === 'parameters' || !operationValue) continue;

        // Convert to OperationObject type
        const operation = operationValue as OpenAPIV3.OperationObject &
          Partial<{ 'x-mcpify': object | false }>;

        // Skip if explicitly disabled via x-mcpify extension
        const mcpifyExtension = operation['x-mcpify'];
        if (mcpifyExtension === false) continue;

        endpointCount++;

        // Generate a tool name from operationId or path+method
        const toolName =
          operation.operationId ?? `${method}_${path.replace(/\W+/g, '_').replace(/^_|_$/g, '')}`;

        // Create tool description from summary and description
        const toolDescription =
          [operation.summary, operation.description]
            .filter((item): item is string => typeof item === 'string' && item.length > 0)
            .join(' - ') || `${method.toUpperCase()} ${path}`;

        this.log(
          'info',
          `Converting ${method.toUpperCase()} ${path} → ${this.getToolType(method)} tool "${toolName}"`,
        );

        // Extract parameter schemas with full type information
        const parameterSchemas = extractParameterSchemas(operation, path);

        // Debug: Log the parameters being registered
        if (LOG_LEVEL_PRIORITIES[this.#logLevel] <= LOG_LEVEL_PRIORITIES.debug) {
          this.log('debug', `Registering tool '${toolName}' with parameters: ${JSON.stringify(parameterSchemas)}`);
        }

        // MCP SDK expects parameters in a very specific format
        // For simple recognition, we'll ensure every parameter is at least marked as required
        // This guarantees they'll show up in the MCP client
        const formattedParams: Record<string, boolean> = {};
        
        // Create a simple map of parameter names to boolean (required) flags
        for (const paramName of Object.keys(parameterSchemas)) {
          formattedParams[paramName] = true; // Mark every parameter as required
        }
        
        // Debug info for parameter mapping
        this.log('info', `Tool '${toolName}' has ${Object.keys(formattedParams).length} parameters: ${Object.keys(formattedParams).join(', ')}`);
        

        // Create tool with proper MCP SDK annotations
        this.#server.tool(
          toolName,
          toolDescription,
          {
            // Parameters definition object with proper schemas
            parameters: formattedParams,
            ...this.getAnnotationsForMethod(method),
          },
          async (params: Record<string, unknown>) => {
            try {
              // Call the REST endpoint
              const response = await this.proxyRequest(method, path, params, operation);
              return {
                content: [
                  {
                    type: 'text' as const,
                    text:
                      typeof response === 'string' ? response : JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              // Handle errors during request
              const errorMessage = error instanceof Error ? error.message : String(error);
              this.log('error', `Error executing tool ${toolName}: ${errorMessage}`);

              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Error: ${errorMessage}`,
                  },
                ],
              };
            }
          },
        );
      }
    }

    this.log('info', `Created ${endpointCount} MCP tools from OpenAPI specification`);
  }

  /**
   * Proxy a request to the REST API
   */
  private async proxyRequest(
    method: string,
    pathTemplate: string,
    params: Record<string, unknown>,
    operation: OpenAPIV3.OperationObject,
  ): Promise<unknown> {
    // Extract path parameters
    const pathParams = this.extractPathParams(pathTemplate);

    // Build the URL with path parameters
    let urlPath = pathTemplate;
    for (const param of pathParams) {
      const value = params[param];
      if (value !== undefined) {
        // Safely convert value to string, handling objects properly
        let valueStr: string;
        if (typeof value === 'object' && value !== null) {
          try {
            valueStr = JSON.stringify(value);
          } catch {
            // Use template literal for safer conversion
            valueStr = `${value}`;
          }
        } else {
          // Use template literal for safer conversion
          valueStr = `${value}`;
        }
        urlPath = urlPath.replace(`{${param}}`, encodeURIComponent(valueStr));
      } else {
        throw new Error(`Missing required path parameter: ${param}`);
      }
    }

    // Prepare query parameters
    const queryParams: Record<string, string> = {};
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if ('$ref' in param) continue;

        if (param.in === 'query' && param.name && params[param.name] !== undefined) {
          // Safely convert to string, handling objects properly
          const value = params[param.name];
          if (typeof value === 'object' && value !== null) {
            try {
              // Use JSON.stringify for objects
              queryParams[param.name] = JSON.stringify(value);
            } catch {
              // Use template literal for safer conversion
              queryParams[param.name] = `${value}`;
            }
          } else {
            // Use template literal for safer conversion
            queryParams[param.name] = `${value}`;
          }
        }
      }
    }

    // Prepare headers
    const headers = { ...this.#headers };
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if ('$ref' in param) continue;

        if (param.in === 'header' && param.name && params[param.name] !== undefined) {
          // Safely convert to string, handling objects properly
          const value = params[param.name];
          if (typeof value === 'object' && value !== null) {
            try {
              // Use JSON.stringify for objects
              headers[param.name] = JSON.stringify(value);
            } catch {
              // Use template literal for safer conversion
              headers[param.name] = `${value}`;
            }
          } else {
            // Use template literal for safer conversion
            headers[param.name] = `${value}`;
          }
        }
      }
    }

    // Prepare request body if needed for POST, PUT, PATCH
    let data: Record<string, unknown> | undefined;
    const upperMethod = method.toUpperCase();
    if (upperMethod !== 'GET' && upperMethod !== 'DELETE') {
      // Type-safe approach
      const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject | undefined;
      const jsonContent = requestBody?.content['application/json'];
      const schema = jsonContent?.schema as OpenAPIV3.SchemaObject | undefined;

      if (schema) {
        if (schema.type === 'object' && schema.properties) {
          // Extract body parameters
          const bodyData: Record<string, unknown> = {};
          // Properties are guaranteed to exist from the condition above
          for (const propName of Object.keys(schema.properties)) {
            if (params[propName] !== undefined) {
              bodyData[propName] = params[propName];
            }
          }
          data = bodyData;
        } else if (params.body !== undefined) {
          data = params.body as Record<string, unknown>;
        }
      } else {
        // If no requestBody is specified, use non-path/query parameters as body
        const bodyData: Record<string, unknown> = {};
        let hasBodyParams = false;

        for (const [key, value] of Object.entries(params)) {
          // Skip path parameters
          if (pathParams.includes(key)) continue;

          // Skip query parameters
          const isQueryParam = operation.parameters
            ? operation.parameters.some(
                (param) => !('$ref' in param) && param.in === 'query' && param.name === key,
              )
            : false;

          if (!isQueryParam) {
            bodyData[key] = value;
            hasBodyParams = true;
          }
        }

        if (hasBodyParams) {
          data = bodyData;
        }
      }
    }

    // Construct full URL
    if (!this.#baseUrl) {
      throw new Error('Base URL is required for API requests');
    }
    // urlPath is defined above as pathTemplate with parameters replaced
    const fullUrl = new URL(urlPath, this.#baseUrl).toString();
    this.log('debug', `Proxying ${method.toUpperCase()} ${fullUrl}`);

    if (this.#logLevel === 'debug') {
      this.log(
        'debug',
        `Request Data: ${JSON.stringify({ params, headers, queryParams, body: data })}`,
      );
    }

    try {
      // Execute the request with typed response
      const response = await axios<unknown>({
        method: method.toLowerCase() as Method,
        url: fullUrl,
        params: queryParams,
        headers,
        data,
      });

      if (this.#logLevel === 'debug') {
        this.log(
          'debug',
          `Response: ${JSON.stringify({
            status: response.status,
            headers: response.headers,
            data: response.data,
          })}`,
        );
      }

      return response.data;
    } catch (err) {
      // Type-safe error handling
      // Enhanced error handling
      if (axios.isAxiosError(err) && err.response) {
        this.log(
          'error',
          `Request failed with status ${err.response.status}: ${JSON.stringify(err.response.data)}`,
        );
        throw new Error(
          `API request failed with status ${err.response.status}: ${JSON.stringify(err.response.data)}`,
        );
      }

      // Re-throw the error with improved message
      const error = err instanceof Error ? err : new Error(String(err));
      this.log('error', `Request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start the MCP server
   */
  public async start(transportType: 'http' | 'stdio' = 'http'): Promise<void> {
    try {
      // First parse the OpenAPI spec
      await this.parseSpec();

      // Create tools from the OpenAPI paths
      await this.createTools();

      // Connect to appropriate transport
      if (transportType === 'http') {
        try {
          // Create Express app
          const app = express();
          app.use(express.json());

          // Create a transport with session management
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });

          // Connect server to transport
          await this.#server.connect(transport);

          // Set up routes for streamable HTTP
          app.post('/mcp', (req: Request, res: Response) => {
            void transport.handleRequest(req, res, req.body);
          });

          // Handle GET requests for server-to-client notifications via SSE
          app.get('/mcp', (req: Request, res: Response) => {
            void transport.handleRequest(req, res);
          });

          // Handle DELETE requests for session termination
          app.delete('/mcp', (req: Request, res: Response) => {
            void transport.handleRequest(req, res);
          });

          // Start express server
          const server = app.listen(this.#port, () => {
            this.log('info', `MCP proxy server started at http://localhost:${this.#port}/mcp`);
            this.log('info', `Use this URL for your MCP client configuration`);
          });

          // Add error handling for the server
          server.on('error', (err: Error) => {
            this.log('error', `HTTP server error: ${err.message}`);
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.log('error', `Failed to start HTTP server: ${errorMessage}`);
          throw err;
        }
      } else {
        // Create stdio transport
        const transport = new StdioServerTransport();
        await this.#server.connect(transport);
        this.log('info', 'MCP proxy server started on standard I/O');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', `Failed to start server: ${errorMessage}`);
      process.exit(1);
    }
  }
}

// Define the CommandOptions interface to properly type the options
interface CommandOptions {
  spec: string;
  baseUrl?: string;
  port?: string;
  header?: string | string[];
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  transport?: 'http' | 'stdio';
}

// Type guards for runtime validation
function isValidLogLevel(value: string): value is 'debug' | 'info' | 'warn' | 'error' {
  return ['debug', 'info', 'warn', 'error'].includes(value);
}

function isValidTransport(value: string): value is 'http' | 'stdio' {
  return ['http', 'stdio'].includes(value);
}

// CLI definition using Commander
const program = new Command()
  .name('mcpify')
  .description('A dynamic proxy that converts OpenAPI endpoints into MCP tools on the fly')
  .version(version)
  .option('-s, --spec <path>', 'Path or URL to OpenAPI specification')
  .option('-b, --base-url <url>', 'Base URL for the API (overrides the one in the spec)')
  .option('-p, --port <number>', 'Port for the MCP server', '8080')
  .option(
    '-H, --header <header>',
    'Add custom header to all requests (format: "Name: Value")',
    [] as string[],
  )
  .option('-l, --log-level <level>', 'Log level (debug, info, warn, error)', 'info')
  .option('-t, --transport <type>', 'Transport type (http, stdio)', 'http')
  .action(async (options) => {
    // Validate required options with proper typing
    const typedOptions = options as CommandOptions;
    if (!typedOptions.spec) {
      console.error('Error: OpenAPI specification path is required');
      program.help();
      return;
    }

    // Validate log level with type predicate
    let logLevel: 'debug' | 'info' | 'warn' | 'error' | undefined;
    if (typedOptions.logLevel) {
      if (isValidLogLevel(typedOptions.logLevel)) {
        logLevel = typedOptions.logLevel; // Type is narrowed by predicate
      } else {
        console.warn(`Invalid log level: ${typedOptions.logLevel}, using default`);
      }
    }

    // Validate transport with type predicate
    let transport: 'http' | 'stdio' = 'http'; // Default to http
    if (typedOptions.transport) {
      if (isValidTransport(typedOptions.transport)) {
        transport = typedOptions.transport; // Type is narrowed by predicate
      } else {
        console.warn(`Invalid transport: ${typedOptions.transport}, using http`);
      }
    }

    // Create and start the MCPify server with properly typed options
    const mcpify = new MCPify({
      specPath: typedOptions.spec,
      baseUrl: typedOptions.baseUrl,
      port: typedOptions.port ? parseInt(typedOptions.port, 10) : undefined,
      headers: typedOptions.header ? ([] as string[]).concat(typedOptions.header) : undefined,
      logLevel,
    });

    // Start the proxy server with the chosen transport
    await mcpify.start(transport);
  });

// Parse CLI arguments if this is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

// Export for use in other modules
export { MCPify };
