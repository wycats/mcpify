// External imports
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { TestLoggingLibrary, TestTransport } from 'loglayer';
import type { LogLevel } from 'loglayer';
import Oas from 'oas';
import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { App } from './main.ts';
import { OpenApiSpec } from './openapi.ts';
import type { OpenApiSpecOptions } from './openapi.ts';

// Define specific callback types for our test implementation to avoid using 'Function' type
type ResourceCallbackFn = (uri: string, args: Record<string, unknown>) => Promise<unknown>;
type ToolCallbackFn = (args: Record<string, unknown>) => Promise<unknown>;

interface ResourceCall {
  id: string;
  uri: string | object;
  callback: ResourceCallbackFn;
}

interface ToolCall {
  id: string;
  description: string;
  schema?: Record<string, unknown>;
  hints?: ToolAnnotations;
  callback: ToolCallbackFn;
}

// This is a simplified test implementation that doesn't match the full McpServer interface,
// but provides the functionality we need for testing
class TestMcpServer {
  public resourceCalls: ResourceCall[] = [];
  public toolCalls: ToolCall[] = [];

  // Capture resource registrations for later inspection
  resource(
    id: string,
    uri: string | object,
    callback: ResourceCallbackFn,
  ): { unregister: () => void } {
    this.resourceCalls.push({ id, uri, callback });
    return {
      unregister: () => {
        // Remove this resource from the tracked calls
        const index = this.resourceCalls.findIndex((call) => call.id === id);
        if (index !== -1) {
          this.resourceCalls.splice(index, 1);
        }
      },
    };
  }

  // Capture tool registrations for later inspection
  tool(
    id: string,
    description: string,
    schemaOrHints: Record<string, unknown> | ToolAnnotations,
    callbackOrHints: ToolCallbackFn | ToolAnnotations,
    callback?: ToolCallbackFn,
  ): { unregister: () => void } {
    // Handle different overload cases
    if (typeof callbackOrHints === 'function') {
      // (id, description, schema, callback) format
      this.toolCalls.push({
        id,
        description,
        // When we're in this code path, schemaOrHints is already a Record<string, unknown>
        schema: schemaOrHints,
        callback: callbackOrHints,
      });
    } else if (callback) {
      // (id, description, schema, hints, callback) format
      this.toolCalls.push({
        id,
        description,
        // Similar to the first case, schema is already a Record<string, unknown> in this context
        schema: schemaOrHints,
        hints: callbackOrHints,
        callback,
      });
    } else {
      // (id, description, hints, callback) format
      this.toolCalls.push({
        id,
        description,
        hints: schemaOrHints as ToolAnnotations,
        // Convert to unknown first for type safety
        callback: callbackOrHints as unknown as ToolCallbackFn,
      });
    }

    // Return a simple registered tool object
    return {
      unregister: () => {
        // Remove this tool from the tracked calls
        const index = this.toolCalls.findIndex((call) => call.id === id);
        if (index !== -1) {
          this.toolCalls.splice(index, 1);
        }
      },
    };
  }
}

