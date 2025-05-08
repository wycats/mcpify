import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
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

  get #paths(): ExtendedOperation[] {
    const paths = this.#spec.getPaths();
    if (Object.keys(paths).length === 0) {
      this.#log.warn('No paths found in the OpenAPI specification');
    }

    return Object.values(paths)
      .flatMap((path) =>
        Object.entries(path).map(([method, operation]) => this.#operation(method, operation)),
      )
      .filter(Boolean);
  }

  createResources(server: McpServer): void {
    const resources = this.#paths.filter((op) => op.isResource);

    for (const operation of resources) {
      const path = operation.oas.path;

      if (/[{]/.exec(path)) {
        const uriTemplate = new ResourceTemplate(`${this.#spec.url()}${path}`, {
          list: undefined,
        });
        this.#log.debug(
          `Converting ${operation.describe()} → ${operation.verb.describe()} resource "${operation.id}"`,
        );
        server.resource(
          operation.oas.getOperationId({ friendlyCase: true }),
          uriTemplate,
          async (_, args): Promise<ReadResourceResult> => {
            return operation.read(this.#spec, args);
          },
        );
      } else {
        this.#log.debug(
          `Converting ${operation.describe()} → ${operation.verb.describe()} resource "${operation.id}"`,
        );
        server.resource(
          operation.oas.getOperationId({ friendlyCase: true }),
          `${this.#spec.url()}${path}`,
          async (_, args): Promise<ReadResourceResult> => {
            return operation.read(this.#spec, args);
          },
        );
      }
    }
  }

  createTools(server: McpServer): void {
    let endpointCount = 0;

    const tools = this.#paths.filter((p) => !p.isIgnored('tool'));

    for (const operation of tools) {
      endpointCount++;

      this.#log.debug(
        `Converting ${operation.describe()} → ${operation.verb.describe()} tool "${operation.id}"`,
      );

      const action: ToolCallback<z.ZodRawShape> = async (
        args: z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>,
      ): Promise<CallToolResult> => {
        this.#log.info(`Request from ${operation.describe()}:`, JSON.stringify(args, null, 2));

        return operation.invoke(this.#spec, args);
      };

      // Extract parameter schemas with full type information
      const parameterSchemas = operation.parameters;

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

    this.#log.info(`Created ${endpointCount} MCP tools from OpenAPI specification`);
  }
}

/**
 * Interface for a normalizer that can validate, dereference, and bundle an OpenAPI spec
 */
export interface SpecNormalizer {
  validate(): Promise<{ valid: boolean; errors?: unknown[] }>;
  dereference(): Promise<unknown>;
  bundle(): Promise<unknown>; // Less specific type to avoid compatibility issues
}

/**
 * Dependencies needed by the parseSpec function, abstracted to support testing
 */
export interface ParseSpecDependencies {
  createNormalizer: (specPath: string) => SpecNormalizer;
  createOas: (doc: unknown) => Oas; // Use less specific type
  compileErrors: (validation: unknown) => string;
  logger: { error: (message: string) => void };
}

// Define default dependencies that use the actual implementation
const defaultDependencies: ParseSpecDependencies = {
  createNormalizer: (specPath: string) => new OASNormalize(specPath) as unknown as SpecNormalizer,
  createOas: (doc: unknown) => new Oas(doc as OASDocument),
  // Type assertion is unavoidable when adapting between the generic interface and the specific implementation
  compileErrors: (validation: unknown) => {
    if (!validation || typeof validation !== 'object') {
      return `Invalid validation result: ${String(validation)}`;
    }
    
    // At runtime, we expect validation from OASNormalize which should match what compileErrors expects
    // We need to bypass TypeScript's type checking here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return compileErrors(validation as any);
  },
  logger: log
};

/**
 * Parse the OpenAPI specification
 */
async function parseSpec(
  specPath: string, 
  deps: ParseSpecDependencies = defaultDependencies
): Promise<{ spec: Oas }> {
  try {
    const normalizer = deps.createNormalizer(specPath);
    const validation = await normalizer.validate();

    if (!validation.valid) {
      const msg = deps.compileErrors(validation);
      throw new Error(msg);
    }

    await normalizer.dereference();

    const spec = deps.createOas((await normalizer.bundle()));

    return { spec };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    deps.logger.error(`Failed to parse OpenAPI spec: ${errorMessage}`);
    throw error;
  }
}

export function normalizeExtensions(extensions: unknown): OperationExtensions {
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
