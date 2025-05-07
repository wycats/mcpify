import { expect } from 'vitest';

export interface ExpectedRequest {
  url?: string;
  query?: Record<string, string | string[]>;
  method?: string;
  headers?: Headers;
  body?: object; // JSON-serialisable
}

async function compareRequest(received: Request, expected: ExpectedRequest): Promise<void> {
  const expectedUrl = new URL(`https://example.com${expected.url}`);

  for (const [key, value] of Object.entries(expected.query ?? {})) {
    if (Array.isArray(value)) {
      for (const v of value) {
        expectedUrl.searchParams.append(key, v);
      }
    } else {
      expectedUrl.searchParams.set(key, value);
    }
  }

  if (expected.url !== undefined) expect(received.url).toBe(String(expectedUrl));

  if (expected.method !== undefined)
    expect(received.method.toLowerCase()).toBe(expected.method.toLowerCase());

  if (expected.headers !== undefined) {
    const actualHeaders = Object.fromEntries(received.headers);
    expect(actualHeaders).toEqual(
      expect.objectContaining(
        Object.fromEntries(Object.entries(expected.headers).map(([k, v]) => [k.toLowerCase(), v])),
      ),
    );
  }

  if (expected.body !== undefined) {
    const text = await received.clone().text(); // don’t consume original
    let parsed: unknown;

    // Check content-type to determine how to parse the body
    const contentType = received.headers.get('content-type');

    if (contentType?.includes('application/x-www-form-urlencoded')) {
      // Parse form-urlencoded data into an object
      const formData = new URLSearchParams(text);
      parsed = Object.fromEntries(formData.entries());
    } else {
      // Try to parse as JSON first
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    expect(parsed).toEqual(expected.body);
  }
}

/* --- Register the matcher with Vitest --------------------------- */
expect.extend({
  async toMatchRequest(this, received: Request, expected: ExpectedRequest) {
    try {
      await compareRequest(received, expected);
      return {
        pass: true,
        message: () => 'Request matched expected shape',
      };
    } catch (error: unknown) {
      return {
        pass: false,
        message: () => (error as Error).message || String(error),
      };
    }
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
