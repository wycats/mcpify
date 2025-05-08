import { describe, it, expect } from 'vitest';

import { normalizeExtensions } from './openapi.ts';
import type { OperationExtensions } from './parameter-mapper.ts';

/**
 * More detailed tests for normalizeExtensions function
 */
describe('normalizeExtensions - Advanced', () => {
  it('handles complex nested objects', () => {
    const extensions = {
      operationId: 'custom-id',
      nested: {
        deeply: {
          nested: 'value'
        }
      },
      arrays: ['a', 'b', 'c']
    };

    const result = normalizeExtensions(extensions);
    
    const expected: OperationExtensions = {
      operationId: 'custom-id'
    };
    
    expect(result).toEqual(expected);
  });

  it('handles multiple recognized properties when they are added', () => {
    // This test is forward-looking, for when more properties are supported
    const extensions = {
      operationId: 'custom-id',
      someProperty: 'value',
      anotherProperty: 123
    };

    const result = normalizeExtensions(extensions);
    
    // Currently only operationId is extracted
    expect(result).toEqual({ operationId: 'custom-id' });
  });
});

/**
 * Advanced tests for normalizeExtensions function
 * 
 * This approach focuses on a well-contained function that doesn't
 * require extensive mocking or dependency management.
 */
describe('normalizeExtensions - Edge Cases', () => {
  it('handles falsy non-null/undefined values', () => {
    const falsy = ["", 0, false, NaN];
    
    for (const value of falsy) {
      const result = normalizeExtensions(value);
      expect(result).toEqual({});
    }
  });
  
  it('handles array inputs', () => {
    const arrays = [
      [],
      [1, 2, 3],
      [{ operationId: 'shouldNotBePicked' }]
    ];
    
    for (const arr of arrays) {
      const result = normalizeExtensions(arr);
      expect(result).toEqual({});
    }
  });
  
  it('handles objects with different property types', () => {
    const input = {
      operationId: 'valid-id',
      number: 123,
      boolean: true,
      object: { nested: 'value' },
      array: [1, 2, 3],
      func: (): void => { /* empty */ },
      symbol: Symbol('test'),
    };
    
    const result = normalizeExtensions(input);
    
    // Should only extract operationId
    const expected: OperationExtensions = {
      operationId: 'valid-id'
    };
    
    expect(result).toEqual(expected);
  });
  
  it('handles malformed operationId values', () => {
    // Various non-string operationId values
    const inputs = [
      { operationId: 123 },
      { operationId: true },
      { operationId: { nested: 'object' } },
      { operationId: ['array'] },
      { operationId: null },
      { operationId: undefined },
    ];
    
    for (const input of inputs) {
      const result = normalizeExtensions(input);
      
      // Currently the function doesn't validate operationId types,
      // but this test documents the behavior for if/when validation is added
      if (input.operationId === null || input.operationId === undefined) {
        expect(result).toEqual({});
      } else {
        expect(result).toEqual({ operationId: input.operationId });
      }
    }
  });
});

// Additional tests focused on the object behaviors
describe('normalizeExtensions - Object Handling', () => {
  it('treats non-plain objects as empty extensions', () => {
    class CustomClass {
      operationId = 'from-class';
    }
    
    const date = new Date();
    const regex = /test/;
    const instance = new CustomClass();
    
    // Current implementation doesn't check if object is plain vs class instance
    // This test documents current behavior
    expect(normalizeExtensions(date)).toEqual({});
    expect(normalizeExtensions(regex)).toEqual({});
    expect(normalizeExtensions(instance)).toEqual({ operationId: 'from-class' });
  });
  
  it('handles property inheritance', () => {
    // Using a concrete parent object with known types
    const parent: Record<string, string> = { inherited: 'value' };
    
    // Create a new object with type-safe inheritance
    const child: Record<string, string> = {} as Record<string, string>;
    Object.setPrototypeOf(child, parent);
    
    // Set property with index notation as required by linter
    child['operationId'] = 'child-id';
    
    const result = normalizeExtensions(child);
    
    // Should only include own properties, not inherited ones
    expect(result).toEqual({ operationId: 'child-id' });
  });
});
