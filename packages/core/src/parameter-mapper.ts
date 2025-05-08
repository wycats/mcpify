import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { merge } from 'allof-merge';
import type { LogLayer } from 'loglayer';
import type Oas from 'oas';
import type { Operation } from 'oas/operation';
import type { ServerVariable } from 'oas/types';
import { parseTemplate } from 'url-template';
import type { z } from 'zod';
import { jsonSchemaObjectToZodRawShape } from 'zod-from-json-schema';
import type { JSONSchema } from 'zod-from-json-schema';

import { HttpVerb } from './safety.ts';
import type { ChangeSafety } from './safety.ts';

export type PathOperations = ReturnType<Oas['getPaths']>[string];
export type PathOperation = PathOperations[keyof PathOperations];

export interface OperationExtensions {
  operationId?: string;
  ignore?: 'resource' | 'tool' | true;
  description?: string;
  safety?: ChangeSafety;
}

export class ExtendedOperation {
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
  }

  get #log(): LogLayer {
    return this.#app.log;
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

  get jsonSchema(): JSONSchema | null {
    const params = this.oas.getParametersAsJSONSchema({
      mergeIntoBodyAndMetadata: true,
    }) as ReturnType<PathOperation['getParametersAsJSONSchema']> | null;

    // Return empty schema when there are no parameters
    if (!params) {
      return null;
    }

    const [param] = params;

    if (!param) {
      return null;
    }

    return merge(param.schema) as JSONSchema;
  }

  get hasParameters(): boolean {
    return this.oas.getParameters().length > 0;
  }

  get parameters(): z.ZodRawShape | null {
    const schema = this.jsonSchema;

    if (schema) {
      return jsonSchemaObjectToZodRawShape(schema);
    } else {
      return null;
    }
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
interface JsonObject {
  [key: string]: JsonValue;
}

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
    method: op.method,
    headers: new Headers(),
    body: requestBody,
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
