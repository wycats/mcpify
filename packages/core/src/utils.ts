export type Verb = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options';
const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const);

export function toHttpMethod(method: string): Verb | undefined {
  const lower = method.toLowerCase().trim();
  return HTTP_METHODS.has(lower) ? (lower as Verb) : undefined;
}

export function unreachable(msg: string): never {
  throw new Error(`${msg} is unreachable`);
}
