import type { LogLayer } from 'loglayer';
import { parseTemplate } from 'url-template';

import type { QuickMcpOperation } from '../operation/ext.ts';

import { createSearchParams } from './request-utils.ts';
import type { BucketedArgs, JsonObject } from './request-utils.ts';
import { getBaseUrl } from './url-utils.ts';
import type { OasRequestArgs } from './url-utils.ts';

/**
 * Configuration for building a request
 */
interface RequestConfig {
  /** Application context with logging */
  app: { log: LogLayer };
  /** Operation to build request for */
  op: QuickMcpOperation;
  /** Arguments for the operation */
  args: OasRequestArgs;
}

/**
 * Intermediate result containing processed request parts
 */
interface BuiltRequest {
  /** Processed URL with query parameters */
  url: URL;
  /** Request initialization options */
  init: RequestInit;
}

/**
 * Builds a standard Request object from OpenAPI operation and arguments.
 *
 * @param app - Application context with logging capabilities
 * @param op - Operation to build request for
 * @param args - Arguments for the operation
 * @returns Constructed Request object
 */
export function buildRequest(
  app: { log: LogLayer },
  op: QuickMcpOperation,
  args: OasRequestArgs,
): Request {
  const { init, url } = buildRequestInit({ app, op, args });
  return new Request(url, init);
}

/**
 * Builds RequestInit and URL objects for a Request from OpenAPI operation and arguments.
 * This is useful when you need more control over the request creation process.
 *
 * @param config - Configuration for building the request
 * @returns Object containing RequestInit and URL objects
 */
export function buildRequestInit({ app, op, args }: RequestConfig): BuiltRequest {
  app.log.trace('Specified args', JSON.stringify(args, null, 2));

  const bucketed = op.bucketArgs(args as JsonObject);
  app.log.trace('Using bucketed args', JSON.stringify(bucketed, null, 2));

  const url = buildUrl({ app, op, bucketed });
  const init = buildRequestInitObject({ app, op, bucketed });

  return { init, url };
}

/**
 * Builds the URL for the request, including path parameters and query string
 */
function buildUrl({
  app,
  op,
  bucketed,
}: {
  app: { log: LogLayer };
  op: QuickMcpOperation;
  bucketed: BucketedArgs;
}): URL {
  const baseUrl = getBaseUrl(op.oas);
  app.log.debug(`Base URL resolution result: ${baseUrl || '(empty)'}`);

  app.log.trace(`Original operation path: ${op.path}`);
  app.log.trace(`Operation method: ${op.verb.uppercase}`);
  app.log.trace(`Operation ID: ${op.id}`);

  const template = parseTemplate(op.path);
  const templateParams = Object.fromEntries(
    Object.entries(bucketed.path).map(([k, v]) => [k, String(v)]),
  );

  app.log.debug('Template parameters:', JSON.stringify(templateParams, null, 2));
  const expandedPath = template.expand(templateParams);
  app.log.debug(`Path after template expansion: ${expandedPath}`);

  // Properly join baseUrl and path to ensure correct slash handling
  const joinedPath = expandedPath.startsWith('/')
    ? `${baseUrl}${expandedPath}`
    : `${baseUrl}/${expandedPath}`;

  app.log.debug(`Request path: ${joinedPath}`);
  const url = new URL(joinedPath);

  // Add query parameters
  if (Object.keys(bucketed.query).length > 0) {
    createSearchParams(bucketed.query, url.searchParams);
  }

  app.log.trace(
    'Initial URL constructed',
    JSON.stringify({ baseUrl, path: op.path, expandedPath, url: url.toString() }),
  );

  return url;
}

/**
 * Builds the RequestInit object with method, headers, and body
 */
function buildRequestInitObject({
  app,
  op,
  bucketed,
}: {
  app: { log: LogLayer };
  op: QuickMcpOperation;
  bucketed: BucketedArgs;
}): RequestInit {
  const { body: requestBody, contentType } = processRequestBody({ app, bucketed });
  const headers = createHeaders({ op, contentType });

  return {
    method: op.verb.uppercase, // Always use uppercase HTTP methods for standard compliance
    headers,
    body: requestBody ?? null,
  };
}

/**
 * Processes the request body and determines the content type
 */
function processRequestBody({
  app,
  bucketed,
}: {
  app: { log: LogLayer };
  bucketed: BucketedArgs;
}): { body?: string | FormData; contentType: string | null } {
  // Handle request body
  if (bucketed.body !== undefined) {
    // If body is provided directly as a string
    if (typeof bucketed.body === 'string') {
      return { body: bucketed.body, contentType: 'text/plain' };
    }
    // If body is an object, convert to JSON if appropriate
    else if (bucketed.body !== null && typeof bucketed.body === 'object') {
      try {
        return { body: JSON.stringify(bucketed.body), contentType: 'application/json' };
      } catch (jsonError) {
        app.log.debug('Error stringifying JSON body', String(jsonError));
      }
    }
  }
  // Handle form data
  else if (bucketed.formData) {
    const body =
      bucketed.formData instanceof URLSearchParams
        ? bucketed.formData.toString()
        : bucketed.formData;
    return { body, contentType: 'application/x-www-form-urlencoded' };
  }

  return { contentType: null };
}

/**
 * Creates headers for the request, including content type and accept headers
 */
function createHeaders({
  op,
  contentType,
}: {
  op: QuickMcpOperation;
  contentType: string | null;
}): Headers {
  const headers = new Headers();

  if (contentType) {
    headers.set('Content-Type', contentType);
  }

  headers.set('Accept', op.responseType);
  return headers;
}
