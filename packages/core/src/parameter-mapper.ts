import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { LogLayer } from 'loglayer';
import type Oas from 'oas';
import type { Operation } from 'oas/operation';
import type { OpenAPIV3 } from 'openapi-types';
import { z } from 'zod';
import type { JSONSchema } from 'zod-from-json-schema';
import { jsonSchemaObjectToZodRawShape } from 'zod-from-json-schema';

import type { ServerVariable } from './request/index.ts';
import { parseTemplate } from './request/index.ts';
import type { ChangeSafety } from './safety.ts';
import { HttpVerb } from './safety.ts';
import { ResponseSchemaExtractor } from './schema/response-schema.ts';

export type PathOperations = ReturnType<Oas['getPaths']>[string];
export type PathOperation = PathOperations[keyof PathOperations];

export interface OperationExtensions {
  operationId?: string;
  ignore?: 'resource' | 'tool' | true;
  description?: string;
  safety?: ChangeSafety;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Deref<T> = T & Exclude<T, { $ref: any }>;

export class ExtendedOperation {
  // Response schema extractor for handling response schemas
  readonly #responseSchemaExtractor: ResponseSchemaExtractor;
  static from(
    operation: PathOperation,
    extensions: OperationExtensions,
    options: { log: LogLayer },
  ): ExtendedOperation | null {
    const verb = HttpVerb.from(operation.method);
    if (!verb) return null;

    return new ExtendedOperation(options, verb, operation, extensions);
  }

  #app: { log: LogLayer };
  #verb: HttpVerb;
  #operation: PathOperation;
  #extensions: OperationExtensions;

  constructor(
    app: { log: LogLayer },
    verb: HttpVerb,
    operation: PathOperation,
    extensions: OperationExtensions,
  ) {
    this.#app = app;
    this.#verb = verb;
    this.#operation = operation;
    this.#extensions = extensions;
    // Initialize the response schema extractor
    // TypeScript needs help understanding that our operation object has the required properties
    // We use a type assertion to avoid spreading class instances which would lose prototypes
    this.#responseSchemaExtractor = new ResponseSchemaExtractor(
      // Cast to unknown first to avoid direct type assertion errors
      operation as unknown as Oas & { path: string; method: string },
      app.log,
    );
  }

