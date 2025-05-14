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
import { CustomExtensions } from './operation/custom-extensions.ts';
import type { CustomExtensionsInterface } from './operation/custom-extensions.ts';
import { getParameters, OperationClient } from './parameter-mapper.ts';
import type { PathOperation } from './parameter-mapper.ts';
import { HttpVerb } from './safety.ts';

export interface OpenApiSpecOptions {
  app: App;
  baseUrl?: string;
}

export class OpenApiSpec {
  static async load(path: string, options: OpenApiSpecOptions): Promise<OpenApiSpec> {
    const { spec } = await parseSpecPath(path);
    return new OpenApiSpec(spec, options);
  }

  static async parse(spec: object, options: OpenApiSpecOptions): Promise<OpenApiSpec> {
    const { spec: oasSpec } = await parseSpec(spec);
    return new OpenApiSpec(oasSpec, options);
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

  #operation(method: string, operation: PathOperation): OperationClient | null {
    const verb = HttpVerb.from(method);
    if (!verb) return null;

    const extensions = normalizeExtensions(this.#spec.getExtension('x-mcpify', operation));
    return OperationClient.from(operation, extensions, this.#app);
  }

  get #paths(): OperationClient[] {
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
    const resources = this.#paths.filter((client) => client.op.isResource);

    for (const client of resources) {
      const path = client.op.path;

      if (/[{]/.exec(path)) {
        const uriTemplate = new ResourceTemplate(`${this.#spec.url()}${path}`, {
          list: undefined,
        });
        this.#log.debug(
          `Converting ${client.op.describe()} → ${client.op.verb.describe()} resource "${client.op.id}"`,
        );
        server.resource(client.op.id, uriTemplate, async (_, args): Promise<ReadResourceResult> => {
          return client.read(args);
        });
      } else {
        this.#log.debug(
          `Converting ${client.op.describe()} → ${client.op.verb.describe()} resource "${client.op.id}"`,
        );
        server.resource(
          client.op.id,
          `${this.#spec.url()}${path}`,
          async (_, args): Promise<ReadResourceResult> => {
            return client.read(args);
          },
        );
      }
    }
  }

