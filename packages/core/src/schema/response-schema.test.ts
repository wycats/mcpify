import Oas from 'oas';
import type { HttpMethods } from 'oas/types';
import type { OpenAPIV3 } from 'openapi-types';
import { describe, it, expect } from 'vitest';

import { testApp } from '../integration.test.ts';

import { ResponseSchemaExtractor } from './response-schema.ts';

describe('ResponseSchemaExtractor', () => {
  // Helper function to create properly typed schema objects
  function createSchema(
    type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null',
    properties?: Record<string, OpenAPIV3.SchemaObject>,
  ): OpenAPIV3.SchemaObject {
    const schema: OpenAPIV3.SchemaObject = { type: type as OpenAPIV3.NonArraySchemaObjectType };
    if (properties) {
      schema.properties = properties;
    }
    return schema;
  }

  // Helper function to create properly typed response objects
  function createResponseObject(
    description: string,
    contentType: string,
    schema: OpenAPIV3.SchemaObject,
  ): OpenAPIV3.ResponseObject {
    return {
      description,
      content: {
        [contentType]: {
          schema,
        },
      },
    };
  }

  // Creates a typed mock OAS object
  function createMockOas(
    path: string,
    method: string,
    responses: Record<string, OpenAPIV3.ResponseObject>,
  ): { oas: Oas; path: string; method: string } {
    const oas = new Oas({
      openapi: '3.1.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {
        [path]: {
          [method]: {
            responses,
          },
        },
      },
    });

    return { oas, path, method };
  }

  // Helper function to create a response schema extractor with test data
  function createExtractor(
    responses: Record<string, OpenAPIV3.ResponseObject> = {},
    path = '/test',
    method: HttpMethods = 'get',
  ): ResponseSchemaExtractor {
    const { oas } = createMockOas(path, method, responses);
    const { app } = testApp();

    // Use operation instead of getOperation which expects a full URL
    return ResponseSchemaExtractor.fromOp(oas.operation(path, method), app.log);
  }

  describe('getSchema', () => {
    it('should return null for empty responses', () => {
      // Arrange
      const extractor = createExtractor({});

      // Act
      const schema = extractor.getSchema('200');

      // Assert
      expect(schema).toBeNull();
    });

    it('should extract schema from successful response', () => {
      // Arrange
      const successSchema = createSchema('object', {
        success: createSchema('boolean'),
      });

      const responses: Record<string, OpenAPIV3.ResponseObject> = {
        '200': createResponseObject('Success', 'application/json', successSchema),
      };

      const extractor = createExtractor(responses);

      // Act
      const schema = extractor.getSchema('200');

      // Assert
      // Check schema exists and has the right structure
      expect(schema).not.toBeNull();
      expect(schema?.type).toBe('object');

      // Check that properties exist and have the expected structure
      const properties = schema?.properties;
      expect(properties).toBeDefined();

      // Check the success property exists and has the right type
      // Using bracket notation for property access from index signature
      expect(properties?.['success']).toBeDefined();
      expect(properties?.['success']?.type).toBe('boolean');
    });

    it('should fallback to default response when specific status code not found', () => {
      // Arrange
      const defaultSchema = createSchema('object', {
        message: createSchema('string'),
      });

      const responses: Record<string, OpenAPIV3.ResponseObject> = {
        default: createResponseObject('Default response', 'application/json', defaultSchema),
      };

      const extractor = createExtractor(responses);

      // Act
      const schema = extractor.getSchema('404');

      // Assert using same pattern as previous test
      expect(schema).not.toBeNull();
      expect(schema?.type).toBe('object');

      // Check properties exist
      const properties = schema?.properties;
      expect(properties).toBeDefined();

      // Check message property with bracket notation
      expect(properties?.['message']).toBeDefined();
      expect(properties?.['message']?.type).toBe('string');
    });

    it('should prefer application/json content type over others', () => {
      // Arrange
      const jsonSchema = createSchema('object', {
        data: createSchema('object'),
      });
      const textSchema = createSchema('string');

      const response: OpenAPIV3.ResponseObject = {
        description: 'Mixed response types',
        content: {
          'application/json': { schema: jsonSchema },
          'text/plain': { schema: textSchema },
        },
      };

      const responses = { '200': response };
      const extractor = createExtractor(responses);

      // Act
      const schema = extractor.getSchema('200');

      // Assert
      expect(schema).not.toBeNull();
      expect(schema?.type).toBe('object');
      // Should use JSON schema, not text schema
      expect(schema?.properties?.['data']).toBeDefined();
    });

    it('should handle JSON-compatible content types', () => {
      // Arrange
      const jsonApiSchema = createSchema('object', {
        data: createSchema('object'),
      });

      const response: OpenAPIV3.ResponseObject = {
        description: 'JSON API response',
        content: {
          'application/vnd.api+json': { schema: jsonApiSchema },
        },
      };

      const responses = { '200': response };
      const extractor = createExtractor(responses);

      // Act
      const schema = extractor.getSchema('200');

      // Assert
      expect(schema).not.toBeNull();
      expect(schema?.type).toBe('object');
      expect(schema?.properties?.['data']).toBeDefined();
    });

    it('should fallback to first content type if no JSON types are available', () => {
      // Arrange
      const textSchema = createSchema('string');

      const response: OpenAPIV3.ResponseObject = {
        description: 'Text response',
        content: {
          'text/plain': { schema: textSchema },
        },
      };

      const responses = { '200': response };
      const extractor = createExtractor(responses);

      // Act
      const schema = extractor.getSchema('200');

      // Assert
      expect(schema).not.toBeNull();
      expect(schema?.type).toBe('string');
    });

    it('should cache schema results', () => {
      // Arrange
      const successSchema = createSchema('object');
      const responses = {
        '200': createResponseObject('Success', 'application/json', successSchema),
      };
      const extractor = createExtractor(responses);

      // Act
      const schema1 = extractor.getSchema('200');
      const schema2 = extractor.getSchema('200'); // This should use cached result

      // Assert
      expect(schema1).toBe(schema2); // Same object reference from cache
    });
  });

  describe('getStatusCodes', () => {
    it('should return all available status codes', () => {
      // Arrange
      const responses = {
        '200': createResponseObject('Success', 'application/json', createSchema('object')),
        '400': createResponseObject('Bad Request', 'application/json', createSchema('object')),
        default: createResponseObject('Default', 'application/json', createSchema('object')),
      };

      const extractor = createExtractor(responses);

      // Act
      const statusCodes = extractor.getStatusCodes();

      // Assert
      expect(statusCodes).toHaveLength(3);
      expect(statusCodes).toContain('200');
      expect(statusCodes).toContain('400');
      expect(statusCodes).toContain('default');
    });

    it('should return empty array when no responses exist', () => {
      // Arrange
      const extractor = createExtractor({});

      // Act
      const statusCodes = extractor.getStatusCodes();

      // Assert
      expect(statusCodes).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should properly throw an error when the operation is missing required methods', () => {
      // Arrange - Create a real OAS instance but attempt to access a non-existent path
      const { app } = testApp();

      // Create a real OAS instance with a valid spec
      const validOas = new Oas({
        openapi: '3.1.0',
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
        paths: {
          '/existing-path': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                },
              },
            },
          },
        },
      });

      // Use a path that doesn't exist to trigger a real error
      const nonExistentPointer = { path: '/non-existent-path', method: 'get' } as const;

      // We expect this to throw an error - the actual error is from OAS's URL validation
      expect(() => {
        ResponseSchemaExtractor.from(validOas, nonExistentPointer, app.log);
      }).toThrow('Invalid URL');
    });
  });
});
