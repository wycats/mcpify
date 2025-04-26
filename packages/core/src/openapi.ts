import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { compileErrors } from '@readme/openapi-parser';
import type { LogLayer } from 'loglayer';
import Oas from 'oas';
import type { OASDocument } from 'oas/types';
import OASNormalize from 'oas-normalize';
import type { z } from 'zod';

import { log } from './log.ts';
import type { App } from './main.ts';
import { ExtendedOperation } from './parameter-mapper.ts';
import type { OperationExtensions, PathOperation } from './parameter-mapper.ts';
import { HttpVerb } from './safety.ts';

export interface OpenApiSpecOptions {
  app: App;
  baseUrl?: string;
}

export class OpenApiSpec {
  static async load(path: string, options: OpenApiSpecOptions): Promise<OpenApiSpec> {
    const { spec } = await parseSpec(path);
    return new OpenApiSpec(spec, options);
  }

  /**
   * Create a new OpenApiSpec instance from a parsed OpenAPI document. This is
   * asynchronous because it dereferences any references in the document.
   */
  static from(spec: Oas, options: OpenApiSpecOptions): OpenApiSpec {
    return new OpenApiSpec(spec, options);
  }

  readonly #spec: Oas;
  readonly #options: OpenApiSpecOptions;

  private constructor(spec: Oas, options: OpenApiSpecOptions) {
    this.#spec = spec;
    this.#options = options;
  }

  get #app(): App {
    return this.#options.app;
  }

  get #log(): LogLayer {
    return this.#app.log;
  }

  get spec(): Oas {
    return this.#spec;
  }

  #operation(method: string, operation: PathOperation): ExtendedOperation | null {
    const verb = HttpVerb.from(method);
    if (!verb) return null;

    const extensions = normalizeExtensions(this.#spec.getExtension('x-mcpify', operation));
    return new ExtendedOperation(this.#app, verb, operation, extensions);
  }

  async createTools(server: McpServer): Promise<void> {
    const spec = this.#spec;
    // Ensure we have a valid paths object, even if empty
    // The OpenAPI spec should always have a paths object after parsing
    const paths = spec.getPaths();
    if (Object.keys(paths).length === 0) {
      this.#log.warn('No paths found in the OpenAPI specification');
    }

    let endpointCount = 0;

    // Process each path in the OpenAPI spec
    for (const path of Object.values(paths)) {
      // Process each HTTP method (GET, POST, etc.) for this path
      for (const [method, op] of Object.entries(path)) {
        const extended = this.#operation(method, op);
        if (!extended) continue;

        const operation = McpifyOperation.of(extended);

        // Skip if explicitly disabled via x-mcpify extension
        if (operation.isIgnored) continue;

        endpointCount++;

        this.#log.debug(
          `Converting ${operation.extended.describe()} → ${operation.verb.describe()} tool "${operation.id}"`,
        );

        const action: ToolCallback<z.ZodRawShape> = async (
          args: z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>,
        ): Promise<CallToolResult> => {
          this.#log.info(
            `Request from ${operation.extended.describe()}:`,
            JSON.stringify(args, null, 2),
          );

          return operation.extended.invoke(this.#spec, args);
        };

        // Extract parameter schemas with full type information
        const parameterSchemas = operation.extended.parameters;

        // Debug: Log the parameters being registered
        this.#log.debug(
          `Registering tool '${operation.id}' with parameters`,
          JSON.stringify(parameterSchemas),
        );

        if (parameterSchemas) {
          // Create tool with proper MCP SDK annotations
          server.tool(
            operation.id,
            operation.description,
            parameterSchemas,
            operation.verb.hints,
            action,
          );
        } else {
          server.tool(operation.id, operation.description, operation.verb.hints, action);
        }
      }
    }

    this.#log.info(`Created ${endpointCount} MCP tools from OpenAPI specification`);
  }
}

/**
 * Parse the OpenAPI specification
 */
async function parseSpec(specPath: string): Promise<{ spec: Oas }> {
  try {
    const oas = new OASNormalize(specPath);
    const validation = await oas.validate();

    if (!validation.valid) {
      const msg = compileErrors(validation);
      throw new Error(msg);
    }

    await oas.dereference();

    const spec = new Oas((await oas.bundle()) as OASDocument);

    return { spec };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to parse OpenAPI spec: ${errorMessage}`);
    throw error;
  }
}

class McpifyOperation {
  static of(operation: ExtendedOperation): McpifyOperation {
    return new McpifyOperation(operation);
  }

  readonly #operation: ExtendedOperation;

  private constructor(operation: ExtendedOperation) {
    this.#operation = operation;
  }

  get #extensions(): OperationExtensions {
    return this.#operation.extensions;
  }

  get oas(): PathOperation {
    return this.#operation.oas;
  }

  get verb(): HttpVerb {
    return this.#operation.verb;
  }

  get extended(): ExtendedOperation {
    return this.#operation;
  }

  get isIgnored(): boolean {
    return Boolean(this.#extensions.ignore);
  }

  get id(): string {
    return this.#extensions.operationId ?? this.oas.getOperationId({ friendlyCase: true });
  }

  get description(): string {
    if (this.#extensions.description) {
      return this.#extensions.description;
    }

    const summary = this.oas.getSummary();
    const description = this.oas.getDescription();

    if (!summary && !description) {
      return `${this.#operation.verb.uppercase} ${this.oas.path}`;
    }

    return [this.oas.getSummary(), this.oas.getDescription()].filter(Boolean).join(' - ');

    // TODO: Incorporate examples and other metadata
  }
}

function normalizeExtensions(extensions: unknown): OperationExtensions {
  if (typeof extensions !== 'object' || extensions === null) {
    return {};
  }

  const result: OperationExtensions = {};
  for (const [key, value] of Object.entries(extensions)) {
    if (key === 'operationId') {
      result.operationId = value as string;
    }
  }

  return result;
}
