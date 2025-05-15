import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { LogLayer } from 'loglayer';
import type { Operation } from 'oas/operation';

import type { McpifyOperation } from '../operation/ext.ts';

/**
 * Handles response processing for API operations
 */
export class ResponseHandler {
  #log: LogLayer;
  #operation: McpifyOperation;

  constructor(log: LogLayer, operation: McpifyOperation) {
    this.#log = log;
    this.#operation = operation;
  }

  /**
   * Processes an error response
   * @param response The error response to process
   * @returns A CallToolResult representing the error
   */
  async handleErrorResponse(response: Response): Promise<CallToolResult> {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: await response.text(),
        },
      ],
    };
  }

  /**
   * Processes a successful response for tool calls
   * @param response The successful response to process
   * @returns A CallToolResult representing the successful response
   */
  async handleToolResponse(response: Response): Promise<CallToolResult> {
    return toResponseContent(response, this.#log, this.#operation);
  }

  /**
   * Processes a response for resource reading
   * @param response The response to process
   * @returns A ReadResourceResult representing the resource contents
   */
  async handleResourceResponse(response: Response): Promise<ReadResourceResult> {
    const mime = response.headers.get('Content-Type');

    if (isText(this.#operation.inner)) {
      return {
        contents: [
          { uri: response.url, mimeType: mime ?? 'text/plain', text: await response.text() },
        ],
      };
    } else {
      const blob = await response.arrayBuffer();
      // base64 encode
      const encoded = Buffer.from(blob).toString('base64');
      return {
        contents: [
          { uri: response.url, mimeType: mime ?? 'application/octet-stream', blob: encoded },
        ],
      };
    }
  }
}

/**
 * Determines if an operation returns text content
 */
export function isText(op: Operation): boolean {
  try {
    const schema = op.getResponseAsJSONSchema(200);
    // If schema exists and has 'binary' format, it's not text
    // Otherwise, return true (default to text)
    return schema.format !== 'binary';
  } catch {
    // If we can't get the schema, default to text
    return true;
  }
}

/**
 * Converts a Response to a CallToolResult
 */
export async function toResponseContent(
  response: Response,
  log: LogLayer,
  ext: McpifyOperation,
): Promise<CallToolResult> {
  switch (ext.responseType) {
    case 'text/plain': {
      const text = await response.text();
      log.info(`Response from ${ext.describe()}:`, text);

      return {
        content: [
          {
            type: 'text',
            text,
          },
        ],
      };
    }

    case 'application/json': {
      const json = await response.json();
      log.info(`Response from ${ext.describe()}:`, JSON.stringify(json));

      // TODO: Limit the special-case embedding to situations where we know for sure that
      // we have a mapped resource.
      return {
        content: [
          {
            type: 'resource',
            resource: {
              uri: response.url,
              mimeType: ext.responseType,
              text: JSON.stringify(json),
            },
          },
        ],
      };
    }

    case 'application/x-www-form-urlencoded': {
      const formData = await response.formData();
      const search = new URLSearchParams(Object.entries(formData));
      log.info(`Response from ${ext.describe()}:`, JSON.stringify(formData));

      return {
        content: [
          {
            type: 'resource',
            resource: {
              uri: response.url,
              mimeType: ext.responseType,
              text: String(search),
            },
          },
        ],
      };
    }

    default: {
      // Default fallback to text
      const text = await response.text();
      log.info(`Response from ${ext.describe()} (fallback):`, text);

      return {
        content: [
          {
            type: 'text',
            text,
          },
        ],
      };
    }
  }
}
