import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { LogLayer } from 'loglayer';
import type Oas from 'oas';
import type { Operation } from 'oas/operation';
import type { OpenAPIV3 } from 'openapi-types';
import type { z } from 'zod';
import type { JSONSchema } from 'zod-from-json-schema';
import { jsonSchemaObjectToZodRawShape } from 'zod-from-json-schema';

import { CustomExtensions } from './operation/custom-extensions.ts';
import type { CustomExtensionsInterface } from './operation/custom-extensions.ts';
import { McpifyOperation } from './operation/ext.ts';
import { buildRequest, buildRequestInit } from './request/request-builder.ts';

export type PathOperations = ReturnType<Oas['getPaths']>[string];
export type PathOperation = PathOperations[keyof PathOperations];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Deref<T> = T & Exclude<T, { $ref: any }>;

export type IntoOperationExtensions = CustomExtensionsInterface | CustomExtensions;

export class OperationClient {
  static from(
    operation: PathOperation,
    extensions: IntoOperationExtensions,
    options: { log: LogLayer },
  ): OperationClient | null {
    return new OperationClient(options, operation, CustomExtensions.of(extensions));
  }

  #ext: McpifyOperation;
  #app: { log: LogLayer };

  private constructor(
    app: { log: LogLayer },
    operation: PathOperation,
    extensions: CustomExtensions,
  ) {
    this.#app = app;
    this.#ext = McpifyOperation.from(operation, extensions, app);
  }

  get op(): McpifyOperation {
    return this.#ext;
  }

  #buildRequest(spec: Oas, args: z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>): Request {
    const harData = this.#ext.bucketArgs(args);

    this.#app.log.debug('Calling operation with HAR Data', JSON.stringify(harData, null, 2));

    // 1) Get the minimal HAR entry
    const request = buildRequest(this.#app, spec, this.#ext, harData);

    this.#app.log.debug('Calling operation with HAR Data', JSON.stringify(request, null, 2));

    return request;
  }

