import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { LogLayer } from 'loglayer';
import type { Operation } from 'oas/operation';
import type { z } from 'zod';

import { CustomExtensions } from './operation/custom-extensions.ts';
import type { CustomExtensionsInterface } from './operation/custom-extensions.ts';
import { McpifyOperation } from './operation/ext.ts';
import { buildRequest } from './request/request-builder.ts';
import { ResponseHandler } from './response/response-handler.ts';

export type IntoOperationExtensions = CustomExtensionsInterface | CustomExtensions;
export type PathOperation = Operation;

type InvokeResult = CallToolResult | ReadResourceResult;

/**
 * Client for invoking operations as tool calls
 */
export class OperationClient<T extends InvokeResult = InvokeResult> {
  static tool(app: { log: LogLayer }, operation: McpifyOperation): OperationClient<CallToolResult> {
    const responseHandler = new ResponseHandler(app.log, operation);
    return new OperationClient(app, operation, async (response) => {
      return responseHandler.handleToolResponse(response);
    });
  }

  static resource(
    app: { log: LogLayer },
    operation: McpifyOperation,
  ): OperationClient<ReadResourceResult> {
    const responseHandler = new ResponseHandler(app.log, operation);
    return new OperationClient(app, operation, async (response) => {
      return responseHandler.handleResourceResponse(response);
    });
  }

  readonly #app: { log: LogLayer };
  readonly #operation: McpifyOperation;

  readonly #invoke: (response: Response) => Promise<T>;

  private constructor(
    app: { log: LogLayer },
    operation: McpifyOperation,
    invoke: (response: Response) => Promise<T>,
  ) {
    this.#app = app;
    this.#operation = operation;
    this.#invoke = invoke;
  }

  get op(): McpifyOperation {
    return this.#operation;
  }

  toResource(): OperationClient<ReadResourceResult> {
    return OperationClient.resource(this.#app, this.#operation);
  }

  /**
   * Invokes the operation as a tool call
   * @param args The arguments to pass to the operation
   * @returns A CallToolResult object representing the response
   */
  async invoke(args: z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>): Promise<T> {
    const response = await executeRequest(this.#operation, this.#app, args);

    return this.#invoke(response);
  }
}

/**
 * Creates the appropriate client for an operation
 * @param operation The operation to create a client for
 * @param extensions Custom extensions for the operation
 * @param options Application options including logging
 * @returns A ResourceClient, OperationClient, or null if the operation is invalid
 */
export function createClient(
  operation: PathOperation,
  extensions: IntoOperationExtensions,
  options: { log: LogLayer },
): OperationClient {
  const ext = CustomExtensions.of(extensions);
  const mcpifyOperation = McpifyOperation.from(operation, ext, options);

  if (mcpifyOperation.isResource) {
    return OperationClient.resource(options, mcpifyOperation);
  } else {
    return OperationClient.tool(options, mcpifyOperation);
  }
} /**
 * Executes a network request with the given arguments and returns the raw response
 */

export async function executeRequest(
  operation: McpifyOperation,
  app: { log: LogLayer },
  args: z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>,
): Promise<Response> {
  const request = buildRequest(app, operation, args);
  return fetch(request);
}
