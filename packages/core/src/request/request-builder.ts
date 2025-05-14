import type { LogLayer } from 'loglayer';
import { parseTemplate } from 'url-template';

import type { McpifyOperation } from '../operation/ext.ts';

import { createSearchParams } from './request-utils.ts';
import { getBaseUrl } from './url-utils.ts';
import type { OasRequestArgs } from './url-utils.ts';

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
  op: McpifyOperation,
  args: OasRequestArgs,
): Request {
  const { init, url } = buildRequestInit(app, op, args);

  return new Request(url, init);
}

/**
 * Builds RequestInit and URL objects for a Request from OpenAPI operation and arguments.
 * This is useful when you need more control over the request creation process.
 *
 * @param app - Application context with logging capabilities
 * @param op - Operation to build request for
 * @param args - Arguments for the operation
 * @returns Object containing RequestInit and URL objects
 */

export function buildRequestInit(
  app: { log: LogLayer },
  op: McpifyOperation,
  args: OasRequestArgs,
): { init: RequestInit; url: URL } {
  const bucketed = op.bucketArgs(args);

  app.log.debug('Calling operation with HAR Data', JSON.stringify(bucketed, null, 2));

  // Extract the base URL from the OAS specification
  const baseUrl = getBaseUrl(op.oas);

  // Log what we were able to find
  app.log.debug(`Base URL resolution result: ${baseUrl || '(empty)'}`);

  // Extract the path from the operation
  const path = op.path;
  let url: URL | null = null;
  const template = parseTemplate(path);
  const pathParams = bucketed.path;
  const expandedPath = template.expand(
    Object.fromEntries(Object.entries(pathParams).map(([k, v]) => [k, String(v)])),
  );
  const baseURL = getBaseUrl(op.oas);
  url = new URL(`${baseURL}${expandedPath}`);

  // Add query parameters
  if (Object.keys(bucketed.query).length > 0) {
    createSearchParams(bucketed.query, url.searchParams);
  }

  app.log.debug('Initial URL constructed', JSON.stringify({ baseUrl, path, url }));
  app.log.debug('Initial URL constructed', JSON.stringify({ baseUrl, path, url }));

  let requestBody: string | FormData | undefined;
  let contentType: string | null = null;

  // Handle request body
  if (bucketed.body !== undefined) {
    // If body is provided directly as a string
    if (typeof bucketed.body === 'string') {
      requestBody = bucketed.body;
    }
    // If body is an object, convert to JSON if appropriate
    else if (bucketed.body !== null && typeof bucketed.body === 'object') {
      try {
        requestBody = JSON.stringify(bucketed.body);
        contentType = 'application/json';
      } catch (jsonError) {
        app.log.debug('Error stringifying JSON body', String(jsonError));
      }
    }
  }
  // Handle form data
  else if (bucketed.formData) {
    if (bucketed.formData instanceof URLSearchParams) {
      requestBody = bucketed.formData.toString(); // Convert URLSearchParams to string for proper encoding
    } else {
      requestBody = bucketed.formData;
    }
    contentType = 'application/x-www-form-urlencoded';
  }

  // Create the RequestInit object
  const init: RequestInit = {
    method: op.verb.uppercase, // Always use uppercase HTTP methods for standard compliance
    headers: new Headers(),
    body: requestBody ?? null,
  };

  // Set content type if we have one
  if (contentType) {
    (init.headers as Headers).set('Content-Type', contentType);
  }

  return { init, url };
}
