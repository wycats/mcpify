import { describe, it, expect } from 'vitest';

import { HttpVerb, getSafety } from './safety.ts';
import { toHttpMethod } from './utils.ts';

describe('HttpVerb', () => {
  describe('Basic functionality', () => {
    it('correctly recognizes GET as a readonly method', () => {
      const verb = HttpVerb.from('GET');
      expect(verb?.change.access).toBe('readonly');
    });

    it('correctly recognizes POST as an update method', () => {
      const verb = HttpVerb.from('POST');
      expect(verb?.change.access).toBe('update');
      expect((verb?.change as { idempotent: boolean }).idempotent).toBe(false);
    });

    it('correctly recognizes PUT/PATCH as idempotent update methods', () => {
      const putVerb = HttpVerb.from('PUT');
      expect(putVerb?.change.access).toBe('update');
      expect((putVerb?.change as { idempotent: boolean }).idempotent).toBe(true);
      
      const patchVerb = HttpVerb.from('PATCH');
      expect(patchVerb?.change.access).toBe('update');
      expect((patchVerb?.change as { idempotent: boolean }).idempotent).toBe(true);
    });

    it('correctly recognizes DELETE as a delete method', () => {
      const verb = HttpVerb.from('DELETE');
      expect(verb?.change.access).toBe('delete');
    });

    it('recognizes HEAD and OPTIONS as readonly methods', () => {
      const headVerb = HttpVerb.from('HEAD');
      expect(headVerb?.change.access).toBe('readonly');

      const optionsVerb = HttpVerb.from('OPTIONS');
      expect(optionsVerb?.change.access).toBe('readonly');
    });
  });

  describe('Method casing', () => {
    it('handles lowercase method names', () => {
      const getVerb = HttpVerb.from('get');
      const postVerb = HttpVerb.from('post');
      const putVerb = HttpVerb.from('put');
      const patchVerb = HttpVerb.from('patch');
      const deleteVerb = HttpVerb.from('delete');
      
      expect(getVerb?.change.access).toBe('readonly');
      expect(postVerb?.change.access).toBe('update');
      expect(putVerb?.change.access).toBe('update');
      expect(patchVerb?.change.access).toBe('update');
      expect(deleteVerb?.change.access).toBe('delete');
    });

    it('handles mixed-case method names', () => {
      const getVerb = HttpVerb.from('GeT');
      const postVerb = HttpVerb.from('pOsT');
      const putVerb = HttpVerb.from('Put');
      const patchVerb = HttpVerb.from('pAtCh');
      const deleteVerb = HttpVerb.from('DeLeTe');
      
      expect(getVerb?.change.access).toBe('readonly');
      expect(postVerb?.change.access).toBe('update');
      expect(putVerb?.change.access).toBe('update');
      expect(patchVerb?.change.access).toBe('update');
      expect(deleteVerb?.change.access).toBe('delete');
    });

    it('always returns uppercase method in uppercase getter', () => {
      const methods = ['get', 'post', 'PUT', 'Patch', 'DELETE'];
      
      for (const method of methods) {
        const verb = HttpVerb.from(method);
        expect(verb?.uppercase).toBe(method.toUpperCase());
      }
    });
  });

  describe('Hint generation', () => {
    it('generates correct safety hints for readonly methods', () => {
      const verb = HttpVerb.from('GET');
      const hints = verb?.hints;
      
      expect(hints).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('generates correct safety hints for update methods', () => {
      const postVerb = HttpVerb.from('POST');
      const postHints = postVerb?.hints;
      
      expect(postHints).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });

      const putVerb = HttpVerb.from('PUT');
      const putHints = putVerb?.hints;
      
      expect(putHints).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('generates correct safety hints for destructive methods', () => {
      const verb = HttpVerb.from('DELETE');
      const hints = verb?.hints;
      
      expect(hints).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      });
    });

    it('respects the open parameter for hint generation', () => {
      const verb = HttpVerb.from('GET', { open: false });
      const hints = verb?.hints;
      
      expect(hints?.openWorldHint).toBe(false);
    });

    it('respects open parameter for all verb types', () => {
      // Test each access type with open: false
      const readonlyVerb = HttpVerb.from('GET', { open: false });
      const updateVerb = HttpVerb.from('POST', { open: false });
      const deleteVerb = HttpVerb.from('DELETE', { open: false });
      
      expect(readonlyVerb?.hints.openWorldHint).toBe(false);
      expect(updateVerb?.hints.openWorldHint).toBe(false);
      expect(deleteVerb?.hints.openWorldHint).toBe(false);
    });
  });

  describe('describe() method', () => {
    it('returns correct description for readonly methods', () => {
      const openVerb = HttpVerb.from('GET');
      expect(openVerb?.describe()).toBe('readonly (open world)');
      
      const closedVerb = HttpVerb.from('GET', { open: false });
      expect(closedVerb?.describe()).toBe('readonly');
    });
    
    it('returns correct description for update methods', () => {
      const nonIdempotentOpen = HttpVerb.from('POST');
      expect(nonIdempotentOpen?.describe()).toBe('update (open world)');
      
      const nonIdempotentClosed = HttpVerb.from('POST', { open: false });
      expect(nonIdempotentClosed?.describe()).toBe('update');
      
      const idempotentOpen = HttpVerb.from('PUT');
      expect(idempotentOpen?.describe()).toBe('idempotent update (open world)');
      
      const idempotentClosed = HttpVerb.from('PUT', { open: false });
      expect(idempotentClosed?.describe()).toBe('idempotent update');
    });
    
    it('returns correct description for delete methods', () => {
      const openVerb = HttpVerb.from('DELETE');
      expect(openVerb?.describe()).toBe('delete (open world)');
      
      const closedVerb = HttpVerb.from('DELETE', { open: false });
      expect(closedVerb?.describe()).toBe('delete');
    });
  });

  describe('Constructor and direct initialization', () => {
    it('can be instantiated directly with the constructor', () => {
      const method = toHttpMethod('get');
      if (method) {
        const verb = new HttpVerb(method, getSafety(method), true);
        
        expect(verb.verb).toBe('get');
        expect(verb.change.access).toBe('readonly');
        expect(verb.open).toBe(true);
      }
    });
    
    it('returns correct data when created via constructor', () => {
      const method = toHttpMethod('post');
      if (method) {
        const verb = new HttpVerb(method, getSafety(method), false);
        
        expect(verb.uppercase).toBe('POST');
        expect(verb.describe()).toBe('update');
        expect(verb.hints.openWorldHint).toBe(false);
      }
    });
  });

  describe('Edge cases', () => {
    it('returns undefined for unknown methods', () => {
      const verb = HttpVerb.from('UNKNOWN');
      expect(verb).toBeUndefined();
    });

    it('handles empty strings', () => {
      const verb = HttpVerb.from('');
      expect(verb).toBeUndefined();
    });
    
    it('handles unusual spacing and formatting', () => {
      const verb = HttpVerb.from(' GET ');
      expect(verb?.change.access).toBe('readonly');
    });
    
    it('handles methods with leading/trailing whitespace', () => {
      const leadingSpace = HttpVerb.from(' post');
      const trailingSpace = HttpVerb.from('delete ');
      const bothSpaces = HttpVerb.from(' put ');
      
      expect(leadingSpace?.change.access).toBe('update');
      expect(trailingSpace?.change.access).toBe('delete');
      expect(bothSpaces?.change.access).toBe('update');
    });
  });
});

describe('getSafety', () => {
  it('categorizes readonly methods correctly', () => {
    const readonlyMethods = ['get', 'head', 'options'] as const;
    
    for (const method of readonlyMethods) {
      const safety = getSafety(method);
      expect(safety.access).toBe('readonly');
    }
  });

  it('categorizes update methods correctly', () => {
    const nonIdempotentMethods = ['post'] as const;
    const idempotentMethods = ['put', 'patch'] as const;
    
    for (const method of nonIdempotentMethods) {
      const safety = getSafety(method);
      expect(safety.access).toBe('update');
      expect((safety as { idempotent: boolean }).idempotent).toBe(false);
    }
    
    for (const method of idempotentMethods) {
      const safety = getSafety(method);
      expect(safety.access).toBe('update');
      expect((safety as { idempotent: boolean }).idempotent).toBe(true);
    }
  });

  it('categorizes delete methods correctly', () => {
    const safety = getSafety('delete');
    expect(safety.access).toBe('delete');
  });
  
  it('handles all defined HTTP methods', () => {
    // Test that all HTTP methods are handled without throwing errors
    const allMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const;
    
    for (const method of allMethods) {
      // This should not throw an error for any method
      expect(() => getSafety(method)).not.toThrow();
    }
  });
});