  get #log(): LogLayer {
    return this.#app.log;
  }

  /**
   * Returns whether this operation has any parameters
   * @returns true if the operation has any parameters (path, query, header, etc.)
   */
  get hasParameters(): boolean {
    return this.oas.getParameters().length > 0;
  }

  isIgnored(tool: 'resource' | 'tool'): boolean {
    const ignore = this.#extensions.ignore;

    if (ignore === true) return true;

    return ignore === tool;
  }

  /**
   * An operation is a resource if:
   *
   * - It has no parameters or only path parameters
   * - It is a GET operation
   * - It doesn't specify annotations other than `readonly` in the `x-mcpify` extension
   * - It doesn't specify `ignore: 'resource'` or `ignore: true`
   */
  get isResource(): boolean {
    if (this.#verb.uppercase !== 'GET') {
      return false;
    }

    const params = this.oas.getParameters();
    if (params.some((p) => p.in !== 'path')) {
      return false;
    }

    if (this.oas.hasRequestBody()) {
      return false;
    }

    const extensions = this.#extensions;

    if (extensions.ignore === 'resource' || extensions.ignore === true) {
      return false;
    }

    if (extensions.safety && extensions.safety.access !== 'readonly') {
      return false;
    }

    return true;
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
      return `${this.#verb.uppercase} ${this.oas.path}`;
    }

    return [this.oas.getSummary(), this.oas.getDescription()].filter(Boolean).join(' - ');

    // TODO: Incorporate examples and other metadata
  }

  describe(): string {
    return `${this.verb.uppercase} ${this.oas.path}`;
  }

  get verb(): HttpVerb {
    return this.#verb;
  }

  get oas(): PathOperation {
    return this.#operation;
  }

  get extensions(): OperationExtensions {
    return this.#extensions;
  }

  get isText(): boolean {
    const format = this.oas.getResponseAsJSONSchema(200).format;
    return format !== 'binary';
  }

  /**
   * Get the parameters schema as a Zod raw shape for validation
   *
   * @returns A Zod raw shape or null if no parameters exist
   */
  get parameters(): z.ZodRawShape | null {
    // Get parameter schemas
    const params = this.oas.getParametersAsJSONSchema({
      mergeIntoBodyAndMetadata: false, // Handle merging manually for proper combination
    }) as ReturnType<PathOperation['getParametersAsJSONSchema']> | null;

    // Get request body schema through our helper method
    const requestBodySchema = this.#extractRequestBodySchema();

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

  /**
   * Extract request body schema from the OpenAPI operation.
   * Uses a careful, safe approach to extracting nested properties.
   */
  #extractRequestBodySchema(): JSONSchema | null {
    if (!this.oas.hasRequestBody()) {
      return null;
    }

    try {
      // Default to application/json if no content type is specified
      // The OAS library should always return a string (possibly empty) for getContentType()
      const contentType = this.oas.getContentType() || 'application/json';

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

      const rawOas = this.oas;
      // Type cast to our defined interface after extraction for type safety
      const api = rawOas.api as ApiObject;

      // Function to safely retrieve schema using properly typed structures
      const getSchema = (cType: string): JSONSchema | null => {
        try {
          // Navigate the structure with type safety
          const path = api.paths?.[this.oas.path];
          const method = path?.[this.oas.method];
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
        this.#log.debug('Found request body schema for content type', contentType);
        return schema;
      }

      // Fall back to application/json if available
      const jsonSchema = contentType !== 'application/json' ? getSchema('application/json') : null;
      if (jsonSchema) {
        this.#log.debug('Using application/json schema as fallback');
        return jsonSchema;
      }

      return null;
    } catch (error) {
      this.#log.error('Error extracting request body schema', String(error));
      return null;
    }
  }

  get jsonSchema(): JSONSchema | null {
    // For debugging our implementation
    this.#log.debug('Operation:', this.oas.method.toUpperCase(), this.oas.path);
    this.#log.debug(
      'Parameters:',
      this.oas
        .getParameters()
        .map((p) => `${p.name} (${p.in})`)
        .join(', '),
    );

    // Extract ALL parameters regardless of type (path, query, header, etc.)
    // We need separate parameters (not merged with body)
    const allParameters = this.oas.getParameters();

    // Group parameters by their location (path, query, etc.)
    const pathParams = allParameters.filter((p) => p.in === 'path');
    const queryParams = allParameters.filter((p) => p.in === 'query');
    const headerParams = allParameters.filter((p) => p.in === 'header');
    const cookieParams = allParameters.filter((p) => p.in === 'cookie');

    // Log parameter counts for debugging
    this.#log.debug(
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
      this.#log.debug('Parameter properties:', Object.keys(paramSchema.properties).join(', '));
    }

    // Get request body schema through our dedicated method
    const requestBodySchema = this.#extractRequestBodySchema();
    this.#log.debug('Request body schema:', requestBodySchema ? 'found' : 'not found');
    if (requestBodySchema?.properties) {
      this.#log.debug(
        'Request body properties:',
        Object.keys(requestBodySchema.properties).join(', '),
      );
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

      this.#log.debug(
        'Combined schema properties:',
        combinedSchema.properties ? Object.keys(combinedSchema.properties).join(', ') : 'none',
      );

      return { ...combinedSchema };
    }

    // No schemas found
    return null;
  }

  /**
   * Get a list of all response status codes defined in the API operation
   *
   * This method retrieves the list of status codes from the OpenAPI specification.
   * It is used internally to collect available response schemas.
   */
  #getResponseStatusCodes(): string[] {
    return this.#responseSchemaExtractor.getStatusCodes();
  }

  /**
   * Get response schema for a specific status code.
   * Will try to find a schema for the specified status code, falling back to 'default' if not found.
   *
   * @param statusCode - HTTP status code (e.g. '200', '404', 'default')
   * @returns JSON Schema for the response
   * @example
   * const schema = operation.getResponseSchema('200');
   * // Use the schema for validation or documentation
   */
  getResponseSchema(statusCode: string): JSONSchema | null {
    return this.#responseSchemaExtractor.getSchema(statusCode);
  }

  /**
   * Get all response schemas defined for this operation
   *
   * This getter returns all available response schemas indexed by their status codes.
   * The result is cached for better performance on subsequent calls.
   *
   * @returns Record of status codes to JSON Schema objects
   *
   * @example
   * ```typescript
   * const schemas = operation.responseSchemas;
   * // Access individual schemas by status code
   * const okSchema = schemas['200'];
   * const errorSchema = schemas['400'];
   * ```
   */
  get responseSchemas(): Record<string, JSONSchema> {
    const result: Record<string, JSONSchema> = {};

    // Extract response status codes from the OpenAPI spec
    const statusCodes = this.#getResponseStatusCodes();

    // Get schema for each status code
    for (const code of statusCodes) {
      const schema = this.getResponseSchema(code);
      if (schema) {
        result[code] = schema;
      }
    }

    return result;
  }

  /**
   * Get all response schemas converted to Zod schemas for runtime validation
   *
   * This getter converts all available JSON Schemas to Zod schemas for runtime
   * type validation. The result is cached for better performance.
   *
   * @returns Record of status codes to Zod schema objects
   *
   * @example
   * ```typescript
   * const schemas = operation.zodResponseSchemas;
   *
   * // Validate a response against the schema
   * try {
   *   const validatedData = schemas['200'].parse(responseData);
   * } catch (error) {
   *   console.error('Response validation failed:', error);
   * }
   * ```
   */
  get zodResponseSchemas(): Record<string, z.ZodObject<z.ZodRawShape>> {
    const schemas = this.responseSchemas;
    const result: Record<string, z.ZodObject<z.ZodRawShape>> = {};

    // Convert each JSONSchema to a Zod schema
    for (const [code, schema] of Object.entries(schemas)) {
      try {
        const zodSchema = z.object(jsonSchemaObjectToZodRawShape(schema));
        result[code] = zodSchema;
      } catch (error) {
        this.#log.error(
          `Error converting response schema for status ${code} to Zod:`,
          String(error),
        );
        // Skip this schema if conversion fails
      }
    }

    return result;
  }

  buildRequest(spec: Oas, args: z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>): Request {
    const harData = bucketArgs(this.oas, args);

    this.#log.debug('Calling operation with HAR Data', JSON.stringify(harData, null, 2));

    // 1) Get the minimal HAR entry
    const request = buildRequest(this.#app, spec, this.oas, harData);

    this.#log.debug('Calling operation with HAR Data', JSON.stringify(request, null, 2));

    return request;
  }

  async invoke(
    spec: Oas,
    args: z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>,
  ): Promise<CallToolResult> {
    const request = this.buildRequest(spec, args);

    const response = await fetch(request);

    return this.#toContent(this, response, request.url, this.#responseType);
  }

  async read(
    spec: Oas,
    args: z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>,
  ): Promise<ReadResourceResult> {
    const harData = bucketArgs(this.oas, args);

    this.#log.debug('Calling operation with Request Init', JSON.stringify(harData, null, 2));

    // 1) Get the minimal HAR entry
    const { init, url } = buildRequestInit(this.#app, spec, this.oas, harData);

    this.#log.debug('Calling operation with Request Init', JSON.stringify(init, null, 2));

    const request = new Request(url, init);

    // 3) Fire it off
    const response = await fetch(request);

    return this.#readResource(this, response, request.url);
  }

  async #readResource(
    operation: ExtendedOperation,
    response: Response,
    url: string,
  ): Promise<ReadResourceResult> {
    const mime = response.headers.get('Content-Type');
    if (operation.isText) {
      return {
        contents: [{ uri: url, mimeType: mime ?? 'text/plain', text: await response.text() }],
      };
    } else {
      const blob = await response.arrayBuffer();
      // base64 encode
      const encoded = Buffer.from(blob).toString('base64');
      return {
        contents: [{ uri: url, mimeType: mime ?? 'application/octet-stream', blob: encoded }],
      };
    }
  }

  async #toContent(
    operation: ExtendedOperation,
    response: Response,
    url: string,
    type: OasResponseType,
  ): Promise<CallToolResult> {
    switch (type) {
      case 'text/plain': {
        const text = await response.text();
        this.#log.info(`Response from ${operation.describe()}:`, text);

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
        this.#log.info(`Response from ${operation.describe()}:`, JSON.stringify(json));

        // TODO: Limit the special-case embedding to situations where we know for sure that
        // we have a mapped resource.
        return {
          content: [
            {
              type: 'resource',
              resource: {
                uri: url,
                mimeType: type,
                text: JSON.stringify(json),
              },
            },
          ],
        };
      }

      case 'application/x-www-form-urlencoded': {
        const formData = await response.formData();
        this.#log.info(`Response from ${operation.describe()}:`, JSON.stringify(formData));

        const content = Array.from(formData.entries()).flatMap(([name, value]) =>
          typeof value === 'string'
            ? [
                {
                  type: 'resource',
                  resource: {
                    uri: url,
                    mimeType: type,
                    text: `${name}=${value}`,
                  },
                } satisfies CallToolResult['content'][number],
              ]
            : [],
        );

        return { content };
      }
    }
  }

  get #responseType(): OasResponseType {
    const oas = this.oas;

    if (oas.isJson()) {
      return 'application/json';
    } else if (oas.isFormUrlEncoded()) {
      return 'application/x-www-form-urlencoded';
    } else {
      return 'text/plain';
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

type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonObject = Record<string, JsonValue>;

interface BucketedArgs {
  body?: JsonValue;
  cookie?: Record<string, string>;
  formData?: FormData | URLSearchParams | null; // For form-urlencoded or multipart form data
  header?: Record<string, string>;
  path?: Record<string, string>;
  query?: Record<string, JsonValue>;
  server?: {
    selected: number;
    variables?: ServerVariable;
  };
}

export function bucketArgs(operation: PathOperation, args: JsonObject): BucketedArgs {
  const values: BucketedArgs = {
    path: {},
    query: {},
    header: {},
    cookie: {},
    formData: null as FormData | URLSearchParams | null,
  };

  const consumed = new Set<string>();
  for (const p of operation.getParameters()) {
    const val = args[p.name];
    consumed.add(p.name);
    if (val === undefined) continue;

    (values[p.in as keyof BucketedArgs] as Record<string, unknown>)[p.name] = val;
  }

  const leftovers: JsonObject = {};
  for (const [k, v] of Object.entries(args)) {
    if (consumed.has(k) || ['body', 'formData', 'auth', 'server'].includes(k)) continue;
    leftovers[k] = v;
  }

  if (!operation.hasRequestBody()) return values;

  const mime = operation.getContentType();
  if (mime === 'application/x-www-form-urlencoded') {
    values.formData = createFormData(leftovers);
  } else {
    // JSON, XML, binary, multipart, custom, …
    if (
      mime === 'application/json' &&
      typeof values.body === 'object' &&
      !Array.isArray(values.body)
    ) {
      // merge into existing JSON object
      values.body = { ...values.body, ...leftovers };
    } else if (Object.keys(values.body ?? {}).length === 0) {
      values.body = Object.keys(leftovers).length ? leftovers : values.body;
    }
  }

  return values;
}

export type OasRequestArgs = z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>;

export function buildRequest(
  app: { log: LogLayer },
  spec: Oas,
  op: Operation,
  args: OasRequestArgs,
): Request {
  const { init, url } = buildRequestInit(app, spec, op, args);

  return new Request(url, init);
}

export function buildRequestInit(
  app: { log: LogLayer },
  spec: Oas,
  op: Operation,
  args: OasRequestArgs,
): { init: RequestInit; url: URL } {
  const harData = bucketArgs(op, args);

  app.log.debug('Calling operation with HAR Data', JSON.stringify(harData, null, 2));

  // Extract the base URL from the OAS specification
  const baseUrl = getBaseUrl(spec, 'https://api.example.com');

  // Log what we were able to find
  app.log.debug(`Base URL resolution result: ${baseUrl || '(empty)'}`);

  // Extract the path from the operation
  const path = typeof op.path === 'string' ? op.path : '';
  let url: URL | null = null;
  const template = parseTemplate(path);
  const pathParams = harData.path ?? {};
  const expandedPath = template.expand(
    Object.fromEntries(Object.entries(pathParams).map(([k, v]) => [k, String(v)])),
  );
  const baseURL = getBaseUrl(spec, 'https://api.example.com');
  url = new URL(`${baseURL}${expandedPath}`);

  // Add query parameters
  if (harData.query && Object.keys(harData.query).length > 0) {
    createSearchParams(harData.query, url.searchParams);
  }

  app.log.debug('Initial URL constructed', JSON.stringify({ baseUrl, path, url }));
  app.log.debug('Initial URL constructed', JSON.stringify({ baseUrl, path, url }));

  let requestBody: string | FormData | undefined;
  let contentType: string | null = null;

  // Handle request body
  if (harData.body !== undefined) {
    // If body is provided directly as a string
    if (typeof harData.body === 'string') {
      requestBody = harData.body;
    }
    // If body is an object, convert to JSON if appropriate
    else if (harData.body !== null && typeof harData.body === 'object') {
      try {
        requestBody = JSON.stringify(harData.body);
        contentType = 'application/json';
      } catch (jsonError) {
        app.log.debug('Error stringifying JSON body', String(jsonError));
      }
    }
  }
  // Handle form data
  else if (harData.formData) {
    if (harData.formData instanceof URLSearchParams) {
      requestBody = harData.formData.toString(); // Convert URLSearchParams to string for proper encoding
    } else {
      requestBody = harData.formData;
    }
    contentType = 'application/x-www-form-urlencoded';
  }

  // Create the RequestInit object
  const init: RequestInit = {
    method: op.method.toUpperCase(), // Always use uppercase HTTP methods for standard compliance
    headers: new Headers(),
    body: requestBody ?? null,
  };

  // Set content type if we have one
  if (contentType) {
    (init.headers as Headers).set('Content-Type', contentType);
  }

  return { init, url };
}

function createSearchParams(
  input: Record<string, JsonValue>,
  params = new URLSearchParams(),
): URLSearchParams {
  for (const [key, value] of Object.entries(input)) {
    appendData(params, key, value);
  }
  // Debug statement removed (no access to app.log in this scope)
  return params;
}

function createFormData(input: Record<string, JsonValue>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    appendData(params, key, value);
  }
  return params;
}

function appendData(formData: FormData | URLSearchParams, key: string, input: JsonValue): void {
  switch (typeof input) {
    case 'string':
    case 'number':
    case 'boolean':
      formData.append(key, String(input));
      break;
    case 'object':
      if (input === null) {
        formData.append(key, '');
        break;
      }
      if (Array.isArray(input)) {
        input.forEach((v) => {
          appendData(formData, key, v);
        });
      } else {
        Object.entries(input).forEach(([k, v]) => {
          appendData(formData, `${key}[${k}]`, v);
        });
      }
      break;
    default:
      formData.append(key, String(input));
  }
}

function getBaseUrl(oas: Oas, fallback: string): string {
  const url = oas.url() || fallback;

  // Ensure the base URL doesn't end with a slash
  if (url.endsWith('/')) {
    return url.slice(0, -1);
  }

  return url;
}

function assertDeref<T extends object>(obj: T): Deref<T> {
  if ('$ref' in obj) {
    throw new Error('Unexpected $ref in object. Expected all $refs to be dereferenced.');
  }
  return obj as Deref<T>;
}

function convertToJSONSchema(obj: Deref<OpenAPIV3.SchemaObject>): JSONSchema {
  return obj as unknown as JSONSchema;
}
