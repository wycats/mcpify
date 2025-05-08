import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { LogLayer } from 'loglayer';
import Oas from 'oas';
import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { App } from './main.ts';
import { OpenApiSpec } from './openapi.ts';
import type { OpenApiSpecOptions } from './openapi.ts';

interface LogMessage {
  level: string;
  message: string;
  data?: unknown;
}

// Create a test implementation of LogLayer using dependency injection pattern
class TestLogger implements Partial<LogLayer> {
  #messages: LogMessage[] = [];

  #push(level: string, message: string, data: unknown[]): void {
    this.#messages.push({ level, message, data: data.length > 0 ? data : undefined });
  }

  debug(message: string, ...data: unknown[]): void {
    this.#push('debug', message, data);
  }

  info(message: string, ...data: unknown[]): void {
    this.#push('info', message, data);
  }

  warn(message: string, ...data: unknown[]): void {
    this.#push('warn', message, data);
  }

  error(message: string, ...data: unknown[]): void {
    this.#push('error', message, data);
  }
}

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
    let testLogger: TestLogger;
    let testServer: TestMcpServer;
    let openApiSpec: OpenApiSpec;
    let oas: Oas;

    beforeEach(() => {
      testLogger = new TestLogger();
      testServer = new TestMcpServer();

      // Create properly typed OpenAPI spec object and convert to Oas instance
      // Note: Using 'as any' here is necessary since we're using a simplified test spec
      // that doesn't match the full OASDocument type but works for our tests
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      oas = new Oas(simpleOpenApiSpec as any);

      // Create a simplified app object with just the log property needed for testing
      // Since we're creating a proper test implementation instead of a mock,
      // we can use it directly in our tests
      // Create a proper Test implementation of App that satisfies the interface requirements
      class TestApp extends App {
        // Override the constructor to accept our test logger
        constructor(testLogger: TestLogger) {
          // We need to provide both spec and options to the App constructor
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          super(oas as any, { logLevel: 'info' });
          // Replace the logger property with our test logger
          Object.defineProperty(this, 'log', { value: testLogger });
        }
      }

      // Create options with a properly implemented App
      const options: OpenApiSpecOptions = {
        app: new TestApp(testLogger),
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
