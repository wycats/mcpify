// Removed Oas import since we're using UrlProvider interface
import type Oas from 'oas';
import type { z } from 'zod';

/**
 * Minimal interface for objects with a url() method
 */
export interface UrlProvider extends Partial<Oas> {
  url(): string;
}

/**
 * Type for OpenAPI request arguments
 */
export type OasRequestArgs = z.objectOutputType<z.ZodRawShape, z.ZodTypeAny>;

/**
 * Get the base URL from an OpenAPI specification.
 * Falls back to a default URL if none is specified in the OAS.
 *
 * @param urlProvider - Object that provides a url() method (e.g. OpenAPI specification)
 * @returns Base URL for API requests
 */
export function getBaseUrl(urlProvider: UrlProvider): string {
  const url = urlProvider.url();

  // Remove trailing slashes for consistency
  if (url.endsWith('/')) {
    return url.slice(0, -1);
  }

  return url;
}

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;

  it('should return the base URL from the OAS', () => {
    // Create mock with a URL
    const provider: UrlProvider = { url: () => 'https://api.example.com' };
    expect(getBaseUrl(provider)).toBe('https://api.example.com');
  });

  it('should remove trailing slashes', () => {
    const provider: UrlProvider = { url: () => 'https://api.example.com/' };
    expect(getBaseUrl(provider)).toBe('https://api.example.com');
  });
}
