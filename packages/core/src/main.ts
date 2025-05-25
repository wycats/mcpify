/**
 * Quick-MCP: Convert OpenAPI specifications into MCP servers
 */

import { randomUUID } from 'crypto';
import type { UUID } from 'node:crypto';

import { Command, Option } from '@commander-js/extra-typings';
import { LogFileRotationTransport } from '@loglayer/transport-log-file-rotation';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import express from 'express';
import type { Request, Response } from 'express';
import { LogLayer } from 'loglayer';
import type { ErrorSerializerType, LogLayerConfig, LogLayerTransport, LogLevel } from 'loglayer';
import { serializeError } from 'serialize-error';

// Internal dependencies

import type { OpenApiSpecOptions } from './openapi.ts';
import { OpenApiSpec } from './openapi.ts';

export type { OpenApiSpecOptions };
export { OpenApiSpec };

// Define the version from package.json
const version = '0.1.0';

type LogLevelString = keyof typeof LogLevel;

export interface AppOptions {
  logLevel: LogLevelString;
}

export class App {
  static default(_options: AppOptions): App {
    return new App({
      serializer: serializeError,
      log: [
        new LogFileRotationTransport({
          filename: './logs/app.log',
        }),
      ],
    });
  }

  readonly #log: LogLayer;

  constructor(options: {
    log: LogLayerTransport | LogLayerTransport[];
    serializer?: ErrorSerializerType;
  }) {
    const opts: LogLayerConfig = { transport: options.log };
    if (options.serializer) {
      opts.errorSerializer = options.serializer;
    }

    this.#log = new LogLayer(opts);
  }

  get log(): LogLayer {
    return this.#log;
  }
}

export type TransportType = 'http' | 'stdio';

export interface ServerOptions {
  app: App;
  spec: string;
  port: number;
  headers: Record<string, string>;
  transport: 'http' | 'stdio';
  baseUrl?: string;
}

type QuickMcpState = Omit<ServerOptions, 'spec'> & { spec: OpenApiSpec };

/**
 * Environment configuration for 12-factor app compliance
 * Supports Heroku deployment out of the box
 */
export interface EnvironmentConfig {
  PORT?: string;
  OPENAPI_SPEC_URL?: string;
  BASE_URL?: string;
  LOG_LEVEL?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  TRANSPORT?: 'http' | 'stdio';
  AUTH_HEADERS?: string; // JSON string of headers
}

/**
 * Load configuration from environment variables (12-factor app principle)
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  const config: EnvironmentConfig = {};
  
  if (process.env['PORT']) config.PORT = process.env['PORT'];
  if (process.env['OPENAPI_SPEC_URL']) config.OPENAPI_SPEC_URL = process.env['OPENAPI_SPEC_URL'];
  if (process.env['BASE_URL']) config.BASE_URL = process.env['BASE_URL'];
  
  const logLevel = process.env['LOG_LEVEL'];
  if (logLevel && ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(logLevel)) {
    config.LOG_LEVEL = logLevel as 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  }
  
  const transport = process.env['TRANSPORT'];
  if (transport && ['http', 'stdio'].includes(transport)) {
    config.TRANSPORT = transport as 'http' | 'stdio';
  }
  
  if (process.env['AUTH_HEADERS']) config.AUTH_HEADERS = process.env['AUTH_HEADERS'];
  
  return config;
}

/**
 * Main class for the Quick-MCP proxy server
 */
class QuickMCP {
  static async load(options: ServerOptions): Promise<QuickMCP> {
    const spec = await OpenApiSpec.load(options.spec, {
      app: options.app,
      ...(options.baseUrl && { baseUrl: options.baseUrl }),
    });

    return new QuickMCP({ ...options, spec });
  }

  /**
   * Create QuickMCP instance from environment variables (12-factor app)
   * Perfect for Heroku deployment
   */
  static async fromEnvironment(overrides: Partial<ServerOptions> = {}): Promise<QuickMCP> {
    const env = loadEnvironmentConfig();
    
    // Parse auth headers from environment
    let authHeaders: Record<string, string> = {};
    if (env.AUTH_HEADERS) {
      try {
        authHeaders = JSON.parse(env.AUTH_HEADERS) as Record<string, string>;
      } catch (error) {
        console.warn('Failed to parse AUTH_HEADERS environment variable:', error);
      }
    }

    const app = App.default({
      logLevel: env.LOG_LEVEL ?? 'info',
    });

    const baseUrl = env.BASE_URL ?? overrides.baseUrl;
    const options: ServerOptions = {
      app,
      spec: env.OPENAPI_SPEC_URL ?? overrides.spec ?? '',
      port: parseInt(env.PORT ?? '8080', 10),
      headers: { ...authHeaders, ...overrides.headers },
      transport: env.TRANSPORT ?? 'http',
      ...(baseUrl && { baseUrl }),
      ...overrides,
    };

    if (!options.spec) {
      throw new Error('OpenAPI spec URL must be provided via OPENAPI_SPEC_URL environment variable or options.spec');
    }

    return QuickMCP.load(options);
  }

  // Private class properties
  readonly #server: McpServer;
  readonly #state: QuickMcpState;

  // No static constants needed here anymore

