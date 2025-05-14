import type { LogLayer } from 'loglayer';
import Oas from 'oas';
import type { z } from 'zod';

import { getParameters } from '../parameter-mapper.ts';
import type {
  IntoOperationExtensions,
  OasResponseType,
  PathOperation,
} from '../parameter-mapper.ts';
import { bucketArgs } from '../request/request-utils.ts';
import type { BucketedArgs, JsonObject } from '../request/request-utils.ts';
import { HttpVerb } from '../safety.ts';
import { ResponseSchemaExtractor } from '../schema/response-schema.ts';

import { CustomExtensions } from './custom-extensions.ts';

/**
 * An extension of an operation that:
 *
 * - Incorporates custom mcpify extensions (e.g. the `isResource` getter
 *   supports overrides via `x-mcpify:ignore`)
 * - Provides higher-level abstractions for common tasks (e.g. `bucketArgs`)
 *   that can be performed based entirely on the operation and any custom
 *   extensions.
 */
export class McpifyOperation {
  static from(
    op: PathOperation,
    extensions: IntoOperationExtensions,
    app: { log: LogLayer },
  ): McpifyOperation {
    const verb = HttpVerb.from(op.method);

    if (!verb) {
      // TODO: Propagate the error better and ignore it if this happens
      throw new Error(`Unsupported HTTP method: ${op.method}`);
    }

    return new McpifyOperation(verb, op, CustomExtensions.of(extensions), app);
  }

  readonly verb: HttpVerb;
  readonly inner: PathOperation;
  readonly extensions: CustomExtensions;

  readonly #app: { log: LogLayer };

  constructor(
    verb: HttpVerb,
    op: PathOperation,
    extensions: CustomExtensions,
    app: { log: LogLayer },
  ) {
    this.verb = verb;
    this.inner = op;
    this.extensions = extensions;
    this.#app = app;
  }

  get oas(): Oas {
    return new Oas(this.inner.api);
  }

  get parameters(): z.ZodRawShape | null {
    return getParameters(this.inner, this.#app);
  }

  /**
   * An operation is a resource if:
   *
   * - It has no parameters or only path parameters
   * - It is a GET operation
   * - It doesn't specify annotations other than `readonly` in the `x-mcpify` extension
   * - It doesn't specify `ignore: 'resource'` or `ignore: true`
   */
  get isResource(): boolean {
    if (this.verb.uppercase !== 'GET') {
      return false;
    }

    const params = this.inner.getParameters();
    if (params.some((p) => p.in !== 'path')) {
      return false;
    }

    if (this.inner.hasRequestBody()) {
      return false;
    }

    const extensions = this.extensions;

    if (extensions.ignoredWhen({ type: 'resource' }) || extensions.isMutable) {
      return false;
    }

    return true;
  }

  ignoredWhen({ type }: { type: 'resource' | 'tool' }): boolean {
    return this.extensions.ignoredWhen({ type });
  }

  /**
   * Returns the ID of the operation.
   *
   * If the operation has an ID in `x-mcpify:id`, that will be returned.
   * Otherwise, the `operationId` from the OpenAPI document will be used.
   */
  get id(): string {
    return this.extensions.id ?? this.inner.getOperationId({ friendlyCase: true });
  }

  get path(): string {
    return this.inner.path;
  }

  get response(): ResponseSchemaExtractor {
    return ResponseSchemaExtractor.fromOp(this.inner, this.#app.log);
  }

  /**
   * Returns a single, preferred response type for the operation.
   *
   * - If the operation has a JSON media type, it prefers JSON.
   * - Otherwise, if the operation has an application/x-www-form-urlencoded
   *   media type, it prefers URL-encoded form data.
   * - Otherwise, it prefers text/plain.
   */
  get responseType(): OasResponseType {
    const oas = this.inner;

    if (oas.isJson()) {
      return 'application/json';
    } else if (oas.isFormUrlEncoded()) {
      return 'application/x-www-form-urlencoded';
    } else {
      return 'text/plain';
    }
  }

  /**
   * Returns the description of the operation.
   *
   * If the operation has a custom description in the `x-mcpify` extension, that
   * will be returned. Otherwise, the summary and description from the OAS will
   * be used.
   */
  get description(): string {
    const { extensions, inner: op, verb } = this;

    if (extensions.description) {
      return extensions.description;
    }

    const summary = op.getSummary();
    const description = op.getDescription();

    if (!summary && !description) {
      return `${verb.uppercase} ${op.path}`;
    }

    return [summary, description].filter(Boolean).join(' - ');

    // TODO: Incorporate examples and other metadata
  }

  describe(): string {
    return `${this.verb.uppercase} ${this.inner.path}`;
  }

  bucketArgs(args: JsonObject): BucketedArgs {
    return bucketArgs(this.inner, args);
  }
}
