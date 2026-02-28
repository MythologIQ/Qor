/**
 * Input Validation
 *
 * Provides schema-based validation for API inputs to prevent:
 * - SQL injection
 * - XSS attacks
 * - Command injection
 * - Path traversal
 * - Invalid data types
 */

import * as http from "http";

export type ValidationRule =
  | { type: "string"; minLength?: number; maxLength?: number; pattern?: RegExp }
  | { type: "number"; min?: number; max?: number; integer?: boolean }
  | { type: "boolean" }
  | { type: "array"; items: ValidationRule; minItems?: number; maxItems?: number }
  | { type: "object"; properties: Record<string, ValidationRule>; required?: string[] }
  | { type: "enum"; values: readonly unknown[] };

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string
  ) {
    super(`Validation error for field '${field}': ${message}`);
    this.name = "ValidationError";
  }
}

/**
 * Validate a value against a rule
 */
export function validate(value: unknown, rule: ValidationRule, fieldName: string): void {
  switch (rule.type) {
    case "string":
      validateString(value, rule, fieldName);
      break;
    case "number":
      validateNumber(value, rule, fieldName);
      break;
    case "boolean":
      validateBoolean(value, fieldName);
      break;
    case "array":
      validateArray(value, rule, fieldName);
      break;
    case "object":
      validateObject(value, rule, fieldName);
      break;
    case "enum":
      validateEnum(value, rule, fieldName);
      break;
  }
}

function validateString(
  value: unknown,
  rule: Extract<ValidationRule, { type: "string" }>,
  fieldName: string
): void {
  if (typeof value !== "string") {
    throw new ValidationError(fieldName, "must be a string");
  }

  if (rule.minLength !== undefined && value.length < rule.minLength) {
    throw new ValidationError(fieldName, `must be at least ${rule.minLength} characters`);
  }

  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    throw new ValidationError(fieldName, `must be at most ${rule.maxLength} characters`);
  }

  if (rule.pattern && !rule.pattern.test(value)) {
    throw new ValidationError(fieldName, `does not match required pattern`);
  }
}

function validateNumber(
  value: unknown,
  rule: Extract<ValidationRule, { type: "number" }>,
  fieldName: string
): void {
  if (typeof value !== "number" || isNaN(value)) {
    throw new ValidationError(fieldName, "must be a number");
  }

  if (rule.integer && !Number.isInteger(value)) {
    throw new ValidationError(fieldName, "must be an integer");
  }

  if (rule.min !== undefined && value < rule.min) {
    throw new ValidationError(fieldName, `must be at least ${rule.min}`);
  }

  if (rule.max !== undefined && value > rule.max) {
    throw new ValidationError(fieldName, `must be at most ${rule.max}`);
  }
}

function validateBoolean(value: unknown, fieldName: string): void {
  if (typeof value !== "boolean") {
    throw new ValidationError(fieldName, "must be a boolean");
  }
}

function validateArray(
  value: unknown,
  rule: Extract<ValidationRule, { type: "array" }>,
  fieldName: string
): void {
  if (!Array.isArray(value)) {
    throw new ValidationError(fieldName, "must be an array");
  }

  if (rule.minItems !== undefined && value.length < rule.minItems) {
    throw new ValidationError(fieldName, `must have at least ${rule.minItems} items`);
  }

  if (rule.maxItems !== undefined && value.length > rule.maxItems) {
    throw new ValidationError(fieldName, `must have at most ${rule.maxItems} items`);
  }

  value.forEach((item, index) => {
    validate(item, rule.items, `${fieldName}[${index}]`);
  });
}

function validateObject(
  value: unknown,
  rule: Extract<ValidationRule, { type: "object" }>,
  fieldName: string
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError(fieldName, "must be an object");
  }

  const obj = value as Record<string, unknown>;

  // Check required fields
  if (rule.required) {
    for (const reqField of rule.required) {
      if (!(reqField in obj)) {
        throw new ValidationError(`${fieldName}.${reqField}`, "is required");
      }
    }
  }

  // Validate each property
  for (const [key, propRule] of Object.entries(rule.properties)) {
    if (key in obj) {
      validate(obj[key], propRule, `${fieldName}.${key}`);
    }
  }
}

function validateEnum(
  value: unknown,
  rule: Extract<ValidationRule, { type: "enum" }>,
  fieldName: string
): void {
  if (!rule.values.includes(value)) {
    throw new ValidationError(
      fieldName,
      `must be one of: ${rule.values.map((v) => JSON.stringify(v)).join(", ")}`
    );
  }
}

/**
 * Validate an entire object against a schema
 */
export function validateInput(data: unknown, schema: ValidationSchema): void {
  if (typeof data !== "object" || data === null) {
    throw new ValidationError("root", "input must be an object");
  }

  const obj = data as Record<string, unknown>;

  for (const [field, rule] of Object.entries(schema)) {
    if (field in obj) {
      validate(obj[field], rule, field);
    }
  }
}

/**
 * Middleware for validating JSON request bodies
 */
export function withBodyValidation<
  T extends (req: http.IncomingMessage, res: http.ServerResponse) => void | Promise<void>
>(schema: ValidationSchema, handler: T): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      // Read body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      const data = JSON.parse(body);

      // Validate
      validateInput(data, schema);

      // Continue to handler
      await handler(req, res);
    } catch (error) {
      if (error instanceof ValidationError) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Validation failed",
            field: error.field,
            message: error.message,
          })
        );
        return;
      }

      if (error instanceof SyntaxError) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Invalid JSON",
            message: error.message,
          })
        );
        return;
      }

      throw error;
    }
  };
}

/**
 * Common validation patterns
 */
export const Patterns = {
  /** UUID v4 */
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  /** Email address (basic) */
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  /** ISO 8601 date */
  isoDate: /^\d{4}-\d{2}-\d{2}$/,

  /** ISO 8601 datetime */
  isoDateTime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,

  /** Alphanumeric with hyphens/underscores */
  slug: /^[a-z0-9-_]+$/,

  /** Safe filename (no path traversal) */
  safeFilename: /^[a-zA-Z0-9-_. ]+$/,

  /** Hex color */
  hexColor: /^#[0-9a-f]{6}$/i,

  /** URL */
  url: /^https?:\/\/[^\s]+$/,
};

/**
 * Sanitize string to prevent XSS
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Validate and sanitize a file path to prevent directory traversal
 */
export function sanitizePath(input: string): string {
  // Remove any .. segments
  const normalized = input.replace(/\.\./g, "");

  // Remove leading slashes
  const safe = normalized.replace(/^\/+/, "");

  // Ensure it matches safe filename pattern
  if (!Patterns.safeFilename.test(safe)) {
    throw new ValidationError("path", "contains invalid characters");
  }

  return safe;
}
