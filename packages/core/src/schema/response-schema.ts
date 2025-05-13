import type { LogLayer } from 'loglayer';
import type Oas from 'oas';
import type { HttpMethods } from 'oas/types';
import type { JSONSchema } from 'zod-from-json-schema';

import type { PathOperation } from '../parameter-mapper.ts';

export interface OpPointer {
  path: string;
  method: HttpMethods;
}

/**
 * Handles extraction and management of response schemas from OpenAPI specifications
 */
export class ResponseSchemaExtractor {
  static from(oas: Oas, pointer: OpPointer, log: LogLayer): ResponseSchemaExtractor {
    const op = oas.getOperation(pointer.path, pointer.method);
    return new ResponseSchemaExtractor(op, log);
  }

  static fromOp(op: PathOperation, log: LogLayer): ResponseSchemaExtractor {
    return new ResponseSchemaExtractor(op, log);
  }

  readonly #op: PathOperation;
  readonly #log: LogLayer;
  readonly #cache = new Map<string, JSONSchema | null>();
  #statusCodes: string[] = [];

  /**
   * Creates a new ResponseSchemaExtractor
   *
   * @param oas - OpenAPI specification object with path and method information
   * @param log - Logger instance for debugging and error reporting
   */
  private constructor(op: PathOperation, log: LogLayer) {
    this.#op = op;
    this.#log = log;
    
    // Initialize status codes cache
    this.#statusCodes = this.#op.getResponseStatusCodes();
  }

  /**
   * Retrieves the response schema for a specific status code.
   * Results are cached for better performance.
   * If the specific status code is not found, it falls back to 'default'.
   *
   * @param code - HTTP status code (e.g., '200', '404') or 'default'
   * @returns JSON Schema for the response or null if not found
   */
  getSchema(code: string): JSONSchema | null {
    // Check cache first
    if (this.#cache.has(code)) {
      return this.#cache.get(code) ?? null;
    }

    try {
      // Try to get the schema for the specific status code
      let schema = this.#extractSchema(code);

      // If not found and it's not 'default', try the default schema
      if (!schema && code !== 'default') {
        schema = this.#extractSchema('default');
      }

      // Cache the result (even if null)
      this.#cache.set(code, schema);
      return schema;
    } catch (error) {
      this.#log.error(
        `Error getting response schema for status code ${code}:`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  /**
   * Extract response schema for a specific status code from the OpenAPI specification
   *
   * This method retrieves the response schema for the specified status code.
   * It handles errors and returns null if the schema is not found.
   *
   * @param statusCode - HTTP status code (e.g., '200', '404') or 'default'
   * @returns JSON Schema for the response or null if not found
   */
  #extractSchema(statusCode: string): JSONSchema | null {
    try {
      const response = this.#op.getResponseByStatusCode(statusCode);

      if (typeof response === 'boolean') {
        this.#log.debug(`No response found for status code ${statusCode}`);
        return null;
      }

      const content = response.content;

      if (!content) {
        this.#log.debug(`No content found for status code ${statusCode}`);
        return null;
      }

      const hasJson = 'application/json' in content;
      // Get all available content types
      const [firstContentType] = Object.keys(content);
      if (firstContentType === undefined) {
        this.#log.debug(`No content types found for status code ${statusCode}`);
        return null;
      }

      // Start with the first content type as default
      let selectedContentType = firstContentType;

      if (hasJson) {
        // Priority 1: application/json
        selectedContentType = 'application/json';
      } else {
        // Priority 2: JSON-compatible types
        const jsonCompatible = Object.keys(content).find(
          (type) =>
            type.startsWith('application/') && (type.endsWith('+json') || type.includes('json')),
        );

        if (jsonCompatible) {
          selectedContentType = jsonCompatible;
        }
        // Otherwise keep the default (first content type)
      }

      // TypeScript guard to ensure selectedContentType is a valid property key
      // This is redundant given our selection logic but satisfies TypeScript's type checker
      if (typeof selectedContentType !== 'string' || !(selectedContentType in content)) {
        this.#log.debug(
          `Selected content type ${selectedContentType} not found in response for status code ${statusCode}`,
        );
        return null;
      }

      // Now we can safely access contentObj with the selected content type
      // TypeScript now knows selectedContentType is a valid key in contentObj
      const contentTypeObj = content[selectedContentType];

      // Use optional chaining for more concise property access
      const schema = contentTypeObj?.schema;
      if (!schema) {
        this.#log.debug(
          `No schema found for content type ${selectedContentType} and status code ${statusCode}`,
        );
        return null;
      }

      return schema as JSONSchema;
    } catch (error) {
      this.#log.error(
        `Error extracting response schema for status code ${statusCode}`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  /**
   * Gets a list of all available response status codes from the OpenAPI specification.
   * Results are cached for better performance.
   *
   * @returns Array of status codes as strings
   */
  getStatusCodes(): string[] {
    return [...this.#statusCodes];
  }
  
  // [Cache invalidation feature removed as it's rarely used in production environments]
}
