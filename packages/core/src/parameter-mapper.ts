import type { OpenAPIV3 } from 'openapi-types';

/**
 * Maps OpenAPI schema types to JSON Schema types for MCP tools
 */
export function mapSchemaType(schema: OpenAPIV3.SchemaObject): Record<string, unknown> {
  // Start with a basic schema
  const result: Record<string, unknown> = {};

  // Map basic types
  if (schema.type) {
    result.type = schema.type;
  }

  // Handle format if specified
  if (schema.format) {
    result.format = schema.format;
  }

  // Handle enum values
  if (schema.enum) {
    result.enum = schema.enum;
  }

  // Handle minimum/maximum constraints for numbers
  if (schema.type === 'integer' || schema.type === 'number') {
    if (schema.minimum !== undefined) {
      result.minimum = schema.minimum;
    }
    if (schema.maximum !== undefined) {
      result.maximum = schema.maximum;
    }
    if (schema.exclusiveMinimum !== undefined) {
      result.exclusiveMinimum = schema.exclusiveMinimum;
    }
    if (schema.exclusiveMaximum !== undefined) {
      result.exclusiveMaximum = schema.exclusiveMaximum;
    }
    if (schema.multipleOf !== undefined) {
      result.multipleOf = schema.multipleOf;
    }
  }

  // Handle string constraints
  if (schema.type === 'string') {
    if (schema.minLength !== undefined) {
      result.minLength = schema.minLength;
    }
    if (schema.maxLength !== undefined) {
      result.maxLength = schema.maxLength;
    }
    if (schema.pattern !== undefined) {
      result.pattern = schema.pattern;
    }
  }

  // Handle array constraints
  if (schema.type === 'array' && schema.items !== undefined) {
    // For arrays, we need to map the items schema - by this point schema.items is guaranteed to exist
    if ('$ref' in schema.items) {
      // Handle reference, but this is simplified
      result.items = { type: 'object' };
    } else {
      // We've confirmed schema.items exists and isn't a $ref, so it's a SchemaObject
      result.items = mapSchemaType(schema.items);
    }

    if (schema.minItems !== undefined) {
      result.minItems = schema.minItems;
    }
    if (schema.maxItems !== undefined) {
      result.maxItems = schema.maxItems;
    }
    if (schema.uniqueItems !== undefined) {
      result.uniqueItems = schema.uniqueItems;
    }
  }

  // Handle object properties
  if (schema.type === 'object' && schema.properties) {
    const properties: Record<string, unknown> = {};
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      if ('$ref' in propSchema) {
        // Handle references, simplified for now
        properties[propName] = { type: 'object' };
      } else {
        properties[propName] = mapSchemaType(propSchema);
      }
    }
    result.properties = properties;

    // Add required properties if specified
    const requiredProps = schema.required;
    if (requiredProps && requiredProps.length > 0) {
      result.required = requiredProps;
    }
  }

  // Add description if available
  if (schema.description) {
    result.description = schema.description;
  }

  // Add default value if specified
  if (schema.default !== undefined) {
    result.default = schema.default;
  }

  return result;
}

/**
 * Extracts and maps parameter schemas from an OpenAPI operation
 * Returns a format compatible with MCP SDK tool parameter registration
 */
