/**
 * Request handling module.
 * 
 * This module contains utilities for building and working with HTTP requests
 * based on OpenAPI specifications.
 */

export { buildRequest, buildRequestInit } from './request-builder.ts';
export { 
  bucketArgs, 
  createSearchParams, 
  createFormData,
  appendData,
  type BucketLocation,
  type BucketOperation,
  type BucketedArgs,
  type JsonObject,
  type JsonValue,
  type OasRequestArgs,
  type PathOperation,
  type ServerVariable
} from './request-utils.ts';
export { getBaseUrl } from './url-utils.ts';
export { parseTemplate, merge, type TemplateInterface } from './template-utils.ts';
