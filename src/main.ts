#!/usr/bin/env node

import { program } from 'commander';
import * as SwaggerParser from 'swagger-parser';
import type { OpenAPIV3 } from 'openapi-types';
import axios from 'axios';
// @ts-expect-error - Import from the MCP SDK
import { McpServer } from '@modelcontextprotocol/sdk';
import { z } from 'zod';
import { URL } from 'url';

// Define the version from package.json
const version = '0.1.0';

/**
 * Main class for the MCPify proxy server
 */
class MCPify {
  private server: McpServer;
  private specPath: string;
  private baseUrl: string | undefined;
  private headers: Record<string, string> = {};
  private openApiSpec: OpenAPIV3.Document | null = null;
  private port: number;
  private logLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor(options: {
    specPath: string;
    baseUrl?: string;
    port?: number;
    headers?: string[];
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
  }) {
    this.specPath = options.specPath;
    this.baseUrl = options.baseUrl;
    this.port = options.port || 8080;
    this.logLevel = options.logLevel || 'info';
    
    // Parse headers if provided
    if (options.headers) {
      for (const header of options.headers) {
        const [name, value] = header.split(':', 2).map(part => part.trim());
        if (name && value) {
          this.headers[name] = value;
        }
      }
    }

    // Initialize the MCP server
    this.server = new McpServer({
      name: "MCPify Proxy",
      version
    });
  }

  /**
   * Parse the OpenAPI specification
   */
  async parseSpec(): Promise<void> {
    try {
      this.log('info', `Loading OpenAPI specification from ${this.specPath}`);
      // @ts-expect-error - SwaggerParser typing issues 
      this.openApiSpec = await SwaggerParser.default.parse(this.specPath) as OpenAPIV3.Document;
      this.log('info', 'Validating OpenAPI document');
      // @ts-expect-error - SwaggerParser typing issues
      await SwaggerParser.default.validate(this.specPath);
      
      // Determine base URL if not provided
      if (!this.baseUrl && this.openApiSpec.servers && this.openApiSpec.servers.length > 0) {
        this.baseUrl = this.openApiSpec.servers[0].url;
        this.log('info', `Using base URL from OpenAPI spec: ${this.baseUrl}`);
      }

      if (!this.baseUrl) {
        throw new Error('Base URL is required. Provide it with --base-url or ensure it\'s defined in the OpenAPI spec.');
      }
    } catch (error) {
      this.log('error', `Failed to parse OpenAPI spec: ${error}`);
      throw error;
    }
  }

  /**
   * Convert OpenAPI paths to MCP tools
   */
  async createTools(): Promise<void> {
    if (!this.openApiSpec?.paths) {
      throw new Error('OpenAPI specification not parsed or invalid');
    }

    const paths = this.openApiSpec.paths;
    let endpointCount = 0;

    for (const [path, pathItem] of Object.entries(paths)) {
      if (!pathItem) continue;

      // Process each HTTP method (GET, POST, etc.)
      for (const [method, operationValue] of Object.entries(pathItem)) {
        if (!operationValue || !isHttpMethod(method) || method === 'parameters') continue;
        
        // Convert to OperationObject type
        const operation = operationValue as OpenAPIV3.OperationObject;
        
        // Skip if explicitly disabled via x-mcpify extension
        const mcpifyExtension = (operation as any)['x-mcpify'];
        if (mcpifyExtension === false) continue;

        endpointCount++;
        
        // Generate a tool name from operationId or path+method
        const toolName = operation.operationId || `${method}_${path.replace(/\W+/g, '_').replace(/^\_|\_$/g, '')}`; 
        
        // Create tool description from summary and description
        const toolDescription = [
          operation.summary,
          operation.description
        ].filter(Boolean).join(' - ') || `${method.toUpperCase()} ${path}`;

        this.log('info', `Converting ${method.toUpperCase()} ${path} → ${getToolType(method)} tool "${toolName}"`);

        // Create parameter schema
        const paramSchema = this.buildParameterSchema(operation, path);

        // Extract schema properties
        const schemaShape = paramSchema.shape;
        
        // Create the MCP tool
        const tool = this.server.tool(
          toolName,
          toolDescription,
          schemaShape, 
          // Handler function that proxies the request to the actual REST API
          async (params: Record<string, any>) => {
            try {
              const result = await this.proxyRequest(method, path, params, operation);
              // Convert result to string for text content
              const resultText = typeof result === 'string' 
                ? result 
                : JSON.stringify(result, null, 2);
              
              return {
                content: [
                  { 
                    type: "text" as const,
                    text: resultText
                  }
                ]
              };
            } catch (error: any) {
              if (this.logLevel === 'debug') {
                console.error('Error in tool execution:', error);
              }
              throw new Error(error.message || 'Failed to execute request');
            }
          }
        );

        // Add appropriate annotations based on HTTP method
        const annotations = this.getAnnotationsForMethod(method);
        for (const [key, value] of Object.entries(annotations)) {
          if (key in tool) {
            (tool as any)[key] = value;
          }
        }

        // Mark as deprecated if specified in OpenAPI
        if (operation.deprecated) {
          (tool as any).deprecated = true;
        }

        // Add source info for debugging
        (tool as any).sourceEndpoint = `${method.toUpperCase()} ${path}`;
      }
    }

    this.log('info', `Found ${endpointCount} endpoints to convert`);
  }

