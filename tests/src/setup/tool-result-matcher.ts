// Using _CallToolResult to satisfy linter requirement for unused vars to have _ prefix
import type { ExpectationResult } from '@vitest/expect';
import { expect } from 'vitest';

interface ContentText {
  type: 'text';
  text?: string | RegExp;
}

interface ContentResource {
  type: 'resource';
  resource?: {
    text?: string | RegExp;
    json?: Record<string, unknown>;
  };
}

interface ResourceContentInfo {
  mimeType?: string;
  text?: string | RegExp;
  blob?: string | RegExp;
  uri?: string | RegExp;
}

export interface ExpectedToolResult {
  isError?: boolean;
  tool?: (ContentText | ContentResource)[];
  resource?: ResourceContentInfo[];
}

interface ActualContentItem {
  type: string;
  text?: string;
  resource?: {
    text?: string;
  };
}

function matchContentItem(
  actual: ActualContentItem | undefined,
  expected: ContentText | ContentResource,
): boolean {
  if (!actual) {
    return false;
  }
  if (actual.type !== expected.type) {
    return false;
  }

  if (actual.type === 'text' && expected.type === 'text') {
    if (expected.text !== undefined) {
      // Check if it's a RegExp or a string
      if (expected.text instanceof RegExp) {
        return !!actual.text && expected.text.test(actual.text);
      } else {
        // Plain string comparison
        return actual.text === expected.text;
      }
    }
    return true;
  }

  if (actual.type === 'resource' && expected.type === 'resource') {
    const actualResource = actual.resource;
    const expectedResource = expected.resource;

    if (!expectedResource || !actualResource) {
      return !expectedResource && !actualResource;
    }

    if (expectedResource.text !== undefined && actualResource.text !== undefined) {
      // Check if it's a RegExp or a string
      if (expectedResource.text instanceof RegExp) {
        return expectedResource.text.test(actualResource.text);
      } else {
        // Plain string comparison
        if (actualResource.text !== expectedResource.text) {
          return false;
        }
      }
    } else if (expectedResource.text !== undefined) {
      return false;
    }

    if (expectedResource.json !== undefined && actualResource.text) {
      try {
        const actualJson = JSON.parse(actualResource.text);
        return JSON.stringify(actualJson) === JSON.stringify(expectedResource.json);
      } catch {
        return false;
      }
    }

    return true;
  }

  return false;
}

/* --- Register the matcher with Vitest --------------------------- */
expect.extend({
  toMatchMcpResult(received: unknown, expected: ExpectedToolResult): ExpectationResult {
    if (!received || typeof received !== 'object') {
      return {
        pass: false,
        actual: received,
        expected,
        message: () => `Expected a CallToolResult object but got ${typeof received}`,
      };
    }

    const result = received as Record<string, unknown>;

    // Verify isError property if specified
    if (expected.isError !== undefined && result['isError'] !== expected.isError) {
      return {
        pass: false,
        actual: result['isError'],
        expected: expected.isError,
        message: () => `Expected isError to be ${expected.isError} but got ${result['isError']}`,
      };
    }

    // Tool result content
    if (expected.tool !== undefined) {
      const actualContent = result['content'] as ActualContentItem[] | undefined;
      const expectedContent = expected.tool;

      if (!actualContent) {
        return {
          pass: false,
          actual: actualContent,
          expected: expected.tool,
          message: () => `Expected content array to be present but got ${actualContent}`,
        };
      }

      if (actualContent.length !== expectedContent.length) {
        return {
          pass: false,
          actual: actualContent.length,
          expected: expectedContent.length,
          message: () =>
            `Expected content array to have length ${expectedContent.length} but got ${actualContent.length}`,
        };
      }

      // Check each content item
      for (let i = 0; i < expectedContent.length; i++) {
        const expectedItem = expectedContent[i];
        const actualItem = actualContent[i];

        if (expectedItem && !matchContentItem(actualItem, expectedItem)) {
          return {
            pass: false,
            actual: actualItem,
            expected: expectedItem,
            message: () => `Content item at index ${i} doesn't match expected value`,
          };
        }
      }
    }

    // Resource response contents
    if (expected.resource !== undefined) {
      const actualContents = result['contents'] as Record<string, unknown>[] | undefined;

      const expectedContents = expected.resource;
      if (!actualContents) {
        return {
          pass: false,
          actual: actualContents,
          expected: expectedContents,
          message: () => `Expected contents array to be present but got ${actualContents}`,
        };
      }

      if (actualContents.length !== expectedContents.length) {
        return {
          pass: false,
          actual: actualContents.length,
          expected: expectedContents.length,
          message: () =>
            `Expected contents array to have length ${expectedContents.length} but got ${actualContents.length}`,
        };
      }

      // Check each content item
      for (let i = 0; i < expectedContents.length; i++) {
        const expectedItem = expectedContents[i];
        const actualItem = actualContents[i];

        if (!expectedItem || !actualItem) {
          continue;
        }

        if (
          expectedItem.mimeType !== undefined &&
          actualItem['mimeType'] !== expectedItem.mimeType
        ) {
          return {
            pass: false,
            actual: actualItem['mimeType'],
            expected: expectedItem.mimeType,
            message: () => `Contents item at index ${i} has wrong mimeType`,
          };
        }

        if (expectedItem.text !== undefined && !matches(actualItem['text'], expectedItem.text)) {
          return {
            pass: false,
            actual: actualItem['text'],
            expected: expectedItem.text,
            message: () => `Contents item at index ${i} has wrong text content`,
          };
        }

        if (expectedItem.uri !== undefined && !matches(actualItem['uri'], expectedItem.uri)) {
          return {
            pass: false,
            actual: actualItem['uri'],
            expected: expectedItem.uri,
            message: () => `Contents item at index ${i} has wrong uri`,
          };
        }

        if (expectedItem.blob !== undefined) {
          if (actualItem['blob'] === undefined) {
            return {
              pass: false,
              actual: actualItem['blob'],
              expected: 'defined blob',
              message: () => `Contents item at index ${i} is missing blob property`,
            };
          }

          if (typeof actualItem['blob'] !== 'string') {
            return {
              pass: false,
              actual: typeof actualItem['blob'],
              expected: 'string',
              message: () => `Contents item at index ${i} blob property should be a string`,
            };
          }
        }
      }
    }

    // Everything passed
    return {
      pass: true,
      message: () => 'CallToolResult matched expected shape',
    };
  },
});

function matches(actual: unknown, expected: string | RegExp): boolean {
  if (expected instanceof RegExp) {
    if (typeof actual !== 'string') {
      return false;
    }
    return expected.test(actual);
  } else {
    return actual === expected;
  }
}

/* --- Type declarations so TS recognises the matcher ------------- */
declare module 'vitest' {
  interface Assertion {
    toMatchMcpResult(expected: ExpectedToolResult): void;
  }
  interface AsymmetricMatchersContaining {
    toMatchMcpResult(expected: ExpectedToolResult): void;
  }
}
