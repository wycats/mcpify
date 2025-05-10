import type { LogLayer } from 'loglayer';
import type Oas from 'oas';
import type { OpenAPIV3 } from 'openapi-types';
import type { JSONSchema } from 'zod-from-json-schema';

/**
 * Handles extraction and management of response schemas from OpenAPI specifications
 */
export class ResponseSchemaExtractor {
  readonly #oas: Oas;
  readonly #log: LogLayer;
  readonly #cache = new Map<string, JSONSchema | null>();
  readonly #path: string;
  readonly #method: string;

  /**
   * Creates a new ResponseSchemaExtractor
   * 
   * @param oas - OpenAPI specification object with path and method information
   * @param log - Logger instance for debugging and error reporting
   */
  constructor(oas: Oas & { path: string; method: string }, log: LogLayer) {
    this.#oas = oas;
    this.#log = log;
    // Store path and method for easy access
    this.#path = oas.path;
    this.#method = oas.method;
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
      // Using standard OpenAPIV3 types for better type safety
      interface ApiDocument {
        paths?: Record<
          string,
          Record<
            string,
            {
              responses?: Record<string, OpenAPIV3.ResponseObject>;
            }
          >
        >;
      }

      // Isolate the any conversion to a single constrained location with appropriate comment
      const rawOas = this.#oas;
      // Type cast to OpenAPIV3 document type for type safety
      const api = rawOas.api as ApiDocument;

      // Navigate the structure with type safety using optional chaining
      const contentObj =
        api.paths?.[this.#path]?.[this.#method]?.responses?.[statusCode]?.content;

      // Return null if no content object exists
      if (!contentObj) {
        this.#log.debug(`No content object found for status code ${statusCode}`);
        return null;
      }

      // Get all available content types
      const contentTypes = Object.keys(contentObj);
      if (contentTypes.length === 0) {
        this.#log.debug(`No content types found for status code ${statusCode}`);
        return null;
      }
      
      // Since we've verified contentTypes has entries, we can safely use the first one
      // We've already checked length > 0, so we know this array has at least one element
      const firstContentType = contentTypes[0];
      
      // Start with the first content type as default
      // This is safe because we've verified contentTypes.length > 0 above
      let selectedContentType = firstContentType;
      
      if (contentTypes.includes('application/json')) {
        // Priority 1: application/json
        selectedContentType = 'application/json';
      } else {
        // Priority 2: JSON-compatible types
        const jsonCompatible = contentTypes.find(
          type => type.startsWith('application/') && 
            (type.endsWith('+json') || type.includes('json'))
        );
        
        if (jsonCompatible) {
          selectedContentType = jsonCompatible;
        }
        // Otherwise keep the default (first content type)
      }
      
      // TypeScript guard to ensure selectedContentType is a valid property key
      // This is redundant given our selection logic but satisfies TypeScript's type checker
      if (typeof selectedContentType !== 'string' || !(selectedContentType in contentObj)) {
        this.#log.debug(`Selected content type ${selectedContentType} not found in response for status code ${statusCode}`);
        return null;
      }

      // Now we can safely access contentObj with the selected content type
      // TypeScript now knows selectedContentType is a valid key in contentObj
      const contentTypeObj = contentObj[selectedContentType];
      
      // Use optional chaining for more concise property access
      const schema = contentTypeObj?.schema;
      if (!schema) {
        this.#log.debug(`No schema found for content type ${selectedContentType} and status code ${statusCode}`);
        return null;
      }

      // Check if this is a reference schema that could require resolution
      if ('$ref' in schema) {
        // Safe type assertion after checking for the property
        const refObj = schema as { $ref?: string };
        const refPath = refObj.$ref;
        
        if (refPath) {
          this.#log.info(`Schema for status code ${statusCode} contains reference: ${refPath} that may need resolution`);
          // Note: A more sophisticated reference resolver could be implemented here
          // but would require additional dependencies or complex path traversal logic
        }
      }
      
      // Convert the schema to JSONSchema format
      return schema as unknown as JSONSchema;
    } catch (error) {
      this.#log.error(
        `Error extracting response schema for status code ${statusCode}:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }

  /**
   * Gets a list of all available response status codes from the OpenAPI specification.
   * 
   * @returns Array of status codes as strings
   */
  getStatusCodes(): string[] {
    try {
      const api = this.#oas.api as {
        paths?: Record<
          string,
          Record<string, { responses?: Record<string, unknown> }>
        >;
      };

      const responses = api.paths?.[this.#path]?.[this.#method]?.responses;
      
      if (!responses) {
        return [];
      }

      return Object.keys(responses);
    } catch (error) {
      this.#log.error(
        'Error getting response status codes:',
        error instanceof Error ? error.message : String(error),
      );
      return [];
    }
  }
}
