import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import oasToHar from '@readme/oas-to-har';
import { merge } from 'allof-merge';
import type { LogLayer } from 'loglayer';
import type Oas from 'oas';
import type { DataForHAR } from 'oas/types';
import type { z } from 'zod';
import { jsonSchemaObjectToZodRawShape } from 'zod-from-json-schema';
import type { JSONSchema } from 'zod-from-json-schema';

import type { App } from './main.ts';
import type { ChangeSafety, HttpVerb } from './safety.ts';

export type PathOperations = ReturnType<Oas['getPaths']>[string];
export type PathOperation = PathOperations[keyof PathOperations];

export interface OperationExtensions {
  operationId?: string;
  ignore?: 'resource' | 'tool' | true;
  description?: string;
  safety?: ChangeSafety;
}

export class ExtendedOperation {
  #app: App;
  #verb: HttpVerb;
  #operation: PathOperation;
  #extensions: OperationExtensions;

  constructor(app: App, verb: HttpVerb, operation: PathOperation, extensions: OperationExtensions) {
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
    if (!params || params.length === 0) {
      return null;
    }

    const { schema } = params[0];
    return merge(schema) as JSONSchema;
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

  async invoke(
    spec: Oas,
    args: z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>,
  ): Promise<CallToolResult> {
    const harData = bucketArgs(this, args);

    this.#log.debug('Calling operation with HAR Data', JSON.stringify(harData, null, 2));

    // 1) Get the minimal HAR entry
    const { request } = oasToHar(spec, this.oas, harData).log.entries[0];

    this.#log.debug('Calling operation with HAR Data', JSON.stringify(request, null, 2));

    // 2) Build fetch init
    const headers = new Headers(request.headers.map((h) => [h.name, h.value] as [string, string]));

    const init: RequestInit = {
      method: request.method,
      headers,
      body: request.postData?.text,
    };

    // 3) Fire it off
    const response = await fetch(request.url, init);

    return this.#toContent(this, response, request.url, this.#responseType);
  }

  async read(
    spec: Oas,
    args: z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>,
  ): Promise<ReadResourceResult> {
    const harData = bucketArgs(this, args);

    this.#log.debug('Calling operation with HAR Data', JSON.stringify(harData, null, 2));

    // 1) Get the minimal HAR entry
    const { request } = oasToHar(spec, this.oas, harData).log.entries[0];

    this.#log.debug('Calling operation with HAR Data', JSON.stringify(request, null, 2));

    // 2) Build fetch init
    const headers = new Headers(request.headers.map((h) => [h.name, h.value] as [string, string]));

    const init: RequestInit = {
      method: request.method,
      headers,
      body: request.postData?.text,
    };

    // 3) Fire it off
    const response = await fetch(request.url, init);

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

export function bucketArgs(
  operation: ExtendedOperation,
  args: Record<string, unknown>,
): DataForHAR {
  const values: DataForHAR = {
    path: {},
    query: {},
    header: {},
    cookie: {},
    formData: {},
  };

  const consumed = new Set<string>();
  for (const p of operation.oas.getParameters()) {
    const val = args[p.name];
    consumed.add(p.name);
    if (val === undefined) continue;

    (values[p.in] as Record<string, unknown>)[p.name] = val;
  }

  const leftovers: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (consumed.has(k) || ['body', 'formData', 'auth', 'server'].includes(k)) continue;
    leftovers[k] = v;
  }

  if (!operation.oas.hasRequestBody()) return values;

  const mime = operation.oas.getContentType();
  if (mime === 'application/x-www-form-urlencoded') {
    values.formData = { ...(values.formData ?? {}), ...leftovers };
  } else {
    // JSON, XML, binary, multipart, custom, …
    if (
      mime === 'application/json' &&
      typeof values.body === 'object' &&
      !Array.isArray(values.body)
    ) {
      // merge into existing JSON object
      values.body = { ...(values.body as Record<string, unknown>), ...leftovers };
    } else if (Object.keys(values.body ?? {}).length === 0) {
      values.body = Object.keys(leftovers).length
        ? leftovers
        : (values.body as Record<string, unknown>);
    }
  }

  return values;
}
