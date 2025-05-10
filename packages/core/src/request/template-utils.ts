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
