import type Oas from 'oas';

/**
 * Creates a test OAS spec object with a specified base URL.
 * @param baseUrl Base URL for the fake specification.
 * @returns An OAS object with a url() method.
 */
export function createSpec(baseUrl = 'https://api.example.com'): Oas {
  return {
    url: () => baseUrl,
  } as Oas;
}
