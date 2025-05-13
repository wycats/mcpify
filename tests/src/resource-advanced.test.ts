// External imports
import { OpenApiSpec } from '@mcpify/core';
import type { OpenApiSpecOptions } from '@mcpify/core';
import { testApp } from '@mcpify/core/test';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import Oas from 'oas';
import { describe, it, expect } from 'vitest';

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
        schema: schemaOrHints,
        callback: callbackOrHints,
      });
    } else if (callback) {
      // (id, description, schema, hints, callback) format
      this.toolCalls.push({
        id,
        description,
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

describe('Advanced Resource Registration Tests', () => {
  // Helper to create an OpenAPI spec and register resources
  function createResourcesFromSpec(openApiSpec: Record<string, unknown>): {
    server: TestMcpServer;
    openApiSpec: OpenApiSpec;
  } {
    const testServer = new TestMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oas = new Oas(openApiSpec as any);
    const { app } = testApp();
    const options: OpenApiSpecOptions = {
      app,
      baseUrl: 'https://example.com',
    };
    const spec = OpenApiSpec.from(oas, options);
    spec.createResources(testServer as unknown as McpServer);
    return { server: testServer, openApiSpec: spec };
  }

  describe('Complex Path Parameters', () => {
    it('should handle multiple path parameters correctly', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Multi-Path Params API', version: '1.0.0' },
        paths: {
          '/orgs/{orgId}/repos/{repoId}/issues/{issueId}': {
            get: {
              operationId: 'getIssue',
              parameters: [
                { name: 'orgId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'repoId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'issueId', in: 'path', required: true, schema: { type: 'string' } },
              ],
            },
          },
        },
      };

      const { server } = createResourcesFromSpec(spec);
      
      // Verify the resource was created
      const issueResource = server.resourceCalls.find(call => call.id === 'getIssue');
      expect(issueResource).toBeDefined();
      
      // Verify the URI template pattern matches our expected format
      expect(issueResource?.uri).toBeInstanceOf(ResourceTemplate);
      
      const resourceTemplate = issueResource?.uri as ResourceTemplate;
      const templatePattern = resourceTemplate.uriTemplate.toString();
      expect(templatePattern).toBe('https://example.com/orgs/{orgId}/repos/{repoId}/issues/{issueId}');
    });

    it('should handle path parameters with complex patterns', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Complex Path Params API', version: '1.0.0' },
        paths: {
          '/users/{username}/repos/{repo-name}/commits/{commit_sha}': {
            get: {
              operationId: 'getCommit',
              parameters: [
                { name: 'username', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'repo-name', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'commit_sha', in: 'path', required: true, schema: { type: 'string' } },
              ],
            },
          },
        },
      };

      const { server } = createResourcesFromSpec(spec);
      
      const commitResource = server.resourceCalls.find(call => call.id === 'getCommit');
      expect(commitResource).toBeDefined();
      
      // Check the template handles hyphenated and underscored parameters
      const resourceTemplate = commitResource?.uri as ResourceTemplate;
      const templatePattern = resourceTemplate.uriTemplate.toString();
      expect(templatePattern).toBe('https://example.com/users/{username}/repos/{repo-name}/commits/{commit_sha}');
    });
  });

  describe('Resource Classification Rules', () => {
    it('should not register resources with x-mcpify:ignore=resource config', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Resource Ignore API', version: '1.0.0' },
        paths: {
          '/ignored-resource/{id}': {
            get: {
              operationId: 'getIgnoredResource',
              'x-mcpify': {
                ignore: 'resource'
              },
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
              ],
            },
          },
          '/normal-resource/{id}': {
            get: {
              operationId: 'getNormalResource',
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
              ],
            },
          },
        },
      };

      const { server } = createResourcesFromSpec(spec);
      
      // Verify only the non-ignored resource is registered
      const resourceIds = server.resourceCalls.map(call => call.id);
      expect(resourceIds).not.toContain('getIgnoredResource');
      expect(resourceIds).toContain('getNormalResource');
    });

    it('should not register resources with x-mcpify:ignore=true config', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Ignore All API', version: '1.0.0' },
        paths: {
          '/completely-ignored/{id}': {
            get: {
              operationId: 'getCompletelyIgnored',
              'x-mcpify': {
                ignore: true
              },
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
              ],
            },
          },
        },
      };

      const { server } = createResourcesFromSpec(spec);
      
      // Verify the ignored resource is not registered
      const resourceIds = server.resourceCalls.map(call => call.id);
      expect(resourceIds).not.toContain('getCompletelyIgnored');
    });

    it('should not register resources with request body', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'GET with Body API', version: '1.0.0' },
        paths: {
          '/search/{entityType}': {
            get: {
              operationId: 'searchEntities',
              parameters: [
                { name: 'entityType', in: 'path', required: true, schema: { type: 'string' } },
              ],
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        query: { type: 'string' }
                      }
                    }
                  }
                }
              }
            },
          },
        },
      };

      const { server } = createResourcesFromSpec(spec);
      
      // Verify the GET with request body is not registered as a resource
      const resourceIds = server.resourceCalls.map(call => call.id);
      expect(resourceIds).not.toContain('searchEntities');
    });

    it('should not register resources with non-readonly safety annotations', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Safety Annotations API', version: '1.0.0' },
        paths: {
          '/unsafe-get/{id}': {
            get: {
              operationId: 'getUnsafe',
              'x-mcpify': {
                annotations: {
                  readOnlyHint: false,
                  destructiveHint: true
                }
              },
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
              ],
            },
          },
          '/safe-get/{id}': {
            get: {
              operationId: 'getSafe',
              'x-mcpify': {
                annotations: {
                  readOnlyHint: true
                }
              },
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
              ],
            },
          },
        },
      };

      const { server } = createResourcesFromSpec(spec);
      
      // Verify only the safe GET is registered as a resource
      const resourceIds = server.resourceCalls.map(call => call.id);
      expect(resourceIds).not.toContain('getUnsafe');
      expect(resourceIds).toContain('getSafe');
    });
  });

  describe('URI Template Handling', () => {
    it('should expose the template property correctly for testing', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Template API', version: '1.0.0' },
        paths: {
          '/files/{fileId}/versions/{versionId}': {
            get: {
              operationId: 'getFileVersion',
              parameters: [
                { name: 'fileId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'versionId', in: 'path', required: true, schema: { type: 'string' } },
              ],
            },
          },
        },
      };

      const { server } = createResourcesFromSpec(spec);
      
      const fileVersionResource = server.resourceCalls.find(call => call.id === 'getFileVersion');
      expect(fileVersionResource).toBeDefined();
      
      // Verify the URI template is accessible for testing
      const resourceTemplate = fileVersionResource?.uri as ResourceTemplate;
      expect(resourceTemplate.uriTemplate).toBeDefined();
      
      // Check that template is exposed through Object.defineProperty pattern
      const templatePattern = resourceTemplate.uriTemplate.toString();
      expect(templatePattern).toBe('https://example.com/files/{fileId}/versions/{versionId}');
    });

    it('should register simple paths as string URIs', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Simple Path API', version: '1.0.0' },
        paths: {
          '/status': {
            get: {
              operationId: 'getStatus',
            },
          },
        },
      };

      const { server } = createResourcesFromSpec(spec);
      
      const statusResource = server.resourceCalls.find(call => call.id === 'getStatus');
      expect(statusResource).toBeDefined();
      
      // Verify simple paths use string URIs, not ResourceTemplate
      expect(typeof statusResource?.uri).toBe('string');
      expect(statusResource?.uri).toBe('https://example.com/status');
    });

    it('should handle URI-reserved characters in path templates', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Reserved Chars API', version: '1.0.0' },
        paths: {
          '/users@{domain}/profile': {
            get: {
              operationId: 'getUserProfile',
              parameters: [
                { name: 'domain', in: 'path', required: true, schema: { type: 'string' } },
              ],
            },
          },
        },
      };

      const { server } = createResourcesFromSpec(spec);
      
      const profileResource = server.resourceCalls.find(call => call.id === 'getUserProfile');
      expect(profileResource).toBeDefined();
      
      // Verify the template handles special characters
      const resourceTemplate = profileResource?.uri as ResourceTemplate;
      const templatePattern = resourceTemplate.uriTemplate.toString();
      expect(templatePattern).toBe('https://example.com/users@{domain}/profile');
    });
  });

  describe('Edge Cases', () => {
    it('should register GET operations with empty parameters array', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Empty Params API', version: '1.0.0' },
        paths: {
          '/version': {
            get: {
              operationId: 'getVersion',
              parameters: [],
            },
          },
        },
      };

      const { server } = createResourcesFromSpec(spec);
      
      const versionResource = server.resourceCalls.find(call => call.id === 'getVersion');
      expect(versionResource).toBeDefined();
      expect(typeof versionResource?.uri).toBe('string');
    });

    it('should register GET operations with no parameters property', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'No Params API', version: '1.0.0' },
        paths: {
          '/health': {
            get: {
              operationId: 'getHealth',
              // No parameters property at all
            },
          },
        },
      };

      const { server } = createResourcesFromSpec(spec);
      
      const healthResource = server.resourceCalls.find(call => call.id === 'getHealth');
      expect(healthResource).toBeDefined();
      expect(typeof healthResource?.uri).toBe('string');
    });

    it('should handle operations with optional path parameters', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Optional Path Params API', version: '1.0.0' },
        paths: {
          '/items/{itemId?}': {
            get: {
              operationId: 'getItemsOrItem',
              parameters: [
                { name: 'itemId', in: 'path', required: false, schema: { type: 'string' } },
              ],
            },
          },
        },
      };

      const { server } = createResourcesFromSpec(spec);
      
      const itemsResource = server.resourceCalls.find(call => call.id === 'getItemsOrItem');
      expect(itemsResource).toBeDefined();
      
      // Verify optional path parameters are included in the template
      const resourceTemplate = itemsResource?.uri as ResourceTemplate;
      const templatePattern = resourceTemplate.uriTemplate.toString();
      expect(templatePattern).toBe('https://example.com/items/{itemId?}');
    });
  });
});
