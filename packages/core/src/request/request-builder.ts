import type { LogLayer } from 'loglayer';
import type Oas from 'oas';
import type { Operation } from 'oas/operation';
import { parseTemplate } from 'url-template';

import { bucketArgs, createSearchParams } from './request-utils.ts';
import { getBaseUrl  } from './url-utils.ts';
import type {OasRequestArgs} from './url-utils.ts';

/**
 * Builds a standard Request object from OpenAPI operation and arguments.
 * 
 * @param app - Application context with logging capabilities
 * @param spec - OpenAPI specification
 * @param op - Operation to build request for
 * @param args - Arguments for the operation
 * @returns Constructed Request object
 */
export function buildRequest(
  app: { log: LogLayer },
  spec: Oas,
  op: Operation,
  args: OasRequestArgs,
): Request {
  const { init, url } = buildRequestInit(app, spec, op, args);
  return new Request(url, init);
}

/**
 * Builds RequestInit and URL objects for a Request from OpenAPI operation and arguments.
 * This is useful when you need more control over the request creation process.
 * 
 * @param app - Application context with logging capabilities
 * @param spec - OpenAPI specification
 * @param op - Operation to build request for
 * @param args - Arguments for the operation
 * @returns Object containing RequestInit and URL objects
 */
export function buildRequestInit(
  app: { log: LogLayer },
  spec: Oas,
  op: Operation,
  args: OasRequestArgs,
): { init: RequestInit; url: URL } {
  // Create an adapter that implements our PathOperation interface
  const pathOp = {
    method: op.method,
    path: op.path,
    api: op.api,
    getParameters: () => op.getParameters(),
    hasRequestBody: () => op.hasRequestBody(),
    getContentType: () => op.getContentType(),
    getOperationId: () => op.getOperationId(),
    getSummary: () => op.getSummary(),
    getDescription: () => op.getDescription(),
    getParametersAsJSONSchema: (options?: { mergeIntoBodyAndMetadata?: boolean }) => {
      // Convert the SchemaWrapper[] to our expected format with 'in' property
      return op.getParametersAsJSONSchema(options).map(schema => {
        // Type-safe way to handle the schema object
        const schemaObj = schema as unknown as { in?: string; schema: unknown };
        return {
          in: schemaObj.in ?? 'query', // Default to query if missing, using nullish coalescing
          schema: schemaObj.schema
        };
      });
    },
    getResponseAsJSONSchema: (options?: { format?: string }) => {
      // Handle the options object safely
      // The OAS library appears to require at least one argument
      return op.getResponseAsJSONSchema(options?.format ?? '200');
    },
    isJson: () => op.isJson(),
    isFormUrlEncoded: () => op.isFormUrlEncoded(),
  };

  const harData = bucketArgs(pathOp, args);

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
