import Oas from 'oas';
import type { OpenAPIV3 } from 'openapi-types';
import qs from 'qs';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { McpifyOperation } from './operation/ext.ts';
import type { BucketLocation, PathOperation, OasRequestArgs } from './parameter-mapper.ts';
import { buildRequest } from './request/request-builder.ts';
import { testApp } from './test/create-oas.ts';
import type { Verb } from './utils.ts';

/**
 * Builds an OpenAPI operation object for testing purposes
 * @param verb HTTP verb for the operation
 * @param path Path template for the operation
 * @param options Optional configuration including query params and body schema
 * @returns A PathOperation object that can be used for testing
 */
export function buildOp(
  verb: Extract<Verb, 'get' | 'post' | 'put' | 'delete' | 'patch'>,
  path: string,
  options?: {
    query?: Record<string, string>;
    body?: z.ZodSchema;
    contentType?: string;
  },
): McpifyOperation {
  const paramNames = path
    .split('/')
    .filter((part) => part.startsWith('{') && part.endsWith('}'))
    .map((part) => part.slice(1, -1));

  const parameters: OpenAPIV3.ParameterObject[] = paramNames.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' } as OpenAPIV3.SchemaObject,
  }));

  if (options?.query) {
    parameters.push(
      ...Object.keys(options.query).map((name) => ({
        name,
        in: 'query',
        required: false,
        schema: { type: 'string' } as OpenAPIV3.SchemaObject,
      })),
    );
  }

  const operationObj: OpenAPIV3.OperationObject = {
    operationId: 'test',
    parameters,
    responses: {
      '200': {
        description: '200',
      },
    },
  };

  // Add request body configuration for methods that may have bodies
  if (verb !== 'get' && verb !== 'delete') {
    // If a body schema is provided, use it, otherwise create a generic one
    if (options?.body) {
      const contentType = options.contentType ?? 'application/json';
      const schema = zodToJsonSchema(options.body) as OpenAPIV3.SchemaObject;

      operationObj.requestBody = {
        content: {
          [contentType]: {
            schema,
          },
        },
        required: true,
      };
    } else {
      // For POST/PUT/PATCH with no defined schema, still allow a body
      operationObj.requestBody = {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: true,
            } as OpenAPIV3.SchemaObject,
          },
        },
        required: false,
      };
    }
  }

  const oas = new Oas({
    openapi: '3.0.0',
    info: {
      title: 'Test API',
      version: '1.0.0',
    },
    paths: {
      [path]: {
        [verb]: operationObj,
      },
    },
  });

  return McpifyOperation.from(oas.operation(path, verb), {}, testApp().app);
}

export function createOp(
  verb: Extract<Verb, 'get' | 'post' | 'put' | 'delete' | 'patch'>,
  params: Record<string, BucketLocation> = {},
  body?: z.ZodSchema,
  options: { contentType?: string } = {},
): {
  oas: Oas;
  op: PathOperation;
  build: (args: OasRequestArgs) => Request;
} {
  // Create parameters array from the provided params map
  const parameters = Object.entries(params).map(([name, location]) => ({
    name,
    in: location,
  })) as OpenAPIV3.ParameterObject[];

  const contentType = options.contentType ?? 'application/json';

  // Create a typed requestBody object
  const requestBodyContent = body
    ? {
        requestBody: {
          content: {
            [contentType]: {
              schema: zodToJsonSchema(body) as OpenAPIV3.SchemaObject,
            },
          },
        } as OpenAPIV3.RequestBodyObject,
      }
    : {};

  const { app } = testApp();

  // Create a standard response object
  const standardResponse: Record<string, OpenAPIV3.ResponseObject> = {
    '200': {
      description: '200',
      content: {
        'application/json': {
          schema: { type: 'object' } as OpenAPIV3.SchemaObject,
        },
      },
    },
  };

  // Create paths object with non-null assertions for strict type safety
  const pathItem: Record<string, OpenAPIV3.OperationObject> = {};
  const pathsObj: Record<string, Record<string, OpenAPIV3.OperationObject>> = {
    '/test/{id}': pathItem,
  };

  // Create a mapping of all verb operations
  const verbs: Partial<Record<Verb, OpenAPIV3.OperationObject>> = {};

  // Add the main test operation with proper typing
  pathItem[verb] = {
    operationId: 'test',
    parameters,
    ...requestBodyContent,
    responses: { ...standardResponse },
  } as OpenAPIV3.OperationObject;

  verbs[verb] = pathItem[verb];

  // Add operations for remaining verbs
  const supportedVerbs = ['get', 'post', 'put', 'delete', 'patch'] as const;

  for (const method of supportedVerbs) {
    if (method === verb) continue;

    // Add operation with proper typing
    pathItem[method] = {
      operationId: `${method}Test`,
      parameters,
      ...requestBodyContent,
      responses: { ...standardResponse },
    } as OpenAPIV3.OperationObject;

    verbs[method as Verb] = pathItem[method];
  }

  // Create the OAS object
  const oas = new Oas({
    openapi: '3.0.0',
    info: {
      title: 'Test API',
      version: '1.0.0',
    },
    paths: pathsObj,
  });

  // Get the operation object from Oas API
  const operation = oas.operation('/test/{id}', verb);

  // Create a path operation that matches the expected interface
  const op = operation as unknown as PathOperation;

  // Create the request builder function with correct parameter order
  const build = (args: OasRequestArgs): Request => {
    return buildRequest(app, oas, McpifyOperation.from(operation, {}, app), args);
  };

  return { oas, op, build };
}