  async invoke(
    spec: Oas,
    args: z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>,
  ): Promise<CallToolResult> {
    const request = this.#buildRequest(spec, args);

    const response = await fetch(request);

    return toResponseContent(response, this.#app.log, this.#ext);
  }

  async read(
    spec: Oas,
    args: z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>,
  ): Promise<ReadResourceResult> {
    const bucketed = this.#ext.bucketArgs(args);

    this.#app.log.debug('Calling operation with Request Init', JSON.stringify(bucketed, null, 2));

    // 1) Get the minimal HAR entry
    const { init, url } = buildRequestInit(this.#app, spec, this.#ext, bucketed);

    this.#app.log.debug('Calling operation with Request Init', JSON.stringify(init, null, 2));

    const request = new Request(url, init);

    // 3) Fire it off
    const response = await fetch(request);

    return this.#readResource(response);
  }

  async #readResource(response: Response): Promise<ReadResourceResult> {
    const mime = response.headers.get('Content-Type');
    if (isText(this.#ext.inner)) {
      return {
        contents: [
          { uri: response.url, mimeType: mime ?? 'text/plain', text: await response.text() },
        ],
      };
    } else {
      const blob = await response.arrayBuffer();
      // base64 encode
      const encoded = Buffer.from(blob).toString('base64');
      return {
        contents: [
          { uri: response.url, mimeType: mime ?? 'application/octet-stream', blob: encoded },
        ],
      };
    }
  }
}

export type OasResponseType =
  | 'application/json'
  | 'application/x-www-form-urlencoded'
  | 'text/plain';

export type BucketLocation = 'path' | 'query' | 'header' | 'cookie';

/** Minimal interface for operations used by bucketArgs */
export interface BucketOperation {
  oas: {
    getParameters(): { name: string; in: 'path' | 'query' | 'header' | 'cookie' }[];
    hasRequestBody(): boolean;
    getContentType(): string | null;
  };
}

export type OasRequestArgs = z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>;

function assertDeref<T extends object>(obj: T): Deref<T> {
  if ('$ref' in obj) {
    throw new Error('Unexpected $ref in object. Expected all $refs to be dereferenced.');
  }
  return obj as Deref<T>;
}

function convertToJSONSchema(obj: Deref<OpenAPIV3.SchemaObject>): JSONSchema {
  return obj as unknown as JSONSchema;
}

function extractRequestBodySchema(oas: Operation, app: { log: LogLayer }): JSONSchema | null {
  if (!oas.hasRequestBody()) {
    return null;
  }

  try {
    // Default to application/json if no content type is specified
    // The OAS library should always return a string (possibly empty) for getContentType()
    const contentType = oas.getContentType() || 'application/json';

    // Since OAS doesn't expose requestBody schema directly, we need to access the
    // underlying OpenAPI specification in a type-safe way

    // Define TypeScript interfaces to preserve type safety
    type ContentObject = Record<string, { schema?: JSONSchema }>;

    interface RequestBodyObject {
      content?: ContentObject;
    }

    type PathObject = Record<string, { requestBody?: RequestBodyObject }>;

    type PathsObject = Record<string, PathObject>;

    interface ApiObject {
      paths?: PathsObject;
    }

    // Isolate the any conversion to a single constrained location with appropriate comment
    // We need to access the underlying API object which is not exposed through the public interface

    // Type cast to our defined interface after extraction for type safety
    const api = oas.api as ApiObject;

    // Function to safely retrieve schema using properly typed structures
    const getSchema = (cType: string): JSONSchema | null => {
      try {
        // Navigate the structure with type safety
        const path = api.paths?.[oas.path];
        const method = path?.[oas.method];
        const requestBody = method?.requestBody;
        const content = requestBody?.content;
        const contentTypeSchema = content?.[cType]?.schema;

        return contentTypeSchema ?? null;
      } catch {
        return null;
      }
    };

    // Try the primary content type first
    const schema = getSchema(contentType);
    if (schema) {
      app.log.debug('Found request body schema for content type', contentType);
      return schema;
    }

    // Fall back to application/json if available
    const jsonSchema = contentType !== 'application/json' ? getSchema('application/json') : null;
    if (jsonSchema) {
      app.log.debug('Using application/json schema as fallback');
      return jsonSchema;
    }

    return null;
  } catch (error) {
    app.log.error('Error extracting request body schema', String(error));
    return null;
  }
}

export function getJsonSchema(oas: Operation, app: { log: LogLayer }): JSONSchema | null {
  // For debugging our implementation
  app.log.debug('Operation:', oas.method.toUpperCase(), oas.path);
  app.log.debug(
    'Parameters:',
    oas
      .getParameters()
      .map((p) => `${p.name} (${p.in})`)
      .join(', '),
  );

  // Extract ALL parameters regardless of type (path, query, header, etc.)
  // We need separate parameters (not merged with body)
  const allParameters = oas.getParameters();

  // Group parameters by their location (path, query, etc.)
  const pathParams = allParameters.filter((p) => p.in === 'path');
  const queryParams = allParameters.filter((p) => p.in === 'query');
  const headerParams = allParameters.filter((p) => p.in === 'header');
  const cookieParams = allParameters.filter((p) => p.in === 'cookie');

  // Log parameter counts for debugging
  app.log.debug(
    `Parameter counts - path: ${pathParams.length}, query: ${queryParams.length}, header: ${headerParams.length}, cookie: ${cookieParams.length}`,
  );

  // Create a JSONSchema from all parameters manually
  const paramProperties: Record<string, Deref<OpenAPIV3.SchemaObject>> = {};
  const requiredParams: string[] = [];

  // Process all parameters
  for (const param of allParameters) {
    // Skip parameters without schemas
    if (!param.schema) continue;

    // Add property to schema - we need to be lenient with the schema type
    // as the OAS library returns a compatible but slightly different schema type
    paramProperties[param.name] = assertDeref(param.schema);

    // Add to required list if needed
    if (param.required) {
      requiredParams.push(param.name);
    }
  }

  // Create full parameter schema
  const paramSchema: Deref<JSONSchema> | null =
    allParameters.length > 0
      ? convertToJSONSchema({
          type: 'object',
          properties: paramProperties,
          required: requiredParams,
        })
      : null;

  // Log parameter schema for debugging
  if (paramSchema?.properties) {
    app.log.debug('Parameter properties:', Object.keys(paramSchema.properties).join(', '));
  }

  // Get request body schema through our dedicated method
  const requestBodySchema = extractRequestBodySchema(oas, app);
  if (requestBodySchema?.properties) {
    app.log.debug('Request body properties:', Object.keys(requestBodySchema.properties).join(', '));
  }

  // Case 1: Only request body schema exists
  if (requestBodySchema && !paramSchema) {
    return requestBodySchema;
  }

  // Case 2: Only parameter schema exists
  if (!requestBodySchema && paramSchema) {
    return { ...paramSchema };
  }

  // Case 3: Both schemas exist - merge them
  if (requestBodySchema && paramSchema) {
    // Combine both schemas ensuring path parameters are preserved
    const combinedSchema: JSONSchema = {
      type: 'object',
      properties: {
        ...(paramSchema.properties ?? {}),
        ...(requestBodySchema.properties ?? {}),
      },
      required: [...(paramSchema.required ?? []), ...(requestBodySchema.required ?? [])],
    };

    app.log.debug(
      'Combined schema properties:',
      combinedSchema.properties ? Object.keys(combinedSchema.properties).join(', ') : 'none',
    );

    return { ...combinedSchema };
  }

  // No schemas found
  return null;
}

export function isText(op: PathOperation): boolean {
  const format = op.getResponseAsJSONSchema(200).format;
  return format !== 'binary';
}

export function getParameters(op: PathOperation, app: { log: LogLayer }): z.ZodRawShape | null {
  // Get parameter schemas
  const params = op.getParametersAsJSONSchema({
    mergeIntoBodyAndMetadata: false, // Handle merging manually for proper combination
  }) as ReturnType<PathOperation['getParametersAsJSONSchema']> | null;

  // Get request body schema through our helper method
  const requestBodySchema = extractRequestBodySchema(op, app);

  // Both params and request body exist - create combined schema
  if (params?.[0]?.schema && requestBodySchema) {
    // Combine parameters and request body schemas
    const combinedSchema: JSONSchema = {
      type: 'object',
      properties: {
        ...((params[0].schema as JSONSchema).properties ?? {}),
        ...(requestBodySchema.properties ?? {}),
      },
      required: [
        ...((params[0].schema as JSONSchema).required ?? []),
        ...(requestBodySchema.required ?? []),
      ],
    };

    // Convert the combined schema to Zod raw shape
    return jsonSchemaObjectToZodRawShape(combinedSchema);
  }

  // Only params exist
  if (params?.[0]?.schema && !requestBodySchema) {
    return jsonSchemaObjectToZodRawShape(params[0].schema as JSONSchema);
  }

  // Only request body exists
  if (requestBodySchema && !params?.[0]?.schema) {
    return jsonSchemaObjectToZodRawShape(requestBodySchema);
  }

  // No schemas found
  return null;
}

async function toResponseContent(
  response: Response,
  log: LogLayer,
  ext: McpifyOperation,
): Promise<CallToolResult> {
  switch (ext.responseType) {
    case 'text/plain': {
      const text = await response.text();
      log.info(`Response from ${ext.describe()}:`, text);

      return {
        content: [
          {
            type: 'text',
            text,
          },
        ],
      };
    }

    case 'application/json': {
      const json = await response.json();
      log.info(`Response from ${ext.describe()}:`, JSON.stringify(json));

      // TODO: Limit the special-case embedding to situations where we know for sure that
      // we have a mapped resource.
      return {
        content: [
          {
            type: 'resource',
            resource: {
              uri: response.url,
              mimeType: ext.responseType,
              text: JSON.stringify(json),
            },
          },
        ],
      };
    }

    case 'application/x-www-form-urlencoded': {
      const formData = await response.formData();
      const search = new URLSearchParams(Object.entries(formData));
      log.info(`Response from ${ext.describe()}:`, JSON.stringify(formData));

      return {
        content: [
          {
            type: 'resource',
            resource: {
              uri: response.url,
              mimeType: ext.responseType,
              text: String(search),
            },
          },
        ],
      };
    }
  }
}
