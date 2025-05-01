import { LogLayer, TestLoggingLibrary, TestTransport } from 'loglayer';
import Oas from 'oas';
import type { OpenAPIV3 } from 'openapi-types';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { BucketLocation, PathOperation, OasRequestArgs } from './parameter-mapper.ts';
import { buildRequest } from './parameter-mapper.ts';
import type { Verb } from './utils.ts';

type SchemaObject = OpenAPIV3.SchemaObject;

function createOp(
  verb: Extract<Verb, 'get' | 'post' | 'put' | 'delete' | 'patch'>,
  params: Record<string, BucketLocation>,
  body?: z.ZodSchema,
  options: { contentType?: string } = {},
): {
  oas: Oas;
  op: PathOperation;
  log: LogLayer;
  testLog: TestLoggingLibrary;
  build: (args: OasRequestArgs) => Request;
} {
  const parameters = Object.entries(params).map(([name, location]) => ({ name, in: location }));

  const bodySchema = body ? (zodToJsonSchema(body) as SchemaObject) : undefined;
  const contentType = options.contentType ?? 'application/json';

  const test = new TestLoggingLibrary();
  const log = new LogLayer({
    transport: new TestTransport({
      logger: test,
    }),
  });

  const paths: Record<string, Record<string, unknown>> = {
    '/test/{id}': {
      get: {
        operationId: 'test',
        parameters,
        requestBody: body
          ? {
              content: {
                [contentType]: {
                  schema: bodySchema,
                },
              },
            }
          : undefined,
        responses: {
          200: {
            description: '200',
            content: {
              'application/json': { schema: { type: 'object' } },
            },
          },
        },
      },
      post: {
        operationId: 'createTest',
        parameters,
        requestBody: body
          ? {
              content: {
                [contentType]: { schema: bodySchema },
              },
            }
          : undefined,
        responses: {
          200: {
            description: '200',
            content: {
              'application/json': { schema: { type: 'object' } },
            },
          },
        },
      },
    },
  };

  // Add additional verb methods
  ['put', 'delete', 'patch'].forEach((method) => {
    paths['/test/{id}'][method] = {
      operationId: `${method}Test`,
      parameters,
      requestBody: body
        ? {
            content: {
              [contentType]: { schema: bodySchema },
            },
          }
        : undefined,
      responses: {
        200: {
          description: '200',
          content: {
            'application/json': { schema: { type: 'object' } },
          },
        },
      },
    };
  });

  const oas = new Oas({
    openapi: 'hello',
    info: {
      title: 'test',
      version: '1.0.0',
    },
    paths,
  });

  const verbs: Record<string, PathOperation> = {
    get: oas.getOperationById('test'),
    post: oas.getOperationById('createTest'),
    put: oas.getOperationById('putTest'),
    delete: oas.getOperationById('deleteTest'),
    patch: oas.getOperationById('patchTest'),
  };

  const request = (args: OasRequestArgs): Request => buildRequest({ log }, oas, verbs[verb], args);

  const op = verbs[verb];
  return { oas, op, testLog: test, log, build: request };
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

  it.todo('handles application/x-www-form-urlencoded content type', async () => {
    const { build } = createOp(
      'post',
      { id: 'path' },
      z.object({
        name: z.string(),
      }),
      { contentType: 'application/x-www-form-urlencoded' },
    );

    const request = build({ id: '42', name: 'form data' });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/x-www-form-urlencoded',
      }),
      body: { name: 'form data' },
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
