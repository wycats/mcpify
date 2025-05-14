import qs from 'qs';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { createTestOp } from './test/create-test-op.ts';

describe('bucketArgs()', () => {
  it('buckets path/query params and ignores body when no requestBody', async () => {
    const { build } = createTestOp('get', { id: 'path', q: 'query' });

    const request = build({ id: '42', q: 'test', extra: 'unused' });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'GET',
      query: { q: 'test' },
    });
  });

  it('properly inserts arguments into the body when appropriate', async () => {
    const { build } = createTestOp(
      'post',
      { id: 'path', q: 'query' },
      z.object({
        extra: z.string(),
      })
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
    const { build } = createTestOp(
      'post',
      { id: 'path', q: 'query' },
      z.object({
        extra: z.string(),
      })
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
    const { build } = createTestOp('get', { id: 'path', apiKey: 'header' });

    const request = build({ id: '42', apiKey: 'secret-key' });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'GET',
      headers: new Headers({ apikey: 'secret-key' }),
    });
  });

  it('handles cookie parameters', async () => {
    const { build } = createTestOp('get', { id: 'path', sessionId: 'cookie' });

    const request = build({ id: '42', sessionId: 'abc123' });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'GET',
      headers: new Headers({ cookie: 'sessionId=abc123' }),
    });
  });

  it('handles different HTTP methods (PUT)', async () => {
    const { build } = createTestOp(
      'put',
      { id: 'path' },
      z.object({
        name: z.string(),
        value: z.number(),
      })
    );

    const request = build({ id: '42', name: 'test', value: 123 });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'PUT',
      body: { name: 'test', value: 123 },
    });
  });

  it('handles different HTTP methods (DELETE)', async () => {
    const { build } = createTestOp('delete', { id: 'path' });

    const request = build({ id: '42' });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'DELETE',
    });
  });

  it('handles different HTTP methods (PATCH)', async () => {
    const { build } = createTestOp(
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
    const { build } = createTestOp('get', { id: 'path', tags: 'query' });

    const request = build({ id: '42', tags: ['foo', 'bar', 'baz'] });

    await expect(request).toMatchRequest({
      url: '/test/42',
      method: 'get',
      query: { tags: ['foo', 'bar', 'baz'] },
    });
  });

  it('handles nested object body parameters', async () => {
    const { build } = createTestOp(
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
    const { build } = createTestOp(
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
    const { build } = createTestOp(
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