  /**
   * Create a new Quick-MCP server
   */
  constructor(options: QuickMcpState) {
    // Initialize state first
    this.#state = options;
    
    // Initialize the MCP server
    this.#server = new McpServer({
      name: 'Quick-MCP Proxy',
      version,
    });

    // Log startup configuration for debugging
    this.#state.app.log.info('Quick-MCP starting with configuration:', JSON.stringify({
      transport: options.transport,
      port: options.port,
      hasBaseUrl: !!options.baseUrl,
      headerCount: Object.keys(options.headers).length,
    }));
  }

  get #log(): LogLayer {
    return this.#state.app.log;
  }

  /**
   * Get safety statistics for all exposed tools
   */
  #getSafetyStats(): Record<string, number> {
    const tools = this.#state.spec.getTools();
    const stats = {
      readonly: 0,
      update: 0,
      idempotent: 0,
      destructive: 0,
    };

    tools.forEach(tool => {
      const operation = this.#state.spec.getOperation(tool.name);
      if (operation) {
        const hints = operation.verb.hints;
        if (hints.readOnlyHint) stats.readonly++;
        if (!hints.readOnlyHint && !hints.destructiveHint) stats.update++;
        if (hints.idempotentHint) stats.idempotent++;
        if (hints.destructiveHint) stats.destructive++;
      }
    });

    return stats;
  }

  /**
   * Start the MCP server
   */
  public async start(): Promise<void> {
    try {
      this.#state.spec.createResources(this.#server);
      this.#state.spec.createTools(this.#server);

      // Connect to appropriate transport
      if (this.#state.transport === 'http') {
        try {
          // Create Express app
          const app = express();
          app.use(express.json());

          // Create a transport with session management
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: (): UUID => randomUUID(),
          });

          // Connect server to transport
          await this.#server.connect(transport as Transport);

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

          const port = this.#state.port;
          const host = process.env['NODE_ENV'] === 'production' ? '0.0.0.0' : 'localhost';

          // Start express server with proper host binding for Heroku
          const server = app.listen(port, host, () => {
            this.#log.info(`MCP proxy server started at http://${host}:${port}/mcp`);
            this.#log.info('info', `Use this URL for your MCP client configuration`);
            
            // Log safety information about exposed tools
            const tools = this.#state.spec.getTools();
            const resources = this.#state.spec.getResources();
            this.#log.info(`Exposing ${tools.length} tools and ${resources.length} resources`);
            
            // Log safety summary
            const safetyStats = this.#getSafetyStats();
            this.#log.info('Safety summary: ' + JSON.stringify(safetyStats));
          });

          // Add error handling for the server
          server.on('error', (err: Error) => {
            this.#log.error(`HTTP server error: ${err.message}`);
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.stack : String(err);
          this.#log.error(`Failed to start HTTP server: ${errorMessage}`);
          throw err;
        }
      } else {
        // Create stdio transport
        const transport = new StdioServerTransport();
        await this.#server.connect(transport);
        this.#log.info('MCP proxy server started on standard I/O');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.stack : String(error);
      this.#log.error(`Failed to start server: ${errorMessage}`);
      process.exit(1);
    }
  }
}

// CLI definition using Commander
const program = new Command()
  .name('quick-mcp')
  .description('A dynamic proxy that converts OpenAPI endpoints into MCP tools on the fly')
  .version(version)
  .addOption(
    new Option('-s, --spec <path>', 'Path or URL to OpenAPI specification').makeOptionMandatory(),
  )
  .option('-b, --base-url <url>', 'Base URL for the API (overrides the one in the spec)')
  .addOption(
    new Option('-p, --port <number>', 'Port for the MCP server')
      .argParser((value) => parseInt(value, 10))
      .default(8080),
  )
  .addOption(
    new Option('-H, --header <header>', 'Add custom header to all requests (format: "Name: Value")')
      .argParser(collectHeader)
      .default({} as Record<string, string>),
  )
  .addOption(
    new Option('-l, --log-level <level>', 'Log level')
      .choices(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
      .default('warn'),
  )
  .addOption(
    new Option('-t, --transport <type>', 'Transport type')
      .choices(['http', 'stdio'])
      .default('http'),
  )
  .option('--env', 'Load configuration from environment variables (12-factor app mode)')
  .action(async (options) => {
    let quickMcp: QuickMCP;

    if (options.env) {
      // Load from environment variables (12-factor app mode)
      quickMcp = await QuickMCP.fromEnvironment({
        ...(options.spec ? { spec: options.spec } : {}),
        ...(options.port ? { port: options.port } : {}),
        headers: options.header,
        transport: options.transport,
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      });
    } else {
      // Traditional CLI mode
      const app = App.default({
        logLevel: options.logLevel,
      });

      quickMcp = await QuickMCP.load({
        app,
        transport: options.transport,
        spec: options.spec,
        port: options.port,
        headers: options.header,
        ...(options.baseUrl && { baseUrl: options.baseUrl }),
      });
    }

    // Start the proxy server with the chosen transport
    await quickMcp.start();
  });

// Parse CLI arguments if this is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

// Export for use in other modules
export { QuickMCP };

/**
 * Parse one  --header  argument of the form  key=value
 * Each time it is called it mutates (and returns) the running accumulator.
 */
function collectHeader(input: string, prev: Record<string, string>): Record<string, string> {
  const [key, ...rest] = input.split('=');
  if (!key || rest.length === 0) {
    throw new Error(`--header must be KEY=VALUE (got “${input}”)`);
  }
  prev[key] = rest.join('='); // allow “X=Y=Z” to keep the = in the value
  return prev; // Commander uses the return value as the new accumulator
}
