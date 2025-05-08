import { describe, it, expect } from 'vitest';

import { normalizeExtensions } from './openapi.ts';
import type { OperationExtensions } from './parameter-mapper.ts';

describe('normalizeExtensions()', () => {
  it('returns an empty object when input is null', () => {
    const result = normalizeExtensions(null);
    expect(result).toEqual({});
  });

  it('returns an empty object when input is undefined', () => {
    const result = normalizeExtensions(undefined);
    expect(result).toEqual({});
  });

  it('returns an empty object when input is not an object', () => {
    const inputs = [123, 'string', true, [1, 2, 3]];

    for (const input of inputs) {
      const result = normalizeExtensions(input);
      expect(result).toEqual({});
    }
  });

  it('extracts operationId from extensions', () => {
    const extensions = {
      operationId: 'customOperationId',
      otherProperty: 'value',
    };

    const result = normalizeExtensions(extensions);

    const expected: OperationExtensions = {
      operationId: 'customOperationId',
    };

    expect(result).toEqual(expected);
  });

  it('ignores properties other than operationId', () => {
    const extensions = {
      notOperationId: 'ignoredValue',
      anotherProperty: 123,
      nestedObject: { foo: 'bar' },
    };

    const result = normalizeExtensions(extensions);
    expect(result).toEqual({});
  });

  it('handles empty object input', () => {
    const result = normalizeExtensions({});
    expect(result).toEqual({});
  });
});

// Additional test modules can be added here in the future
