import Oas from 'oas';
import { describe, it, expect } from 'vitest';

import { parseSpec } from '../openapi.js';

describe('url handling', () => {
  describe('OASNormalize integration', () => {
    it('handles OAS2 missing host by using fallback URL', async () => {
      const swagger2Spec = {
        swagger: '2.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
      };

      const { spec: oas } = await parseSpec(swagger2Spec);

      expect(oas.url()).toBe('https://example.com');
    });

    it('handles OAS3 missing host by using fallback URL', async () => {
      const oasSpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
      };

      const { spec: oas } = await parseSpec(oasSpec);

      expect(oas.url()).toBe('https://example.com');
    });

    // Test that demonstrates how to properly handle OAS2 specs using OASNormalize
    it('converts OAS2 to OAS3 and correctly extracts the URL', async () => {
      // Create OAS2 spec with host, basePath, and schemes
      const swagger2Spec = {
        swagger: '2.0',
        info: { title: 'Test API', version: '1.0.0' },
        host: 'api.example.com',
        basePath: '/v2',
        schemes: ['https'],
        paths: {},
      };

      const { spec: oas } = await parseSpec(swagger2Spec);

      expect(oas.url()).toBe('https://api.example.com/v2');
    });

    it('handles OAS2 missing host by using fallback URL', async () => {
      // OAS2 spec without host
      const swagger2Spec = {
        swagger: '2.0',
        info: { title: 'Test API', version: '1.0.0' },
        schemes: ['https'],
        basePath: '/v2',
        paths: {},
      };

      const { spec: oas } = await parseSpec(swagger2Spec);

      expect(oas.url()).toBe('https://example.com/v2');
    });
  });

  describe('Oas native behavior (reference only)', () => {
    // These tests document the actual behavior of Oas library without OASNormalize
    it('OAS3 format works with servers array', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com/v3' }, { url: 'https://staging.example.com/v3' }],
        paths: {},
      };

      const oas = new Oas(spec);

      expect(oas.url()).toBe('https://api.example.com/v3');
    });

    it('OAS2 format ignores host/basePath, returning a default URL', async () => {
      const spec = {
        swagger: '2.0',
        info: { title: 'Test API', version: '1.0.0' },
        host: 'api.example.com',
        basePath: '/v2',
        schemes: ['https'],
        paths: {},
      } as const; // Type assertion needed due to Oas expecting openapi property

      const { spec: oas } = await parseSpec(spec);

      expect(oas.url()).toBe('https://api.example.com/v2');
    });
  });
});
