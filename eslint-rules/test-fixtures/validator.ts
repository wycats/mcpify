// Real TypeScript file for testing require-ts-extensions rule
export function validator(input: unknown): boolean {
  return input !== null && input !== undefined;
}

export class RealValidator {
  validate(data: unknown): boolean {
    // Real implementation - no mocks here!
    return typeof data === 'string' && data.length > 0;
  }
}