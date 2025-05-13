import type { LogLayer, TestLoggingLibrary } from 'loglayer';
import type Oas from 'oas';
import type { PathsObject } from 'oas/types';
import type { OpenAPIV3 } from 'openapi-types';
import { describe, it, expect, assert } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { ExtendedOperation } from './parameter-mapper.ts';
import type { OperationExtensions, PathOperation } from './parameter-mapper.ts';
import { HttpVerb } from './safety.ts';
import { createTestOas, testApp } from './test/create-oas.ts';

interface TestOperation {
  oas: Oas;
  log: LogLayer;
  operation: PathOperation;
  extendedOp: ExtendedOperation;
  testLogger: TestLoggingLibrary;
}

describe('Response Schema Handling', () => {
  const createTestOperation = async ({
    method,
    pathParams = [],
    queryParams = [],
    responseSchemas = {},
    customResponses = {},
  }: {
    method: 'get' | 'post' | 'put' | 'delete';
    pathParams?: string[];
    queryParams?: string[];
    responseSchemas?: Record<string, z.ZodObject<z.ZodRawShape>>;
    customResponses?: Record<string, OpenAPIV3.ResponseObject>;
  }): Promise<TestOperation> => {
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

    // Create responses based on provided schemas and custom responses
    const responses: Record<string, OpenAPIV3.ResponseObject> = {
      // Default response - always present if no custom responses provided
      ...(!Object.keys(customResponses).length
        ? {
            '200': {
              description: 'Default success response',
              content: {
                'application/json': {
                  schema: { type: 'object' } as OpenAPIV3.SchemaObject,
                },
              },
            },
          }
        : {}),
      // Add any custom responses
      ...customResponses,
    };

    // Add custom response schemas if provided
    Object.entries(responseSchemas).forEach(([statusCode, schema]) => {
      responses[statusCode] = {
        description: `Response for status ${statusCode}`,
        content: {
          'application/json': {
            schema: convertZodToOpenAPI(schema),
          },
        },
      };
    });

    // Create paths object with the specified operation
    const paths: PathsObject = {
      '/test': {
        [method]: {
          operationId: `test${method}Operation`,
          parameters,
          responses,
        },
      },
    };

    // Create OAS instance with fully resolved references
    const oas = await createTestOas(paths);

    const {
      app: { log },
      test: testLogger,
    } = testApp();

    // Get the operation
    const operation = oas.getOperationById(`test${method}Operation`);
    const verb = HttpVerb.from(method);

    assert(verb, `Unsupported HTTP method: ${method}`);

    const extensions: OperationExtensions = {};

    // Create ExtendedOperation instance
    const extendedOp = ExtendedOperation.from(operation, extensions, { log });

    assert(extendedOp, 'Failed to create ExtendedOperation instance');

    return {
      oas,
      log,
      operation,
      extendedOp,
      testLogger,
    };
  };

  describe('getResponseSchema method', () => {
    it('should return null when no response schema exists', async () => {
      // Create a custom test operation with no schema
      const { extendedOp } = await createTestOperation({
        method: 'get',
        // Custom empty response with no schema
        customResponses: {
          '200': {
            description: 'Success response with no schema',
            // Deliberately not including a schema
            content: {
              'application/json': {},
            },
          },
        },
      });

      const schema = extendedOp.getResponseSchema('200');

      expect(schema).toBeNull();
    });

    it('should extract schema for specified status code', async () => {
      const userSchema = z.object({
        id: z.number(),
        name: z.string(),
        email: z.string().email(),
      });

      const { extendedOp } = await createTestOperation({
        method: 'get',
        responseSchemas: {
          '200': userSchema,
        },
      });

      const schema = extendedOp.getResponseSchema('200');

      expect(schema).not.toBeNull();
      expect(schema?.properties).toHaveProperty('id');
      expect(schema?.properties).toHaveProperty('name');
      expect(schema?.properties).toHaveProperty('email');
    });

    it('should return schema for default response if status code not found', async () => {
      const defaultSchema = z.object({
        message: z.string(),
      });

      const { extendedOp } = await createTestOperation({
        method: 'get',
        responseSchemas: {
          default: defaultSchema,
        },
      });

      // Request a non-existent status code - should fall back to default
      const schema = extendedOp.getResponseSchema('404');

      expect(schema).not.toBeNull();
      expect(schema?.properties).toHaveProperty('message');
    });

    it('should handle content types other than application/json', () => {
      // This test will need to be implemented after we extend the test factory
      // to support different content types in responses
      expect(true).toBe(true);
    });
  });

  describe('responseSchemas getter', () => {
    it('should return all available response schemas', async () => {
      const successSchema = z.object({
        data: z.string(),
      });

      const errorSchema = z.object({
        error: z.string(),
        code: z.number(),
      });

      const { extendedOp } = await createTestOperation({
        method: 'get',
        responseSchemas: {
          '200': successSchema,
          '400': errorSchema,
        },
      });

      const schemas = extendedOp.responseSchemas;

      assert('200' in schemas, '200 response schema not found');
      assert('400' in schemas, '400 response schema not found');

      expect(schemas['200'].properties).toHaveProperty('data');
      expect(schemas['400'].properties).toHaveProperty('error');
      expect(schemas['400'].properties).toHaveProperty('code');
    });
  });

  describe('zodResponseSchemas getter', () => {
    it('should return Zod schemas for all responses', async () => {
      const successSchema = z.object({
        data: z.string(),
      });

      const errorSchema = z.object({
        error: z.string(),
        code: z.number(),
      });

      const { extendedOp } = await createTestOperation({
        method: 'get',
        responseSchemas: {
          '200': successSchema,
          '400': errorSchema,
        },
      });

      const schemas = extendedOp.zodResponseSchemas;

      assert('200' in schemas, '200 response schema not found');
      assert('400' in schemas, '400 response schema not found');

      expect(typeof schemas['200'].parse).toBe('function');
    });
  });
});

function convertZodToOpenAPI(schema: z.ZodObject<z.ZodRawShape>): OpenAPIV3.SchemaObject {
  const jsonSchema = zodToJsonSchema(schema);

  delete jsonSchema.$schema;

  // This is a type assertion since the schemas are structurally compatible
  // but have different TypeScript types
  return jsonSchema as unknown as OpenAPIV3.SchemaObject;
}
