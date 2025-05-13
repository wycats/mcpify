import { TestLoggingLibrary, TestTransport } from 'loglayer';
import type { LogLayer, LogLevel } from 'loglayer';
import type Oas from 'oas';
import type { OpenAPIV3 } from 'openapi-types';

import { App } from '../main.ts';
import { parseSpec } from '../openapi.ts';

/**
 * Creates a normalized Oas instance from an OpenAPI specification object
 *
 * This ensures that references are resolved consistently in tests,
 * using the same normalization process as the real application.
 *
 * @param spec - OpenAPI specification object
 * @returns Promise resolving to a normalized Oas instance
 */
export async function createNormalizedOas(spec: object): Promise<Oas> {
  const { spec: normalizedSpec } = await parseSpec(spec);
  return normalizedSpec;
}

/**
 * Creates an OpenAPI specification document object with the provided paths, components and info
 *
 * @param paths - OpenAPI paths object
 * @param components - OpenAPI components object (optional)
 * @param info - OpenAPI info object (optional)
 * @returns OpenAPI specification document
 */
export function createSpecObject(
  paths: OpenAPIV3.PathsObject,
  components?: OpenAPIV3.ComponentsObject,
  info?: Partial<OpenAPIV3.InfoObject>,
): OpenAPIV3.Document {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Test API',
      version: '1.0.0',
      ...info,
    },
    paths,
    ...(components ? { components } : {}),
  };
}

/**
 * Convenience function to create a normalized Oas instance with paths, components, and info
 *
 * This is the recommended function to use in tests when creating OpenAPI specs
 * as it ensures consistent normalization and reference resolution.
 *
 * @param paths - OpenAPI paths object
 * @param components - OpenAPI components object (optional)
 * @param info - OpenAPI info object (optional)
 * @returns Promise resolving to a normalized Oas instance
 */
export async function createTestOas(
  paths: OpenAPIV3.PathsObject,
  components?: OpenAPIV3.ComponentsObject,
  info?: Partial<OpenAPIV3.InfoObject>,
): Promise<Oas> {
  const spec = createSpecObject(paths, components, info);
  return createNormalizedOas(spec);
}

/**
 * Creates a logger instance for testing
 *
 * @returns Log layer instance for testing
 */
export function createTestLogger(): LogLayer {
  const { app } = testApp();
  return app.log;
}

export type LogLevelString = keyof typeof LogLevel;

export function testApp(): { app: App; test: TestLoggingLibrary } {
  const test = new TestLoggingLibrary();
  const log = new TestTransport({
    logger: test,
  });
  const app = new App({ log });

  return { app, test };
}