  /**
   * Build parameter schema for a specific operation
   */
  private buildParameterSchema(operation: OpenAPIV3.OperationObject, pathTemplate: string): z.ZodObject<any> {
    const properties: Record<string, z.ZodTypeAny> = {};
    const required: string[] = [];

    // Process path parameters
    const pathParams = this.extractPathParams(pathTemplate);
    for (const param of pathParams) {
      properties[param] = z.string().describe(`Path parameter: ${param}`);
      required.push(param);
    }

    // Process operation parameters (path, query, header)
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if ('$ref' in param) continue; // Skip reference parameters for now

        const name = param.name;
        let zodType: z.ZodTypeAny = z.any();

        // Convert OpenAPI schema to Zod schema (simplified version)
        if (param.schema) {
          zodType = this.openApiSchemaToZod(param.schema as OpenAPIV3.SchemaObject);
        } else {
          zodType = z.string();
        }

        // Add description if available
        if (param.description) {
          zodType = zodType.describe(param.description);
        }

        properties[name] = param.required ? zodType : zodType.optional();
        if (param.required) {
          required.push(name);
        }
      }
    }

    // Process request body if present
    if (operation.requestBody) {
      const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
      if (requestBody.content && requestBody.content['application/json']) {
        const schema = requestBody.content['application/json'].schema as OpenAPIV3.SchemaObject;
        if (schema) {
          if (schema.type === 'object' && schema.properties) {
            // Add each property from the request body
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
              properties[propName] = this.openApiSchemaToZod(propSchema as OpenAPIV3.SchemaObject);
              
              // Mark as required if in the required array
              if (schema.required?.includes(propName)) {
                required.push(propName);
              }
            }
          } else {
            // For non-object schemas, create a body parameter
            properties['body'] = this.openApiSchemaToZod(schema);
            if (requestBody.required) {
              required.push('body');
            }
          }
        }
      }
    }

    // Create Zod schema
    return z.object(properties);
  }

  /**
   * Proxy the request to the actual REST API
   */
  private async proxyRequest(
    method: string, 
    pathTemplate: string, 
    params: any,
    operation: OpenAPIV3.OperationObject
  ): Promise<any> {
    if (!this.baseUrl) {
      throw new Error('Base URL not configured');
    }

    // Replace path parameters in URL
    let url = pathTemplate;
    const pathParams = this.extractPathParams(pathTemplate);
    for (const param of pathParams) {
      if (params[param] !== undefined) {
        url = url.replace(`{${param}}`, encodeURIComponent(params[param]));
      }
    }

    // Prepare query parameters
    const queryParams: Record<string, string> = {};
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if ('$ref' in param) continue;
        if (param.in === 'query' && params[param.name] !== undefined) {
          queryParams[param.name] = params[param.name];
        }
      }
    }

    // Prepare request headers
    const headers: Record<string, string> = { ...this.headers };
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if ('$ref' in param) continue;
        if (param.in === 'header' && params[param.name] !== undefined) {
          headers[param.name] = params[param.name];
        }
      }
    }

    // Prepare request body
    let data: any = undefined;
    if (method !== 'get' && method !== 'delete') {
      if (operation.requestBody) {
        const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
        if (requestBody.content && requestBody.content['application/json']) {
          const schema = requestBody.content['application/json'].schema as OpenAPIV3.SchemaObject;
          if (schema) {
            if (schema.type === 'object' && schema.properties) {
              // Extract body parameters
              data = {};
              for (const propName of Object.keys(schema.properties)) {
                if (params[propName] !== undefined) {
                  data[propName] = params[propName];
                }
              }
            } else if (params.body !== undefined) {
              data = params.body;
            }
          }
        }
      } else {
        // If no requestBody is specified, use all non-path/query parameters as body
        data = { ...params };
        
        // Remove path parameters
        for (const param of pathParams) {
          delete data[param];
        }
        
        // Remove query parameters
        if (operation.parameters) {
          for (const param of operation.parameters) {
            if ('$ref' in param) continue;
            if (param.in === 'query') {
              delete data[param.name];
            }
          }
        }
      }
    }

    // Construct full URL
    const fullUrl = new URL(url, this.baseUrl).toString();
    this.log('debug', `Proxying ${method.toUpperCase()} ${fullUrl}`);
    
    if (this.logLevel === 'debug') {
      console.debug('Request Data:', { params, headers, queryParams, body: data });
    }

    try {
      // Execute the request
      const response = await axios({
        method: method.toLowerCase(),
        url: fullUrl,
        params: queryParams,
        headers,
        data
      });

      if (this.logLevel === 'debug') {
        console.debug('Response:', {
          status: response.status,
          headers: response.headers,
          data: response.data
        });
      }

      return response.data;
    } catch (error: any) {
      this.log('error', `Request failed: ${error.message}`);
      if (error.response) {
        this.log('debug', `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
        throw new Error(`${error.message} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Extract path parameters from a path template
   */
  private extractPathParams(pathTemplate: string): string[] {
    const matches = pathTemplate.match(/\{([^}]+)\}/g) || [];
    return matches.map(match => match.slice(1, -1));
  }

  /**
   * Convert OpenAPI schema to Zod schema (simplified)
   */
  private openApiSchemaToZod(schema: OpenAPIV3.SchemaObject): z.ZodTypeAny {
    if (!schema) return z.any();

    // Handle nullable
    const nullable = schema.nullable === true;

    // Handle different types
    switch (schema.type) {
      case 'string':
        let stringSchema = z.string();
        if (schema.format === 'date-time' || schema.format === 'date') {
          stringSchema = z.string().datetime();
        } else if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
          // For enums, just use plain string but include enum values in description
          const enumValues = schema.enum.map(v => String(v));
          if (enumValues.length > 0) {
            stringSchema = z.string().describe(`Enum with values: ${enumValues.join(', ')}`);
          }
        } else if (schema.pattern) {
          stringSchema = z.string().regex(new RegExp(schema.pattern));
        }
        return nullable ? stringSchema.nullable() : stringSchema;

      case 'number':
      case 'integer':
        let numberSchema = z.number();
        if (schema.minimum !== undefined) {
          numberSchema = numberSchema.min(schema.minimum);
        }
        if (schema.maximum !== undefined) {
          numberSchema = numberSchema.max(schema.maximum);
        }
        return nullable ? numberSchema.nullable() : numberSchema;

      case 'boolean':
        return nullable ? z.boolean().nullable() : z.boolean();

      case 'array':
        if (schema.items) {
          const itemSchema = this.openApiSchemaToZod(schema.items as OpenAPIV3.SchemaObject);
          return nullable ? z.array(itemSchema).nullable() : z.array(itemSchema);
        }
        return nullable ? z.array(z.any()).nullable() : z.array(z.any());

      case 'object':
        if (schema.properties) {
          const shape: Record<string, z.ZodTypeAny> = {};
          const required = schema.required || [];

          for (const [key, propSchema] of Object.entries(schema.properties)) {
            const zodProp = this.openApiSchemaToZod(propSchema as OpenAPIV3.SchemaObject);
            shape[key] = required.includes(key) ? zodProp : zodProp.optional();
          }

          return nullable ? z.object(shape).nullable() : z.object(shape);
        }
        return nullable ? z.record(z.any()).nullable() : z.record(z.any());

      default:
        return z.any();
    }
  }

  /**
   * Get appropriate annotations based on HTTP method
   */
  private getAnnotationsForMethod(method: string): Record<string, any> {
    switch (method.toLowerCase()) {
      case 'get':
        return { readOnlyHint: true };
      case 'post':
        return { readOnlyHint: false, destructiveHint: false };
      case 'put':
        return { readOnlyHint: false, destructiveHint: true, idempotentHint: true };
      case 'patch':
        return { readOnlyHint: false, destructiveHint: true };
      case 'delete':
        return { readOnlyHint: false, destructiveHint: true };
      default:
        return {};
    }
  }

  /**
   * Start the MCP server
   */
  async start(transportType: 'http' | 'stdio' = 'http'): Promise<void> {
    try {
      // First parse the OpenAPI spec
      await this.parseSpec();
      
      // Create tools from the OpenAPI paths
      await this.createTools();

      // Connect to appropriate transport
      if (transportType === 'http') {
        // Start HTTP server on the specified port
        await this.server.listen(this.port);
        this.log('info', `MCP proxy server started at http://localhost:${this.port}`);
        this.log('info', `MCP debugging interface available at http://localhost:${this.port}/debug`);
      } else {
        // Start on stdio
        await this.server.listen();
        this.log('info', 'MCP proxy server started on standard I/O');
      }
    } catch (error) {
      this.log('error', `Failed to start server: ${error}`);
      process.exit(1);
    }
  }

  /**
   * Log messages based on configured log level
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] >= levels[this.logLevel]) {
      console[level](`[${level.toUpperCase()}] ${message}`);
    }
  }
}

/**
 * Check if a string is a valid HTTP method
 */
function isHttpMethod(method: string): boolean {
  const validMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
  return validMethods.includes(method.toLowerCase());
}

/**
 * Get tool type based on HTTP method
 */
function getToolType(method: string): string {
  switch (method.toLowerCase()) {
    case 'get':
    case 'head':
      return 'query';
    default:
      return 'mutation';
  }
}

// CLI definition using Commander
program
  .name('mcpify')
  .description('A dynamic proxy that converts OpenAPI endpoints into MCP tools on the fly')
  .version(version)
  .option('-s, --spec <path>', 'Path or URL to OpenAPI specification')
  .option('-b, --base-url <url>', 'Base URL for the API (overrides the one in the spec)')
  .option('-p, --port <number>', 'Port for the MCP server', '8080')
  .option('-H, --header <header>', 'Add custom header to all requests (format: "Name: Value")', [] as any)
  .option('-l, --log-level <level>', 'Log level (debug, info, warn, error)', 'info')
  .option('-t, --transport <type>', 'Transport type (http, stdio)', 'http')
  .action(async (options) => {
    // Validate required options
    if (!options.spec) {
      console.error('Error: OpenAPI specification path is required');
      program.help();
    }

    // Create and start the MCPify server
    const mcpify = new MCPify({
      specPath: options.spec,
      baseUrl: options.baseUrl,
      port: parseInt(options.port, 10),
      headers: options.header,
      logLevel: options.logLevel,
    });

    await mcpify.start(options.transport as 'http' | 'stdio');
  });

// Parse CLI arguments if this is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

// Export for use in other modules
export { MCPify };