export function extractParameterSchemas(
  operation: OpenAPIV3.OperationObject,
  path: string,
): Record<string, unknown> {
  const parameterSchemas: Record<string, unknown> = {};
  
  // First collect all parameter names to ensure we create entries for all of them
  const parameterNames = extractAllParameterNames(operation, path);

  // Function to extract path params from a path template
  const extractPathParams = (pathTemplate: string): string[] => {
    const matches = pathTemplate.match(/\{([^}]+)\}/g) ?? [];
    return matches.map((match) => match.slice(1, -1));
  };

  // Process path parameters
  const pathParams = extractPathParams(path);
  for (const paramName of pathParams) {
    // Default schema for path parameters if not specified elsewhere
    parameterSchemas[paramName] = {
      type: 'string',
      description: `Path parameter: ${paramName}`,
    };
  }

  // Process operation parameters
  if (operation.parameters) {
    for (const param of operation.parameters) {
      if ('$ref' in param) continue; // Skip references for simplicity

      if (param.name) {
        // Create a proper schema based on the parameter definition
        const paramSchema: Record<string, unknown> = {};

        // Set the description
        if (param.description) {
          paramSchema.description = param.description;
        }

        // Get the schema from the parameter
        if (param.schema) {
          if ('$ref' in param.schema) {
            // For references, just use a basic object type for now
            paramSchema.type = 'object';
          } else {
            // Map the schema properly
            Object.assign(paramSchema, mapSchemaType(param.schema));
          }
        } else {
          // Default to string type if no schema is provided
          paramSchema.type = 'string';
        }

        // Mark required status
        paramSchema.required = param.required === true;

        // Store the mapped schema
        parameterSchemas[param.name] = paramSchema;
      }
    }
  }

  // Process request body parameters
  const requestBodyObj = operation.requestBody as OpenAPIV3.RequestBodyObject | undefined;
  const jsonContent = requestBodyObj?.content ? requestBodyObj.content['application/json'] : undefined;
  const schema = jsonContent?.schema as OpenAPIV3.SchemaObject | undefined;

  if (schema) {
    if (schema.type === 'object' && schema.properties) {
      // Extract individual properties from the request body
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if ('$ref' in propSchema) {
          // For references, use a basic object type for now
          parameterSchemas[propName] = {
            type: 'object',
            description: `Request body property: ${propName}`,
          };
        } else {
          // Map the property schema
          parameterSchemas[propName] = {
            ...mapSchemaType(propSchema),
            description: propSchema.description ?? `Request body property: ${propName}`,
            required: schema.required?.includes(propName) ?? false,
          };
        }
      }
    } else {
      // For non-object schemas, add a 'body' parameter
      parameterSchemas['body'] = {
        ...mapSchemaType(schema),
        description: 'Request body',
        required: requestBodyObj?.required ?? false,
      };
    }
  }

  // Ensure all parameters are defined, even if just as basic required flags
  for (const name of parameterNames) {
    // If we haven't mapped a detailed schema, at least mark it as required
    parameterSchemas[name] ??= { required: true };
  }

  return parameterSchemas;
}

/**
 * Extract all parameter names from an operation to ensure complete coverage
 */
function extractAllParameterNames(operation: OpenAPIV3.OperationObject, path: string): string[] {
  const parameterNames: string[] = [];

  // Extract path params from a path template
  const extractPathParams = (pathTemplate: string): string[] => {
    const matches = pathTemplate.match(/\{([^}]+)\}/g) ?? [];
    return matches.map((match) => match.slice(1, -1));
  };

  // Add path parameters
  const pathParams = extractPathParams(path);
  parameterNames.push(...pathParams);

  // Add parameters from operation
  if (operation.parameters) {
    for (const param of operation.parameters) {
      if ('$ref' in param) continue;

      if (param.name) {
        parameterNames.push(param.name);
      }
    }
  }

  // Add request body parameters if present
  const requestBodyObj = operation.requestBody as OpenAPIV3.RequestBodyObject | undefined;
  const jsonContent = requestBodyObj?.content ? requestBodyObj.content['application/json'] : undefined;
  const schema = jsonContent?.schema as OpenAPIV3.SchemaObject | undefined;

  if (schema) {
    if (schema.type === 'object' && schema.properties) {
      // Extract individual properties from request body
      for (const propName of Object.keys(schema.properties)) {
        parameterNames.push(propName);
      }
    } else {
      // For non-object schemas, add a 'body' parameter
      parameterNames.push('body');
    }
  }

  return Array.from(new Set(parameterNames)); // Remove duplicates
}
