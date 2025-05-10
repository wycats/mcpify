/**
 * Utility functions for handling URL templates
 */

import { parseTemplate as urlParseTemplate } from 'url-template';

/**
 * A template interface for expansion
 */
export type TemplateInterface = ReturnType<typeof urlParseTemplate>;

/**
 * Parse a URI template string
 * @param template - Template string with variables like {varName}
 * @returns A template interface for expansion
 */
export function parseTemplate(template: string): TemplateInterface {
  return urlParseTemplate(template);
}

/**
 * Deep merge utility function
 * @param object - Target object to merge into
 * @param defaults - Source object to merge from
 * @returns Merged object
 */
export function merge<T>(object: T, defaults: Partial<T>): T {
  return { ...object, ...defaults } as T;
}
