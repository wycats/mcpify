import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

import { toHttpMethod } from './utils.ts';
import type { Verb } from './utils.ts';

export type ChangeSafety =
  | {
      access: 'readonly';
    }
  | {
      access: 'update';
      idempotent: boolean;
    }
  | {
      access: 'delete';
    };

export class HttpVerb {
  static from(verb: string, { open = true }: { open?: boolean } = {}): HttpVerb | undefined {
    const method = toHttpMethod(verb);
    if (!method) return undefined;

    return new HttpVerb(method, getSafety(method), open);
  }

  readonly verb: Verb;
  readonly change: ChangeSafety;
  readonly open: boolean;

  constructor(verb: Verb, change: ChangeSafety, open: boolean) {
    this.verb = verb;
    this.change = change;
    this.open = open;
  }

  get uppercase(): string {
    return this.verb.toUpperCase();
  }

  get hints(): ToolAnnotations {
    const { open, change } = this;

    switch (change.access) {
      case 'readonly':
        return {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: open,
        };
      case 'update':
        return {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: change.idempotent,
          openWorldHint: open,
        };
      case 'delete':
        return {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: open,
        };
    }
  }

  describe(): string {
    const { change, open } = this;

    switch (change.access) {
      case 'readonly':
        return `readonly${open ? ' (open world)' : ''}`;
      case 'update':
        if (change.idempotent) {
          return `idempotent update${open ? ' (open world)' : ''}`;
        } else {
          return `update${open ? ' (open world)' : ''}`;
        }
      case 'delete':
        return `delete${open ? ' (open world)' : ''}`;
    }
  }
}

export function getSafety(verb: Verb): ChangeSafety {
  switch (verb) {
    case 'get':
    case 'head':
    case 'options':
      return { access: 'readonly' };
    case 'put':
    case 'patch':
      return { access: 'update', idempotent: true };
    case 'post':
      return { access: 'update', idempotent: false };
    case 'delete':
      return { access: 'delete' };
  }
}