describe('MCPify Integration', () => {
  // Define our schemas using Zod for type safety
  const PetSchema = z.object({
    id: z.number().int().optional(),
    name: z.string(),
    tag: z.string().optional(),
  });

  const PetsResponseSchema = z.array(PetSchema);

  const CreatePetSchema = z.object({
    name: z.string(),
    tag: z.string().optional(),
  });

  // Simple example OpenAPI specification for testing
  const simpleOpenApiSpec = {
    openapi: '3.0.0',
    info: {
      title: 'Test API',
      version: '1.0.0',
      description: 'A simple API for testing MCPify',
    },
    servers: [
      {
        url: 'https://api.example.com',
      },
    ],
    paths: {
      '/pets': {
        get: {
          summary: 'List all pets',
          operationId: 'listPets',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              description: 'Maximum number of pets to return',
              required: false,
              schema: {
                type: 'integer',
                format: 'int32',
              },
            },
          ],
          responses: {
            '200': {
              description: 'A paged array of pets',
              content: {
                'application/json': {
                  schema: zodToJsonSchema(PetsResponseSchema),
                },
              },
            },
          },
        },
        post: {
          summary: 'Create a pet',
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: zodToJsonSchema(CreatePetSchema),
              },
            },
          },
          responses: {
            '201': {
              description: 'Pet created',
            },
          },
        },
      },
      '/pets/{petId}': {
        get: {
          summary: 'Get a pet by ID',
          operationId: 'getPetById',
          parameters: [
            {
              name: 'petId',
              in: 'path',
              description: 'ID of pet to fetch',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Expected response to a valid request',
              content: {
                'application/json': {
                  schema: zodToJsonSchema(PetSchema),
                },
              },
            },
          },
        },
        delete: {
          summary: 'Delete a specific pet',
          operationId: 'deletePetById',
          parameters: [
            {
              name: 'petId',
              in: 'path',
              description: 'The id of the pet to delete',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '204': {
              description: 'Pet deleted successfully',
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Pet: zodToJsonSchema(
          // We create a modified schema with stricter requirements for the component definition
          PetSchema.extend({
            // Ensure id is required in this schema definition
            id: z.number().int(),
          }),
        ),
      },
    },
  };

  describe('End-to-end OpenAPI to MCP conversion', () => {
    let testServer: TestMcpServer;
    let openApiSpec: OpenApiSpec;
    let oas: Oas;

    beforeEach(() => {
      testServer = new TestMcpServer();

      // Create properly typed OpenAPI spec object and convert to Oas instance
      // Note: Using 'as any' here is necessary since we're using a simplified test spec
      // that doesn't match the full OASDocument type but works for our tests
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      oas = new Oas(simpleOpenApiSpec as any);

      const { app } = testApp();

      // Create options with a properly implemented App
      const options: OpenApiSpecOptions = {
        app,
        baseUrl: 'https://api.example.com',
      };

      openApiSpec = OpenApiSpec.from(oas, options);
    });

    it('should parse the OpenAPI spec successfully', () => {
      expect(openApiSpec).toBeDefined();
    });

    it('should create MCP resources from the OpenAPI spec', () => {
      // Call the createResources method
      // Type assertion needed since TestMcpServer doesn't implement the full McpServer interface
      openApiSpec.createResources(testServer as unknown as McpServer);

      // Verify that resources were registered
      expect(testServer.resourceCalls.length).toBeGreaterThan(0);

      // Verify that a resource is registered with the expected operation ID
      const operationIds = testServer.resourceCalls.map((call) => call.id);

      // Look for expected API operation IDs
      expect(operationIds).toContain('getPetById');

      // Verify that resource callbacks are provided
      for (const call of testServer.resourceCalls) {
        // Verify we have a callback function
        expect(typeof call.callback).toBe('function');
      }

      // Verify URIs for resources
      const baseUrl = 'https://api.example.com';
      // 'listPets' has a query parameter, so it should not be registered as a resource
      // Only operations with exclusively path parameters can be resources
      const getPetCall = testServer.resourceCalls.find((call) => call.id === 'getPetById');
      expect(getPetCall).toBeDefined();
      expect(getPetCall?.uri).toBeInstanceOf(ResourceTemplate);
      
      // Access the uriTemplate through the ResourceTemplate's getter
      const resourceTemplate = getPetCall?.uri as ResourceTemplate;
      const templatePattern = resourceTemplate.uriTemplate.toString();
      expect(templatePattern).toBe(`${baseUrl}/pets/{petId}`);
    });

    it('should not register non-resource operations', () => {
      // Call the createResources method
      openApiSpec.createResources(testServer as unknown as McpServer);

      // POST operations should not be registered as resources
      const createPetCall = testServer.resourceCalls.find((call) => call.id === 'createPet');
      expect(createPetCall).toBeUndefined();

      // DELETE operations should not be registered as resources
      const deletePetCall = testServer.resourceCalls.find((call) => call.id === 'deletePetById');
      expect(deletePetCall).toBeUndefined();
    });

    it('should register only GET operations as resources', () => {
      // Define a spec with various HTTP methods for the same path
      const methodsSpec = {
        openapi: '3.0.0',
        info: { title: 'HTTP Methods API', version: '1.0.0' },
        paths: {
          '/items/{itemId}': {
            get: { operationId: 'getItem', parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'string' } }] },
            post: { operationId: 'createItem', parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'string' } }] },
            put: { operationId: 'updateItem', parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'string' } }] },
            patch: { operationId: 'patchItem', parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'string' } }] },
            delete: { operationId: 'deleteItem', parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'string' } }] },
          }
        }
      };

      // Create a new TestMcpServer for this test
      const methodsTestServer = new TestMcpServer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const methodsOas = new Oas(methodsSpec as any);
      const methodsOpenApiSpec = OpenApiSpec.from(methodsOas, { app: testApp().app });

      // Call createResources
      methodsOpenApiSpec.createResources(methodsTestServer as unknown as McpServer);

      // Only GET should be registered as a resource
      const operationIds = methodsTestServer.resourceCalls.map(call => call.id);
      expect(operationIds).toContain('getItem');
      expect(operationIds).not.toContain('createItem');
      expect(operationIds).not.toContain('updateItem');
      expect(operationIds).not.toContain('patchItem');
      expect(operationIds).not.toContain('deleteItem');
      expect(operationIds.length).toBe(1);
    });

    it('should register resource callbacks with the correct signature', () => {
      // Call the createResources method
      openApiSpec.createResources(testServer as unknown as McpServer);

      // Find the getPetById resource
      const getPetCall = testServer.resourceCalls.find((call) => call.id === 'getPetById');
      expect(getPetCall).toBeDefined();

      // Test that the callback is registered with the correct signature
      expect(getPetCall?.callback).toBeDefined();
      
      // Since we've already verified getPetCall exists, we use an if guard
      // for type narrowing following the project's style guidelines
      if (getPetCall) {
        const { callback } = getPetCall;
        expect(typeof callback).toBe('function');
        
        // Verify the callback signature by examining its length
        // ResourceCallbackFn should have 2 parameters (uri and args)
        expect(callback.length).toBe(2);
      }
    });

    it('should create MCP tools from the OpenAPI spec', () => {
      // Call the createTools method
      openApiSpec.createTools(testServer as unknown as McpServer);

      // Verify that tools were registered
      expect(testServer.toolCalls.length).toBeGreaterThan(0);

      // Verify the tool call for the POST endpoint
      const createPetCall = testServer.toolCalls.find((call) => call.id === 'createPet');
      expect(createPetCall).toBeDefined();
      expect(createPetCall?.description).toContain('Create a pet');

      // Verify that delete tool was created
      const deletePetCall = testServer.toolCalls.find((call) => call.id === 'deletePetById');
      expect(deletePetCall).toBeDefined();
    });

    it('should generate correct parameter schemas for tools', () => {
      openApiSpec.createTools(testServer as unknown as McpServer);

      // Verify parameter schemas for each tool
      for (const call of testServer.toolCalls) {
        // All tools should have defined schemas
        expect(call.schema).toBeDefined();

        switch (call.id) {
          case 'createPet':
            // Verify schema matches CreatePetSchema definition
            expect(call.schema).toMatchObject({
              name: {}, // name should exist (details in the schema don't matter for this test)
              tag: {}, // tag should exist
            });
            break;

          case 'deletePetById':
            // Verify petId parameter exists
            expect(call.schema).toMatchObject({
              petId: {}, // petId should exist
            });
            break;
        }
      }
    });

    it('should apply safety hints based on HTTP method', () => {
      openApiSpec.createTools(testServer as unknown as McpServer);

      // Verify hints for specific operations
      for (const call of testServer.toolCalls) {
        // We expect hints for tool calls
        expect(call.hints).toBeDefined();

        // Check expected safety hints based on HTTP method
        switch (call.id) {
          case 'createPet':
            expect(call.hints).toMatchObject({ readOnlyHint: false, idempotentHint: false });
            break;
          case 'deletePetById':
            expect(call.hints).toMatchObject({ readOnlyHint: false, destructiveHint: true });
            break;
        }
      }
    });
  });
});

export type LogLevelString = keyof typeof LogLevel;

export function testApp(): { app: App; test: TestLoggingLibrary } {
  const test = new TestLoggingLibrary();
  const log = new TestTransport({
    logger: test,
  });
  const app = new App({ log });

  return { app, test };
}
