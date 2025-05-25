import type Oas from 'oas';
import type { HttpMethods } from 'oas/types';
import type { OpenAPIV3 } from 'openapi-types';
import { describe, it, expect } from 'vitest';

import { log } from '../log.ts';
import { createTestOas } from '../test/create-oas.ts';

import type { ResponseSchemaExtractor } from './response-schema.ts';
import { ResponseSchemaExtractor as ResponseSchemaExtractorClass } from './response-schema.ts';

/**
 * Extended schema type for testing purposes to handle $ref properties
 * that might appear in schemas before they are fully resolved
 */
interface SchemaWithRef {
  $ref?: string;
  type?: string;
  properties?: Record<string, SchemaWithRef>;
  items?: SchemaWithRef;
  format?: string;
  required?: string[];
  additionalProperties?: boolean | SchemaWithRef;
}

/**
 * This test suite documents and verifies our assumptions about how $ref
 * is handled in OpenAPI and how it is resolved in the Quick-MCP codebase.
 */
describe('Schema References Resolution', () => {
  /**
   * Helper function to create a response schema extractor for testing
   */
  function createExtractorFromSpec(
    spec: Oas,
    path: string,
    method: HttpMethods,
  ): ResponseSchemaExtractor {
    // Create a new schema extractor instance
    return ResponseSchemaExtractorClass.fromOp(spec.operation(path, method), log);
  }

  it('should resolve $ref references in response schemas', async () => {
    // Arrange
    // Create an OpenAPI spec with references
    const petSchema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        id: {
          type: 'integer',
          format: 'int64',
        },
        name: {
          type: 'string',
        },
        status: {
          type: 'string',
          enum: ['available', 'pending', 'sold'],
        },
      },
      required: ['name'],
    };

    const apiErrorSchema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        code: {
          type: 'integer',
          format: 'int32',
        },
        message: {
          type: 'string',
        },
      },
      required: ['code', 'message'],
    };

    const petsPaths: OpenAPIV3.PathsObject = {
      '/pets/{petId}': {
        get: {
          summary: 'Find pet by ID',
          description: 'Returns a single pet',
          operationId: 'getPetById',
          parameters: [
            {
              name: 'petId',
              in: 'path',
              description: 'ID of pet to return',
              required: true,
              schema: {
                type: 'integer',
                format: 'int64',
              },
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
    };

    const components: OpenAPIV3.ComponentsObject = {
      schemas: {
        Pet: petSchema,
        Error: apiErrorSchema,
      },
    };

    // Create a fully normalized spec with resolved references
    const spec = await createTestOas(petsPaths, components);

    // Use the ResponseSchemaExtractor to get schemas from the parsed spec
    const extractor = createExtractorFromSpec(spec, '/pets/{petId}', 'get' as HttpMethods);

    // Get the 200 response schema
    const successSchema = extractor.getSchema('200');
    // Get the 404 response schema
    const errorSchema = extractor.getSchema('404');

    // Assert
    // Check that schemas exist
    expect(successSchema).not.toBeNull();
    expect(errorSchema).not.toBeNull();

    // In a normalized spec, we should have resolved schemas, not references
    const successWithRef = successSchema as SchemaWithRef;
    const errorWithRef = errorSchema as SchemaWithRef;

    // When using createNormalizedOas, we expect schema references to be resolved
    // The schema should be an object, not a reference
    expect(successSchema?.type).toBe('object');
    expect(successWithRef.$ref).toBeUndefined();

    expect(errorSchema?.type).toBe('object');
    expect(errorWithRef.$ref).toBeUndefined();

    // If the schemas are resolved (no $ref), then check their properties
    if (successSchema?.type === 'object') {
      expect(successSchema.properties).toHaveProperty('id');
      expect(successSchema.properties).toHaveProperty('name');
      expect(successSchema.properties).toHaveProperty('status');
      expect(successSchema.properties?.['id']).toHaveProperty('type', 'integer');
    }

    if (errorSchema?.type === 'object') {
      expect(errorSchema.properties).toHaveProperty('code');
      expect(errorSchema.properties).toHaveProperty('message');
      expect(errorSchema.properties?.['code']).toHaveProperty('type', 'integer');
    }
  });

  it('should resolve nested $ref references in response schemas', async () => {
    // Arrange
    // Create an OpenAPI spec with nested references
    const categorySchema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        id: {
          type: 'integer',
          format: 'int64',
        },
        name: {
          type: 'string',
        },
      },
    };

    const tagSchemaObj: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        id: {
          type: 'integer',
          format: 'int64',
        },
        name: {
          type: 'string',
        },
      },
    };

    const petWithRefsSchema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        id: {
          type: 'integer',
          format: 'int64',
        },
        name: {
          type: 'string',
        },
        category: {
          $ref: '#/components/schemas/Category',
        },
        tags: {
          type: 'array',
          items: {
            $ref: '#/components/schemas/Tag',
          },
        },
      },
    };

    const listPetsPath: OpenAPIV3.PathsObject = {
      '/pets': {
        get: {
          summary: 'List all pets',
          description: 'Returns all pets',
          operationId: 'listPets',
          responses: {
            '200': {
              description: 'Successful operation',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      $ref: '#/components/schemas/Pet',
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const nestedComponents: OpenAPIV3.ComponentsObject = {
      schemas: {
        Category: categorySchema,
        Tag: tagSchemaObj,
        Pet: petWithRefsSchema,
      },
    };

    // Create a fully normalized spec with resolved references
    const spec = await createTestOas(listPetsPath, nestedComponents);

    // Use the ResponseSchemaExtractor to get schemas from the parsed spec
    const extractor = createExtractorFromSpec(spec, '/pets', 'get' as HttpMethods);

    // Get the 200 response schema
    const petsSchema = extractor.getSchema('200');

    // Assert schema exists
    expect(petsSchema).not.toBeNull();

    // When using createNormalizedOas, we expect schema references to be resolved
    // The schema should be an array with items, not a reference
    expect(petsSchema?.type).toBe('array');
    expect(petsSchema?.items).toBeDefined();

    // If normalized correctly, petsSchema should be an array with item objects
    if (petsSchema?.type === 'array' && petsSchema.items) {
      const petItemSchema = petsSchema.items as SchemaWithRef;

      // petItemSchema should be a resolved object without $ref
      expect(petItemSchema.type).toBe('object');
      expect(petItemSchema.$ref).toBeUndefined();
      expect(petItemSchema.properties).toBeDefined();

      // Check category property is properly resolved
      if (petItemSchema.properties?.['category']) {
        const categorySchema = petItemSchema.properties['category'];
        expect(categorySchema.type).toBe('object');
        expect(categorySchema.$ref).toBeUndefined();
        expect(categorySchema.properties).toHaveProperty('id');
        expect(categorySchema.properties).toHaveProperty('name');
      }

      // Check tags property is properly resolved
      if (petItemSchema.properties?.['tags']) {
        const tagsSchema = petItemSchema.properties['tags'];
        expect(tagsSchema.type).toBe('array');

        if (tagsSchema.items) {
          const tagItems = tagsSchema.items;
          expect(tagItems.type).toBe('object');
          expect(tagItems.$ref).toBeUndefined();
          expect(tagItems.properties).toHaveProperty('id');
          expect(tagItems.properties).toHaveProperty('name');
        }
      }
    }
  });
});
