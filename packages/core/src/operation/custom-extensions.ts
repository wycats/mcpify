import type { ChangeSafety } from '../safety.ts';

export interface CustomExtensionsInterface {
  operationId?: string;
  ignore?: 'resource' | 'tool' | true;
  description?: string;
  safety?: ChangeSafety;
}

export class CustomExtensions {
  static of(inner: CustomExtensions | CustomExtensionsInterface): CustomExtensions {
    if (inner instanceof CustomExtensions) return inner;
    return new CustomExtensions(inner);
  }

  readonly #inner: CustomExtensionsInterface;

  private constructor(inner: CustomExtensionsInterface) {
    this.#inner = inner;
  }

  ignoredWhen({ type }: { type: 'resource' | 'tool' }): boolean {
    return this.#inner.ignore === type || this.#inner.ignore === true;
  }

  get description(): string | undefined {
    return this.#inner.description;
  }

  get isMutable(): boolean {
    return !!this.#inner.safety && this.#inner.safety.access !== 'readonly';
  }

  get id(): string | undefined {
    return this.#inner.operationId;
  }
}