  createTools(server: McpServer): void {
    let endpointCount = 0;

    const tools = this.#paths.filter((client) => !client.op.ignoredWhen({ type: 'tool' }));

    for (const client of tools) {
      endpointCount++;

      this.#log.debug(
        `Converting ${client.op.describe()} → ${client.op.verb.describe()} tool "${client.op.id}"`,
      );

      const action: ToolCallback<z.ZodRawShape> = async (
        args: z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>,
      ): Promise<CallToolResult> => {
        this.#log.info(`Request from ${client.op.describe()}:`, JSON.stringify(args, null, 2));

        return client.invoke(args);
      };

      // Extract parameter schemas with full type information
      const parameterSchemas = getParameters(client.op.inner, this.#app);

      // Debug: Log the parameters being registered
      this.#log.debug(
        `Registering tool '${client.op.id}' with parameters`,
        JSON.stringify(parameterSchemas),
      );

      if (parameterSchemas) {
        // Create tool with proper MCP SDK annotations
        server.tool(
          client.op.id,
          client.op.description,
          parameterSchemas,
          client.op.verb.hints,
          action,
        );
      } else {
        server.tool(client.op.id, client.op.description, client.op.verb.hints, action);
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
  convert(): Promise<OASDocument>;
  dereference(): Promise<OASDocument>;
  bundle(): Promise<OASDocument>;
}

/**
 * Dependencies needed by the parseSpec function, abstracted to support testing
 */
export interface ParseSpecDependencies {
  createNormalizer: (specPath: string | object) => SpecNormalizer;
  createOas: (doc: unknown) => Oas;
  compileErrors: (validation: unknown) => string;
  logger: { error: (message: string) => void };
}

// Define default dependencies that use the actual implementation
const defaultDependencies: ParseSpecDependencies = {
  createNormalizer: (specPath: string | object) => new OASNormalize(specPath) as SpecNormalizer,
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
  logger: log,
};

function createNormalizer(value: unknown): OASNormalize {
  const normalizer = new OASNormalize(value, {
    parser: { validate: { errors: { colorize: true } } },
  });

  return normalizer;
}

/**
 * Parse the OpenAPI specification
 */
async function parseSpecPath(
  specPath: string,
  deps: ParseSpecDependencies = defaultDependencies,
): Promise<{ spec: Oas }> {
  try {
    const normalizer = createNormalizer(specPath);
    const doc = normalizer.convert();
    const validation = await createNormalizer(doc).validate();

    if (!validation.valid) {
      const msg = deps.compileErrors(validation);
      console.error(validation);
      throw new Error(msg);
    }

    const dereffed = await createNormalizer(doc).dereference();
    const bundled = await createNormalizer(dereffed).bundle();

    const spec = deps.createOas(bundled);

    return { spec };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    deps.logger.error(`Failed to parse OpenAPI spec: ${errorMessage}`);
    throw error;
  }
}

/**
 * Parse the OpenAPI specification with full reference resolution
 */
export async function parseSpec(
  spec: object,
  dependencies: Partial<ParseSpecDependencies> = defaultDependencies,
): Promise<{ spec: Oas }> {
  const deps = {
    ...defaultDependencies,
    ...dependencies,
  };

  try {
    const normalizer = deps.createNormalizer(spec);
    const validation = await normalizer.validate();

    if (!validation.valid) {
      const msg = deps.compileErrors(validation);
      throw new Error(msg);
    }

    // Convert the spec to an OAS document
    const doc = await normalizer.convert();

    // Create a new normalizer from the converted document
    const processedNormalizer = deps.createNormalizer(doc);

    // First dereference to resolve all $refs
    await processedNormalizer.dereference();

    // Then bundle to ensure proper structure
    const bundled = await processedNormalizer.bundle();

    // Create the final OAS spec from the fully processed document
    const oasSpec = deps.createOas(bundled);

    return { spec: oasSpec };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    deps.logger.error(`Failed to parse OpenAPI spec: ${errorMessage}`);
    throw error;
  }
}

export function normalizeExtensions(extensions: unknown): CustomExtensions {
  if (typeof extensions !== 'object' || extensions === null) {
    return CustomExtensions.of({});
  }

  // Handle boolean case where x-mcpify: false or x-mcpify: true
  if (typeof extensions === 'boolean' && extensions === false) {
    return CustomExtensions.of({ ignore: true });
  }

  const result: CustomExtensionsInterface = {};

  for (const [key, value] of Object.entries(extensions) as [string, unknown][]) {
    switch (key) {
      case 'operationId':
        if (typeof value === 'string') {
          result.operationId = value;
        }
        break;

      case 'ignore':
        // Handle both boolean and string values with explicit type checks
        if (value === true) {
          result.ignore = true;
        } else if (value === 'resource') {
          result.ignore = 'resource';
        } else if (value === 'tool') {
          result.ignore = 'tool';
        }
        break;

      case 'annotations':
        if (typeof value === 'object' && value !== null) {
          // Use a safer type casting approach
          // First check if it's a record with string keys
          // Then create a properly typed object
          const annotations: Record<string, unknown> = {};

          // Only copy properties that exist
          for (const [k, v] of Object.entries(value)) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
              annotations[k] = v;
            }
          }

          // Process safety annotations
          if ('readOnlyHint' in annotations || 'destructiveHint' in annotations) {
            // Use type-safe access with bracket notation
            const isReadOnly = annotations['readOnlyHint'] === true;
            const isDestructive = annotations['destructiveHint'] === true;
            const isIdempotent = annotations['idempotentHint'] === true;

            // Structure the safety object according to ChangeSafety type
            if (isReadOnly) {
              result.safety = { access: 'readonly' };
            } else if (isDestructive) {
              result.safety = { access: 'delete' };
            } else {
              result.safety = { access: 'update', idempotent: isIdempotent };
            }
          }
        }
        break;

      case 'description':
        if (typeof value === 'string') {
          result.description = value;
        }
        break;
    }
  }

  return CustomExtensions.of(result);
}
