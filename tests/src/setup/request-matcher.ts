import qs from 'qs';
import { expect } from 'vitest';

export interface ExpectedRequest {
  url?: string;
  query?: Record<string, string | string[]>;
  method?: string;
  headers?: Headers;
  body?: object; // JSON-serialisable
}

// Helper to parse the request body based on content type
async function parseRequestBody(
  request: Request,
): Promise<{ parsed: unknown; contentType: string | null }> {
  const text = await request.clone().text(); // don't consume original
  let parsed: unknown;

  const contentType = request.headers.get('content-type');

  if (contentType?.includes('application/x-www-form-urlencoded')) {
    parsed = qs.parse(text);
  } else {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  return { parsed, contentType };
}

// Checks if two values are equal (for primitives)
function areEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  // Handle special cases like NaN
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) return true;

  return false;
}

// Simple deep equality check
function deepEqual(a: unknown, b: unknown): boolean {
  // Handle primitives
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return areEqual(a, b);
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Handle objects
  const keysA = Object.keys(a);
  const keysB = new Set(Object.keys(b));

  // Check if all keys in a are in b with equal values
  for (const key of keysA) {
    if (!keysB.has(key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
      return false;
    keysB.delete(key);
  }

  // Check if any keys in b are not in a
  return keysB.size === 0;
}

/* --- Register the matcher with Vitest --------------------------- */
expect.extend({
  async toMatchRequest(this, received: Request, expected: ExpectedRequest) {
    // Validate URL
    if (expected.url !== undefined) {
      const expectedUrl = new URL(`https://example.com${expected.url}`);

      // Add query parameters to URL
      for (const [key, value] of Object.entries(expected.query ?? {})) {
        if (Array.isArray(value)) {
          for (const v of value) {
            expectedUrl.searchParams.append(key, v);
          }
        } else {
          expectedUrl.searchParams.set(key, value);
        }
      }

      const expectedUrlString = String(expectedUrl);
      if (received.url !== expectedUrlString) {
        return {
          pass: false,
          actual: received.url,
          expected: expectedUrlString,
          message: () => `URL mismatch`,
        };
      }
    }

    // Validate method
    if (expected.method !== undefined) {
      const expectedMethod = expected.method.toLowerCase();
      const receivedMethod = received.method.toLowerCase();

      if (receivedMethod !== expectedMethod) {
        return {
          pass: false,
          actual: receivedMethod,
          expected: expectedMethod,
          message: () => `Method mismatch`,
        };
      }
    }

    // Validate headers
    if (expected.headers !== undefined) {
      const actualHeaders = Object.fromEntries(received.headers);
      const expectedHeaders = Object.fromEntries(
        Object.entries(expected.headers).map(([k, v]) => [k.toLowerCase(), v as unknown]),
      );

      for (const [key, expectedValue] of Object.entries(expectedHeaders)) {
        const actualValue = actualHeaders[key];

        if (actualValue === undefined) {
          return {
            pass: false,
            actual: actualValue,
            expected: expectedValue,
            message: () => `Missing header: ${key}`,
          };
        } else if (actualValue !== expectedValue) {
          return {
            pass: false,
            actual: actualValue,
            expected: expectedValue,
            message: () => `Header '${key}' mismatch`,
          };
        }
      }
    }

    // Validate body
    if (expected.body !== undefined) {
      const { parsed, contentType } = await parseRequestBody(received);

      // Do a deep equality check first
      if (!deepEqual(parsed, expected.body)) {
        // This is the key part: we're NOT throwing an error with a message
        // Instead, we're returning the objects so Vitest can generate a diff
        return {
          pass: false,
          actual: parsed,
          expected: expected.body,
          message: () => `Request body (contentType: ${contentType}) did not match expected body`,
        };
      }
    }

    // Everything passed
    return {
      pass: true,
      message: () => 'Request matched expected shape',
    };
  },
});

/* --- Type declarations so TS recognises the matcher ------------- */
declare module 'vitest' {
  // make it awaitable to avoid dangling promises
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<T> {
    toMatchRequest(expected: ExpectedRequest): Promise<void>;
  }
  interface AsymmetricMatchersContaining {
    toMatchRequest(expected: ExpectedRequest): Promise<void>;
  }
}
