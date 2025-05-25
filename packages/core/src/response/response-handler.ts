import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { LogLayer } from 'loglayer';
import type { Operation } from 'oas/operation';

import type { QuickMcpOperation } from '../operation/ext.ts';

/**
 * Types of content that can be returned in a tool response
 */
type ContentType = 'text' | 'resource';

/**
 * Common structure for representing response content
 */
interface ResponseContentOptions {
  type: ContentType;
  uri: string;
  mimeType: string;
  content: string;
}

/**
 * Creates an error tool response
 */
async function createToolError(
  response: Response,
  log: LogLayer,
  operation: QuickMcpOperation,
): Promise<CallToolResult> {
  const errorText = await response.text();
  log.warn(`Error response from ${operation.describe()}:`, errorText);
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: errorText,
      },
    ],
  };
}

/**
 * Processes a response for tool calls.
 *
 * If the response is successful, it will be processed based on the operation's
 * response type. If the response is an error, it will be processed as text.
 *
 * @param response The successful response to process
 * @param log Logger instance
 * @param operation QuickMcpOperation instance
 * @returns A CallToolResult representing the successful response
 */
export async function handleToolResponse(
  response: Response,
  log: LogLayer,
  operation: QuickMcpOperation,
): Promise<CallToolResult> {
  if (response.status >= 400) {
    return createToolError(response, log, operation);
  }

  return toResponseContent(response, log, operation);
}

/**
 * Creates a resource error response
 */
function createResourceError(uri: string, mimeType: string, errorText: string): ReadResourceResult {
  return {
    isError: true,
    contents: [
      {
        uri,
        mimeType,
        text: errorText,
      },
    ],
  };
}

/**
 * Creates a text resource response
 */
function createTextResource(uri: string, mimeType: string, text: string): ReadResourceResult {
  return {
    contents: [{ uri, mimeType, text }],
  };
}

/**
 * Creates a binary resource response
 */
function createBinaryResource(
  uri: string,
  mimeType: string,
  data: ArrayBuffer,
): ReadResourceResult {
  const encoded = Buffer.from(data).toString('base64');
  return {
    contents: [{ uri, mimeType, blob: encoded }],
  };
}

/**
 * Processes a response for resource reading.
 *
 * If the response is successful, it will be processed based on the operation's
 * response type. If the response is an error, it will be processed as text.
 *
 * @param response The response to process
 * @param log Logger instance
 * @param operation QuickMcpOperation instance
 * @returns A ReadResourceResult representing the resource contents
 */
export async function handleResourceResponse(
  response: Response,
  log: LogLayer,
  operation: QuickMcpOperation,
): Promise<ReadResourceResult> {
  const uri = response.url;
  const mime = response.headers.get('Content-Type') ?? 'text/plain';

  // Handle error responses
  if (response.status >= 400) {
    const errorText = await response.text();
    log.warn(`Error response from ${operation.describe()}:`, errorText);
    return createResourceError(uri, mime, errorText);
  }

  // For successful responses, determine if text or binary
  if (isText(operation.inner)) {
    const text = await response.text();
    return createTextResource(uri, mime, text);
  } else {
    const data = await response.arrayBuffer();
    const binaryMime = mime === 'text/plain' ? 'application/octet-stream' : mime;
    return createBinaryResource(uri, binaryMime, data);
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
 * Creates a text content response
 */
function createTextContent(text: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

/**
 * Creates a resource content response
 */
function createResourceContent(options: ResponseContentOptions): CallToolResult {
  if (options.type === 'resource') {
    return {
      content: [
        {
          type: 'resource',
          resource: {
            uri: options.uri,
            mimeType: options.mimeType,
            text: options.content,
          },
        },
      ],
    };
  }
  return createTextContent(options.content);
}

/**
 * Extracts and formats content from a response based on its type
 */
async function extractResponseContent(response: Response, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/json': {
      const json = await response.json();
      return JSON.stringify(json);
    }
    case 'application/x-www-form-urlencoded': {
      const formData = await response.formData();
      const search = new URLSearchParams(Object.entries(formData));
      return String(search);
    }
    default:
      return await response.text();
  }
}

/**
 * Converts a Response to a CallToolResult
 */
export async function toResponseContent(
  response: Response,
  log: LogLayer,
  ext: QuickMcpOperation,
): Promise<CallToolResult> {
  const content = await extractResponseContent(response, ext.responseType);

  // Log appropriately based on response type
  log.info(`Response from ${ext.describe()}:`, content);

  // Determine if the response should be a resource or text
  const isResourceType = ['application/json', 'application/x-www-form-urlencoded'].includes(
    ext.responseType,
  );

  const options: ResponseContentOptions = {
    type: isResourceType ? 'resource' : 'text',
    uri: response.url,
    mimeType: ext.responseType,
    content,
  };

  return createResourceContent(options);
}
