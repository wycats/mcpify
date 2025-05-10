// We define our own PathOperation interface to avoid direct dependency on OAS implementation
import type { z } from 'zod';

// Define interfaces for operating with the OAS library

/**
 * Path operation interface for an OpenAPI operation
 */
export interface PathOperation {
  method: string;
  path: string;
  api: unknown;
  getParameters(): { name: string; in: 'path' | 'query' | 'header' | 'cookie'; required?: boolean; schema?: unknown }[];
  hasRequestBody(): boolean;
  getContentType(): string | null;
  // Additional methods needed to match the existing oas library
  getOperationId(): string | null;
  getSummary(): string | null;
  getDescription(): string | null;
  getParametersAsJSONSchema(options?: { mergeIntoBodyAndMetadata?: boolean }): { in: string; schema: unknown }[];
  getResponseAsJSONSchema(options?: { format?: string }): unknown;
  isJson(): boolean;
  isFormUrlEncoded(): boolean;
}

/**
 * Server variable interface for OpenAPI server variables
 */
export interface ServerVariable {
  default?: string;
  description?: string;
  enum?: string[];
}

/**
 * Type for JSON values in parameters
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Type for JSON objects in parameters
 */
export type JsonObject = Record<string, JsonValue>;

/**
 * Location where a parameter can be placed in an HTTP request
 */
export type BucketLocation = 'path' | 'query' | 'header' | 'cookie';

/**
 * Minimal interface for operations used by bucketArgs
 */
export interface BucketOperation {
  oas: {
    getParameters(): { name: string; in: 'path' | 'query' | 'header' | 'cookie' }[];
    hasRequestBody(): boolean;
    getContentType(): string | null;
  };
}

/**
 * Structured representation of request parameters by their location
 */
export interface BucketedArgs {
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

/**
 * Type for OpenAPI request arguments
 */
export type OasRequestArgs = z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>;

/**
 * Organizes operation arguments into their appropriate locations (path, query, header, etc.)
 * 
 * @param operation - OpenAPI operation
 * @param args - Arguments to organize
 * @returns Organized arguments by location
 */
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
    // JSON, XML, binary, multipart, custom, etc.
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

/**
 * Creates URLSearchParams from a record of key-value pairs
 * 
 * @param input - Object containing parameter values
 * @param params - Optional existing URLSearchParams to add to
 * @returns URLSearchParams object with all parameters
 */
export function createSearchParams(
  input: Record<string, JsonValue>,
  params = new URLSearchParams(),
): URLSearchParams {
  for (const [key, value] of Object.entries(input)) {
    appendData(params, key, value);
  }
  return params;
}

/**
 * Creates form data from a record of key-value pairs
 * 
 * @param input - Object containing form field values
 * @returns URLSearchParams object with form data
 */
export function createFormData(input: Record<string, JsonValue>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    appendData(params, key, value);
  }
  return params;
}

/**
 * Appends data to form data or search params, handling nested objects and arrays
 * 
 * @param formData - FormData or URLSearchParams to append to
 * @param key - Key for the parameter
 * @param input - Value to append
 */
export function appendData(formData: FormData | URLSearchParams, key: string, input: JsonValue): void {
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
