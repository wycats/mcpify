import type { z } from 'zod';

import type { McpifyOperation } from '../operation/ext.ts';
import type { OasRequestArgs } from '../parameter-mapper.ts';
import { buildRequest } from '../request/request-builder.ts';
import type { Verb } from '../utils.ts';

import { createTestOperation } from './create-operation.ts';

/**
 * Location type for parameters
 */
export type BucketLocation = 'path' | 'query' | 'header' | 'cookie';

/**
 * Creates a test operation with the specified verb, parameters, and body schema.
 * This adapts our consolidated test utility to match the interface expected by existing tests.
 *
 * @param verb - The HTTP verb to use for the operation
 * @param params - Record mapping parameter names to their locations
 * @param bodySchema - Optional Zod schema for the request body
 * @param options - Additional options like content type
 * @returns Object with a build function that creates requests
 */
export function createTestOp(
  verb: Extract<Verb, 'get' | 'post' | 'put' | 'delete' | 'patch'>,
  params: Record<string, BucketLocation> = {},
  bodySchema?: z.ZodObject<z.ZodRawShape>,
  options: { contentType?: string; serverUrl?: string; path?: string } = {},
): {
  build: (args: OasRequestArgs) => Request;
  op: McpifyOperation; // Exposing the operation object for tests
} {
  // Separate params by type
  const pathParams: string[] = [];
  const queryParams: string[] = [];
  const headerParams: string[] = [];
  const cookieParams: string[] = [];

  for (const [name, location] of Object.entries(params)) {
    switch (location) {
      case 'path':
        pathParams.push(name);
        break;
      case 'query':
        queryParams.push(name);
        break;
      case 'header':
        headerParams.push(name);
        break;
      case 'cookie':
        cookieParams.push(name);
        break;
    }
  }

  // Create test operation
  const { client, log } = createTestOperation({
    method: verb,
    pathParams,
    queryParams,
    requestBodySchema: bodySchema,
    contentType: options.contentType,
    serverUrl: options.serverUrl,
    path: options.path,
  });

  // Create the request builder function that matches the expected interface
  const build = (args: OasRequestArgs): Request => {
    // Split arguments into different parameter buckets without mutation
    const headers = new Headers();
    const pathAndQueryParams: Record<string, unknown> = {};

    // Process all arguments immutably
    Object.entries(args).forEach(([key, value]) => {
      // Handle header parameters
      if (headerParams.includes(key)) {
        headers.set(key.toLowerCase(), String(value));
        return;
      }

      // Handle cookie parameters
      if (cookieParams.includes(key)) {
        headers.append('cookie', `${key}=${String(value)}`);
        return;
      }

      // Keep path and query parameters
      pathAndQueryParams[key] = value;
    });

    // Build the request
    return buildRequest({ log }, client.op, pathAndQueryParams);
  };

  return { build, op: client.op };
}
