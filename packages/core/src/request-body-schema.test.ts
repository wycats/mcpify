import { LogLayer, TestLoggingLibrary, TestTransport } from 'loglayer';
import Oas from 'oas';
import type { OperationObject, PathsObject } from 'oas/types';
import type { OpenAPIV3 } from 'openapi-types';
import { describe, it, expect, assert } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { ExtendedOperation } from './parameter-mapper.ts';
import type { OperationExtensions, PathOperation } from './parameter-mapper.ts';
import { HttpVerb } from './safety.ts';

interface TestOperation {
  oas: Oas;
  log: LogLayer;
  operation: PathOperation;
  extendedOp: ExtendedOperation;
  testLogger: TestLoggingLibrary;
}

describe('Request Body Schema Handling', () => {
  const createTestOperation = ({
    method,
    pathParams = [],
    queryParams = [],
    requestBodySchema,
    contentType = 'application/json',
  }: {
    method: 'get' | 'post' | 'put' | 'delete';
    pathParams?: string[];
    queryParams?: string[];
    requestBodySchema?: z.ZodObject<z.ZodRawShape>;
    contentType?: string;
  }): TestOperation => {
    // Create path parameters
    const parameters: OpenAPIV3.ParameterObject[] = [
      ...pathParams.map((name) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' } as const,
      })),
      ...queryParams.map((name) => ({
        name,
        in: 'query',
        required: false,
        schema: { type: 'string' } as const,
      })),
    ];

    // Create request body if schema is provided
    const requestBody: Pick<OpenAPIV3.OperationObject, 'requestBody'> = requestBodySchema
      ? {
          requestBody: {
            required: true,
            content: {
              [contentType]: {
                schema: convertZodToOpenAPI(requestBodySchema),
              },
            },
          },
        }
      : {};

    // Create paths object with the specified operation
    const paths: Record<string, Record<string, OperationObject>> = {
      '/test': {
        [method]: {
          operationId: `test${method}Operation`,
          parameters,
          ...requestBody,
          responses: {
            '200': {
              description: 'Success response',
              content: {
                'application/json': { schema: { type: 'object' } },
              },
            },
          },
        },
      },
    };

    // Create OAS instance
    const oas = new Oas({
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: paths as PathsObject,
    });

    // Create test logger
    const testLogger = new TestLoggingLibrary();
    const log = new LogLayer({
      transport: new TestTransport({ logger: testLogger }),
    });

    // Get the operation
    const operation = oas.getOperationById(`test${method}Operation`);
    const verb = HttpVerb.from(method);

    assert(verb, `Unsupported HTTP method: ${method}`);

    const extensions: OperationExtensions = {};

    // Create ExtendedOperation instance
    const extendedOp = new ExtendedOperation({ log }, verb, operation, extensions);

    return {
      oas,
      log,
      operation,
      extendedOp,
      testLogger,
    };
  };

  describe('jsonSchema getter', () => {
    it('returns parameter schema for operations with no request body', () => {
      const { extendedOp } = createTestOperation({
        method: 'get',
        pathParams: ['id'],
        queryParams: ['filter'],
      });

      const schema = extendedOp.jsonSchema;

      expect(schema).not.toBeNull();
      expect(schema?.properties).toHaveProperty('id');
      expect(schema?.properties).toHaveProperty('filter');
    });

    it('returns request body schema for POST operations with no other parameters', () => {
      const bodySchema = z.object({
        name: z.string(),
        email: z.string().email(),
        age: z.number().optional(),
      });

      const { extendedOp } = createTestOperation({
        method: 'post',
        requestBodySchema: bodySchema,
      });

      const schema = extendedOp.jsonSchema;

      expect(schema).not.toBeNull();
      expect(schema?.properties).toHaveProperty('name');
      expect(schema?.properties).toHaveProperty('email');
      expect(schema?.properties).toHaveProperty('age');
    });

    it('combines parameter and request body schemas for POST operations with both', () => {
      const bodySchema = z.object({
        name: z.string(),
        email: z.string().email(),
      });

      const { extendedOp } = createTestOperation({
        method: 'post',
        pathParams: ['id'],
        queryParams: ['filter'],
        requestBodySchema: bodySchema,
      });

      const schema = extendedOp.jsonSchema;

      expect(schema).not.toBeNull();
      expect(schema?.properties).toHaveProperty('id');
      expect(schema?.properties).toHaveProperty('filter');
      expect(schema?.properties).toHaveProperty('name');
      expect(schema?.properties).toHaveProperty('email');
    });

    it('handles non-JSON content types by falling back to application/json', () => {
      const bodySchema = z.object({
        data: z.string(),
      });

      const { extendedOp } = createTestOperation({
        method: 'post',
        requestBodySchema: bodySchema,
        contentType: 'application/xml',
      });

      // The implementation should fall back to application/json schema
      const schema = extendedOp.jsonSchema;

      expect(schema).not.toBeNull();
      expect(schema?.properties).toHaveProperty('data');
    });

    it('returns null when no schemas are found', () => {
      // Create a GET operation with no parameters
      const { extendedOp } = createTestOperation({ method: 'get' });

      const schema = extendedOp.jsonSchema;

      expect(schema).toBeNull();
    });
  });

  describe('schema property access', () => {
    it('correctly identifies operations with parameters', () => {
      const { extendedOp: withParams } = createTestOperation({
        method: 'get',
        pathParams: ['id'],
        queryParams: ['filter'],
      });
      const { extendedOp: withoutParams } = createTestOperation({ method: 'get' });

      expect(withParams.hasParameters).toBe(true);
      expect(withoutParams.hasParameters).toBe(false);
    });

    it('correctly transforms schemas to Zod raw shapes', () => {
      const bodySchema = z.object({
        name: z.string(),
        age: z.number().optional(),
      });

      const { extendedOp } = createTestOperation({
        method: 'post',
        pathParams: ['id'],
        requestBodySchema: bodySchema,
      });

      const params = extendedOp.parameters;

      assert(params, 'Parameters should not be null');

      // Check for presence of properties in the Zod raw shape
      expect(Object.keys(params)).toContain('id');
      expect(Object.keys(params)).toContain('name');
      expect(Object.keys(params)).toContain('age');
    });
  });
});

function convertZodToOpenAPI(schema: z.ZodObject<z.ZodRawShape>): OpenAPIV3.SchemaObject {
  const jsonSchema = zodToJsonSchema(schema);
  // This is a simple type assertion since the schemas are structurally compatible
  // but have different TypeScript types
  return jsonSchema as unknown as OpenAPIV3.SchemaObject;
}