describe('bucketArgs()', () => {
  it('buckets path/query params and ignores body when no requestBody', async () => {
    const { build } = createOp('get', { id: 'path', q: 'query' });

    const request = build({ id: '42', q: 'test', extra: 'unused' });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'GET',
      query: { q: 'test' },
    });
  });

  it('properly inserts arguments into the body when appropriate', async () => {
    const { build } = createOp(
      'post',
      { id: 'path', q: 'query' },

      z.object({
        extra: z.string(),
      }),
    );

    const request = build({ id: '42', q: 'test', extra: 'body' });

    await expect(request).toMatchRequest({
      url: '/test/42',
      query: { q: 'test' },
      method: 'POST',
      body: { extra: 'body' },
    });
  });

  it('can insert arguments into buckets as well as the body', async () => {
    const { build } = createOp(
      'post',
      { id: 'path', q: 'query' },
      z.object({
        extra: z.string(),
      }),
    );

    const request = build({ id: '42', q: 'test', extra: 'unused' });

    await expect(request).toMatchRequest({
      url: '/test/42',
      query: { q: 'test' },
      method: 'POST',
      body: { extra: 'unused' },
    });
  });

  it('handles header parameters correctly', async () => {
    const { build } = createOp('get', { id: 'path', apiKey: 'header' });

    const request = build({ id: '42', apiKey: 'secret-key' });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'GET',
      headers: new Headers({ apikey: 'secret-key' }),
    });
  });

  it('handles cookie parameters', async () => {
    const { build } = createOp('get', { id: 'path', sessionId: 'cookie' });

    const request = build({ id: '42', sessionId: 'abc123' });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'GET',
      headers: new Headers({ cookie: 'sessionId=abc123' }),
    });
  });

  it('handles different HTTP methods (PUT)', async () => {
    const { build } = createOp(
      'put',
      { id: 'path' },
      z.object({
        name: z.string(),
        value: z.number(),
      }),
    );

    const request = build({ id: '42', name: 'test', value: 123 });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'PUT',
      body: { name: 'test', value: 123 },
    });
  });

  it('handles different HTTP methods (DELETE)', async () => {
    const { build } = createOp('delete', { id: 'path' });

    const request = build({ id: '42' });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'DELETE',
    });
  });

  it('handles different HTTP methods (PATCH)', async () => {
    const { build } = createOp(
      'patch',
      { id: 'path' },
      z.object({
        value: z.number().optional(),
      }),
    );

    const request = build({ id: '42', value: 99 });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'patch',
      body: { value: 99 },
    });
  });

  it('handles array query parameters', async () => {
    const { build } = createOp('get', { id: 'path', tags: 'query' });

    const request = build({ id: '42', tags: ['foo', 'bar', 'baz'] });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'get',
      query: { tags: ['foo', 'bar', 'baz'] },
    });
  });

  it('handles nested object body parameters', async () => {
    const { build } = createOp(
      'post',
      { id: 'path' },
      z.object({
        user: z.object({
          name: z.string(),
          age: z.number(),
          address: z.object({
            city: z.string(),
            zipcode: z.string(),
          }),
        }),
      }),
    );

    const request = build({
      id: '42',
      user: {
        name: 'John Doe',
        age: 30,
        address: {
          city: 'San Francisco',
          zipcode: '94107',
        },
      },
    });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'POST',
      body: {
        user: {
          name: 'John Doe',
          age: 30,
          address: {
            city: 'San Francisco',
            zipcode: '94107',
          },
        },
      },
    });
  });

  it('handles application/x-www-form-urlencoded content type', async () => {
    const { build } = createOp(
      'post',
      { id: 'path' },
      z.object({
        name: z.string(),
        interests: z.array(z.string()),
        profile: z.object({
          age: z.number(),
          location: z.string(),
        }),
      }),
      { contentType: 'application/x-www-form-urlencoded' },
    );

    const request = build({
      id: '42',
      name: 'form data',
      interests: ['coding', 'testing'],
      profile: {
        age: 30,
        location: 'San Francisco',
      },
    });

    // Check headers and URL
    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/x-www-form-urlencoded',
      }),
      body: {
        name: 'form data',
        interests: ['coding', 'testing'],
        profile: {
          age: '30',
          location: 'San Francisco',
        },
      },
      // Only verify the content-type header but not the body content
    });

    // Now we should get properly URL-encoded form data
    const bodyText = await request.clone().text();
    // Check that the form data is URL-encoded format
    const parsedData = qs.parse(bodyText, { depth: Infinity });
    expect(parsedData).toEqual({
      name: 'form data',
      interests: ['coding', 'testing'],
      profile: {
        age: '30',
        location: 'San Francisco',
      },
    });
  });

  it('handles multiple parameter types together', async () => {
    const { build } = createOp(
      'post',
      {
        id: 'path',
        filter: 'query',
        apiVersion: 'header',
        sessionToken: 'cookie',
      },
      z.object({
        data: z.string(),
      }),
    );

    const request = build({
      id: '42',
      filter: 'active',
      apiVersion: 'v2',
      sessionToken: 'xyz789',
      data: 'payload',
    });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'POST',
      query: { filter: 'active' },
      headers: new Headers({
        apiversion: 'v2',
        cookie: 'sessionToken=xyz789',
        'content-type': 'application/json',
      }),
      body: { data: 'payload' },
    });
  });
});
