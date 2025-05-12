import type { LogLayer } from 'loglayer';
import type Oas from 'oas';
import { parseTemplate } from 'url-template';

import type { PathOperation } from '../parameter-mapper.ts';

import { bucketArgs, createSearchParams } from './request-utils.ts';
import type { BucketedArgs } from './request-utils.ts';
import { getBaseUrl } from './url-utils.ts';
import type { OasRequestArgs } from './url-utils.ts';

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
  op: PathOperation,
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
  { log }: { log: LogLayer },
  spec: Oas,
  op: PathOperation,
  args: OasRequestArgs,
): { init: RequestInit; url: URL } {
  const bucketed = bucketArgs(op, args);

  log.debug('Calling operation with HAR Data', JSON.stringify(bucketed, null, 2));

  // Extract the base URL from the OAS specification
  const baseUrl = getBaseUrl(spec);

  // Log what we were able to find
  log.debug(`Base URL resolution result: ${baseUrl || '(empty)'}`);

  // Extract the path from the operation
  const path = typeof op.path === 'string' ? op.path : '';
  const template = parseTemplate(path);
  const url = new URL(template.expand(bucketed.path), baseUrl);

  // Add query parameters
  if (Object.keys(bucketed.query).length > 0) {
    createSearchParams(bucketed.query, url.searchParams);
  }

  log.debug('Initial URL constructed', JSON.stringify({ baseUrl, path, url }));

  const { body: requestBody, contentType } = getRequestBody(bucketed, { log });

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

function getRequestBody(
  bucketed: BucketedArgs,
  { log }: { log: LogLayer },
): { body?: string | FormData; contentType?: string } {
  // Handle request body
  if (bucketed.body !== undefined) {
    // If body is provided directly as a string
    if (typeof bucketed.body === 'string') {
      return { body: bucketed.body };
    }
    // If body is an object, convert to JSON if appropriate
    else if (bucketed.body !== null && typeof bucketed.body === 'object') {
      try {
        const body = JSON.stringify(bucketed.body);
        return { body, contentType: 'application/json' };
      } catch (jsonError) {
        log.debug('Error stringifying JSON body', String(jsonError));
        throw jsonError;
      }
    }
  }
  // Handle form data
  else if (bucketed.formData) {
    if (bucketed.formData instanceof URLSearchParams) {
      return {
        body: bucketed.formData.toString(),
        contentType: 'application/x-www-form-urlencoded',
      };
    } else {
      return { body: bucketed.formData, contentType: 'application/x-www-form-urlencoded' };
    }
  }

  return {};
}
