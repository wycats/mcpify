import type { LogLayer } from 'loglayer';
import type Oas from 'oas';
import type { Operation } from 'oas/operation';
import type { OpenAPIV3 } from 'openapi-types';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { OperationClient } from '../client.ts';
import type { PathOperation } from '../client.ts';
import { McpifyOperation } from '../operation/ext.ts';
import { HttpVerb } from '../safety.ts';

import { testApp } from './create-oas.ts';

/**
 * Result type for creating test operations
 */
export interface TestOperation {
  oas: Oas;
  log: LogLayer;
  operation: PathOperation;
  client: OperationClient;
}

/**
 * Configuration options for creating test operations
 */
export interface TestOperationOptions {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  pathParams?: string[];
  queryParams?: string[];
  requestBodySchema?: z.ZodObject<z.ZodRawShape> | undefined;
  contentType?: string | undefined;
  responseSchemas?: Record<string, z.ZodObject<z.ZodRawShape>>;
  customResponses?: Record<
    string,
    {
      description: string;
      content?: Record<string, { schema?: OpenAPIV3.SchemaObject }>;
    }
  >;
  // New options for more flexibility
  serverUrl?: string | undefined;
  path?: string | undefined;
}

/**
 * Creates a test operation with the specified configuration.
 * This is a unified utility that consolidates multiple similar functions
 * used across different test files.
 *
 * @param options - Configuration options for the test operation
 * @returns Test operation instance with all associated objects
 */
export function createTestOperation(options: TestOperationOptions): TestOperation {
  const {
    method,
    pathParams = [],
    queryParams = [],
    requestBodySchema,
    contentType = 'application/json',
    responseSchemas = {},
    customResponses,
    serverUrl = 'https://example.com',
    path = '/test/{id}',
  } = options;

  // Create app with test logger
  const { app } = testApp();
  const { log } = app;

  // Create path parameters
  const parameters: OpenAPIV3.ParameterObject[] = [
    ...pathParams.map((name) => ({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string' } as OpenAPIV3.SchemaObject,
    })),
    ...queryParams.map((name) => ({
      name,
      in: 'query',
      required: false,
      schema: { type: 'string' } as OpenAPIV3.SchemaObject,
    })),
  ];

  // Create request body if specified
  let requestBody: OpenAPIV3.RequestBodyObject | undefined;
  if (requestBodySchema) {
    requestBody = {
      required: true,
      content: {
        [contentType]: {
          schema: zodToJsonSchema(requestBodySchema) as OpenAPIV3.SchemaObject,
        },
      },
    };
  }

  // Process response schemas
  const responses: Record<string, OpenAPIV3.ResponseObject> = customResponses ?? {};

  // If custom responses weren't provided, create them from response schemas
  if (!customResponses) {
    for (const [statusCode, schema] of Object.entries(responseSchemas)) {
      responses[statusCode] = {
        description: `${statusCode} response`,
        content: {
          'application/json': {
            schema: zodToJsonSchema(schema) as OpenAPIV3.SchemaObject,
          },
        },
      };
    }

    // Ensure we have at least one response for OpenAPI validation
    if (Object.keys(responses).length === 0) {
      responses['200'] = {
        description: '200 OK',
      };
    }
  }

  // Create a mock operation for testing
  const operation = {
    method,
    path,
    getParameters: (): OpenAPIV3.ParameterObject[] => parameters,
    hasRequestBody: (): boolean => !!requestBody,
    getOperationId: () => 'testOperation',
    getContentType: () => contentType || 'application/json',
    isJson: () => !contentType || contentType === 'application/json',
    isFormUrlEncoded: () => contentType === 'application/x-www-form-urlencoded',
    api: {
      servers: [{ url: serverUrl }],
    },
    url: () => serverUrl,
    requestBody,
    responses,
    operationId: 'testOperation',
  } as unknown as Operation;

  // Mock OAS for testing
  const oas = {
    operation: () => operation,
  } as unknown as Oas;

  // Check if operation is valid
  const verb = HttpVerb.from(method);
  if (!verb) {
    throw new Error(`Unsupported HTTP method: ${method}`);
  }

  // Create OperationClient instance
  const client = OperationClient.tool({ log }, McpifyOperation.from(operation, {}, { log }));

  return {
    oas,
    log,
    operation,
    client,
  };
}
