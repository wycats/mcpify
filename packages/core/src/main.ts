/**
 * MCPify: Convert OpenAPI specifications into MCP servers
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
}

type McpifyState = Omit<ServerOptions, 'spec'> & { spec: OpenApiSpec };

/**
 * Main class for the MCPify proxy server
 */
class MCPify {
  static async load(options: ServerOptions): Promise<MCPify> {
    const spec = await OpenApiSpec.load(options.spec, {
      app: options.app,
    });

    return new MCPify({ ...options, spec });
  }

  // Private class properties
  readonly #server: McpServer;
  readonly #state: McpifyState;

  // No static constants needed here anymore

  /**
   * Create a new MCPify server
   */
  constructor(options: McpifyState) {
    // Initialize the MCP server
    this.#server = new McpServer({
      name: 'MCPify Proxy',
      version,
    });

    this.#state = options;
  }

  get #log(): LogLayer {
    return this.#state.app.log;
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

          // Start express server
          const server = app.listen(this.#state.port, () => {
            this.#log.info(`MCP proxy server started at http://localhost:${port}/mcp`);
            this.#log.info('info', `Use this URL for your MCP client configuration`);
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
  .name('mcpify')
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
  .action(async (options) => {
    // Validate required options with proper typing
    const app = App.default({
      logLevel: options.logLevel,
    });

    // Create and start the MCPify server with properly typed options
    const mcpify = await MCPify.load({
      app,
      transport: options.transport,
      spec: options.spec,
      port: options.port,
      headers: options.header,
    });

    // Start the proxy server with the chosen transport
    await mcpify.start();
  });

// Parse CLI arguments if this is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

// Export for use in other modules
export { MCPify };

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
