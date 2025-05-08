import { describe, it, expect } from 'vitest';

import { HttpVerb, getSafety } from './safety.ts';

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
});
