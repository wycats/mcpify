import Oas from 'oas';
import type { HttpMethods, OASDocument } from 'oas/types';
import OASNormalize from 'oas-normalize';
import { describe, it, expect } from 'vitest';
import type { JSONSchema } from 'zod-from-json-schema';

import { createTestOas } from './test/create-oas.ts';

/**
 * These tests verify the behavior of OASNormalize with respect to reference resolution
 * in OpenAPI specifications. In particular, we want to understand how references are
 * handled in response schemas.
 */
describe('OASNormalize Reference Resolution', () => {
  // Helper function to get a schema from a response in an Oas object
  function getResponseSchema(
    oas: Oas,
    path: string,
    method: HttpMethods,
    statusCode: string,
  ): JSONSchema | null {
    const op = oas.operation(path, method);
    const response = op.getResponseByStatusCode(statusCode);

    if (typeof response === 'boolean') {
      return null;
    }

    if (!response.content || !response.content['application/json']) {
      return null;
    }

    return response.content['application/json'].schema as JSONSchema;
  }

  // Create a test OpenAPI spec with various types of references
  const specWithRefs = {
    openapi: '3.0.0',
    info: {
      title: 'Test API with References',
      version: '1.0.0',
    },
    components: {
      schemas: {
        // Simple schema
        Error: {
          type: 'object',
          properties: {
            code: { type: 'integer' },
            message: { type: 'string' },
          },
          required: ['code', 'message'],
        },
        // Standard schema
        Pet: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            status: { type: 'string' },
          },
          required: ['id', 'name'],
        },
        // Object with nested reference
        Order: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            pet: { $ref: '#/components/schemas/Pet' },
            quantity: { type: 'integer' },
          },
        },
      },
    },
    paths: {
      '/pets/{petId}': {
        get: {
          operationId: 'getPetById',
          parameters: [
            {
              name: 'petId',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            '200': {
              description: 'Successful operation',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Pet',
                  },
                },
              },
            },
            '404': {
              description: 'Pet not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/orders/{orderId}': {
        get: {
          operationId: 'getOrderById',
          parameters: [
            {
              name: 'orderId',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            '200': {
              description: 'Successful operation',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Order',
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  it('should preserve $refs by default (without bundle/dereference)', async () => {
    // Create a normalizer but don't bundle or dereference
    const normalizer = new OASNormalize(specWithRefs);
    const validated = await normalizer.validate();
    expect(validated.valid).toBe(true);

    // Just convert
    const convertedDoc = await normalizer.convert();

    // Create OAS from converted doc
    const oas = new Oas(convertedDoc as OASDocument);

    // Get schemas from responses
    const petSchema = getResponseSchema(oas, '/pets/{petId}', 'get', '200');
    const errorSchema = getResponseSchema(oas, '/pets/{petId}', 'get', '404');
    const orderSchema = getResponseSchema(oas, '/orders/{orderId}', 'get', '200');

    // Verify they all have $ref properties (not dereferenced)
    expect(petSchema).toHaveProperty('$ref', '#/components/schemas/Pet');
    expect(errorSchema).toHaveProperty('$ref', '#/components/schemas/Error');
    expect(orderSchema).toHaveProperty('$ref', '#/components/schemas/Order');
  });

  it('should resolve all $refs with dereference()', async () => {
    // Create a normalizer and dereference
    const normalizer = new OASNormalize(specWithRefs);
    const validated = await normalizer.validate();
    expect(validated.valid).toBe(true);

    await normalizer.convert();
    const dereferencedDoc = await normalizer.dereference();

    // Create OAS from dereferenced doc
    const oas = new Oas(dereferencedDoc as OASDocument);

    // Get schemas from responses
    const petSchema = getResponseSchema(oas, '/pets/{petId}', 'get', '200');
    const errorSchema = getResponseSchema(oas, '/pets/{petId}', 'get', '404');
    const orderSchema = getResponseSchema(oas, '/orders/{orderId}', 'get', '200');

    // Verify they have been dereferenced (no $ref properties)
    expect(petSchema).not.toHaveProperty('$ref');
    expect(petSchema).toHaveProperty('type', 'object');
    expect(petSchema?.properties).toHaveProperty('id');

    expect(errorSchema).not.toHaveProperty('$ref');
    expect(errorSchema).toHaveProperty('type', 'object');
    expect(errorSchema?.properties).toHaveProperty('code');

    expect(orderSchema).not.toHaveProperty('$ref');
    expect(orderSchema).toHaveProperty('type', 'object');
    expect(orderSchema?.properties).toHaveProperty('pet');

    // Check that nested references are also resolved
    const petRef = orderSchema?.properties?.['pet'];
    expect(petRef).not.toHaveProperty('$ref');
    expect(petRef).toHaveProperty('type', 'object');
    expect(petRef?.properties).toHaveProperty('id');
  });

  it('should resolve $refs with bundle() (bundling also dereferences)', async () => {
    // Create a normalizer and bundle
    const normalizer = new OASNormalize(specWithRefs);
    const validated = await normalizer.validate();
    expect(validated.valid).toBe(true);

    await normalizer.convert();
    // Note: bundle also dereferences the schemas, so references are resolved
    const bundledDoc = await normalizer.bundle();

    // Create OAS from bundled doc
    const oas = new Oas(bundledDoc as OASDocument);

    // Get schemas from responses
    const petSchema = getResponseSchema(oas, '/pets/{petId}', 'get', '200');
    const errorSchema = getResponseSchema(oas, '/pets/{petId}', 'get', '404');
    const orderSchema = getResponseSchema(oas, '/orders/{orderId}', 'get', '200');

    // Verify that the schemas are dereferenced (OASNormalize's bundle behavior)
    expect(petSchema).not.toHaveProperty('$ref');
    expect(petSchema).toHaveProperty('type', 'object');
    expect(petSchema?.properties).toHaveProperty('id');
    
    expect(errorSchema).not.toHaveProperty('$ref');
    expect(errorSchema).toHaveProperty('type', 'object');
    expect(errorSchema?.properties).toHaveProperty('code');
    
    expect(orderSchema).not.toHaveProperty('$ref');
    expect(orderSchema).toHaveProperty('type', 'object');
    expect(orderSchema?.properties).toHaveProperty('pet');
  });

  it('should fully resolve refs with bundle() after dereference()', async () => {
    // Create a normalizer, dereference, and then bundle
    const normalizer = new OASNormalize(specWithRefs);
    const validated = await normalizer.validate();
    expect(validated.valid).toBe(true);

    await normalizer.convert();
    await normalizer.dereference();
    const bundledDoc = await normalizer.bundle();

    // Create OAS from bundled doc
    const oas = new Oas(bundledDoc as OASDocument);

    // Get schemas from responses
    const petSchema = getResponseSchema(oas, '/pets/{petId}', 'get', '200');
    const errorSchema = getResponseSchema(oas, '/pets/{petId}', 'get', '404');
    const orderSchema = getResponseSchema(oas, '/orders/{orderId}', 'get', '200');

    // Verify they have been dereferenced (no $ref properties)
    expect(petSchema).not.toHaveProperty('$ref');
    expect(petSchema).toHaveProperty('type', 'object');
    expect(petSchema?.properties).toHaveProperty('id');

    expect(errorSchema).not.toHaveProperty('$ref');
    expect(errorSchema).toHaveProperty('type', 'object');
    expect(errorSchema?.properties).toHaveProperty('code');

    expect(orderSchema).not.toHaveProperty('$ref');
    expect(orderSchema).toHaveProperty('type', 'object');
    expect(orderSchema?.properties).toHaveProperty('pet');

    // Check that nested references are also resolved
    const petRef = orderSchema?.properties?.['pet'];
    expect(petRef).not.toHaveProperty('$ref');
    expect(petRef).toHaveProperty('type', 'object');
    expect(petRef?.properties).toHaveProperty('id');
  });

  it('should test createTestOas function behavior (integration test)', async () => {
    // Since we're testing reference resolution, create a fresh spec using paths directly
    // Use proper type casting to ensure TypeScript compatibility
    const spec = await createTestOas(
      // Cast the paths to any to avoid TypeScript errors with raw objects
      // This is safe in tests since we know the structure is correct
      {
        '/pets/{petId}': {
          get: {
            operationId: 'getPetById',
            parameters: [
              {
                name: 'petId',
                in: 'path',
                required: true,
                schema: { type: 'integer', format: 'int64' },
              },
            ],
            responses: {
              '200': {
                description: 'Successful operation',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Pet' },
                  },
                },
              },
              '404': {
                description: 'Pet not found',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Error' },
                  },
                },
              },
            },
          },
        },
        '/orders/{orderId}': {
          get: {
            operationId: 'getOrderById',
            parameters: [
              {
                name: 'orderId',
                in: 'path',
                required: true,
                schema: { type: 'integer', format: 'int64' },
              },
            ],
            responses: {
              '200': {
                description: 'Successful operation',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Order' },
                  },
                },
              },
            },
          },
        },
      },
      {
        schemas: {
          Pet: {
            type: 'object',
            properties: {
              id: { type: 'integer', format: 'int64' },
              name: { type: 'string' },
              status: { type: 'string', enum: ['available', 'pending', 'sold'] },
            },
            required: ['name'],
          },
          Error: {
            type: 'object',
            properties: {
              code: { type: 'integer', format: 'int32' },
              message: { type: 'string' },
            },
          },
          Order: {
            type: 'object',
            properties: {
              id: { type: 'integer', format: 'int64' },
              petId: { type: 'integer', format: 'int64' },
              pet: { $ref: '#/components/schemas/Pet' },
            },
          },
        },
      },
    );

    // Get schemas from responses
    const petSchema = getResponseSchema(spec, '/pets/{petId}', 'get', '200');
    const errorSchema = getResponseSchema(spec, '/pets/{petId}', 'get', '404');
    const orderSchema = getResponseSchema(spec, '/orders/{orderId}', 'get', '200');

    // Verify references are fully resolved
    expect(petSchema).not.toHaveProperty('$ref');
    expect(errorSchema).not.toHaveProperty('$ref');
    expect(orderSchema).not.toHaveProperty('$ref');
    
    // Verify schemas are correctly structured
    expect(petSchema).toHaveProperty('type', 'object');
    expect(errorSchema).toHaveProperty('type', 'object');
    expect(orderSchema).toHaveProperty('type', 'object');
  });
});
