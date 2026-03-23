import { describe, it, expect } from "vitest";
import {
  validate,
  validateInput,
  ValidationError,
  Patterns,
  sanitizeHtml,
  sanitizePath,
} from "../../runtime/security/input-validator";

describe("Input Validator", () => {
  describe("String validation", () => {
    it("should validate strings", () => {
      expect(() => validate("hello", { type: "string" }, "field")).not.toThrow();
    });

    it("should reject non-strings", () => {
      expect(() => validate(123, { type: "string" }, "field")).toThrow(
        ValidationError
      );
    });

    it("should validate min length", () => {
      expect(() =>
        validate("hi", { type: "string", minLength: 5 }, "field")
      ).toThrow("must be at least 5 characters");
    });

    it("should validate max length", () => {
      expect(() =>
        validate("hello world", { type: "string", maxLength: 5 }, "field")
      ).toThrow("must be at most 5 characters");
    });

    it("should validate pattern", () => {
      expect(() =>
        validate("abc123", { type: "string", pattern: /^\d+$/ }, "field")
      ).toThrow("does not match required pattern");

      expect(() =>
        validate("123", { type: "string", pattern: /^\d+$/ }, "field")
      ).not.toThrow();
    });
  });

  describe("Number validation", () => {
    it("should validate numbers", () => {
      expect(() => validate(42, { type: "number" }, "field")).not.toThrow();
    });

    it("should reject non-numbers", () => {
      expect(() => validate("42", { type: "number" }, "field")).toThrow(
        ValidationError
      );
    });

    it("should reject NaN", () => {
      expect(() => validate(NaN, { type: "number" }, "field")).toThrow(
        "must be a number"
      );
    });

    it("should validate min value", () => {
      expect(() => validate(5, { type: "number", min: 10 }, "field")).toThrow(
        "must be at least 10"
      );
    });

    it("should validate max value", () => {
      expect(() => validate(15, { type: "number", max: 10 }, "field")).toThrow(
        "must be at most 10"
      );
    });

    it("should validate integers", () => {
      expect(() =>
        validate(3.14, { type: "number", integer: true }, "field")
      ).toThrow("must be an integer");

      expect(() =>
        validate(42, { type: "number", integer: true }, "field")
      ).not.toThrow();
    });
  });

  describe("Boolean validation", () => {
    it("should validate booleans", () => {
      expect(() => validate(true, { type: "boolean" }, "field")).not.toThrow();
      expect(() => validate(false, { type: "boolean" }, "field")).not.toThrow();
    });

    it("should reject non-booleans", () => {
      expect(() => validate(1, { type: "boolean" }, "field")).toThrow(
        "must be a boolean"
      );
    });
  });

  describe("Array validation", () => {
    it("should validate arrays", () => {
      expect(() =>
        validate([1, 2, 3], { type: "array", items: { type: "number" } }, "field")
      ).not.toThrow();
    });

    it("should reject non-arrays", () => {
      expect(() =>
        validate("not an array", { type: "array", items: { type: "string" } }, "field")
      ).toThrow("must be an array");
    });

    it("should validate array items", () => {
      expect(() =>
        validate([1, "two", 3], { type: "array", items: { type: "number" } }, "field")
      ).toThrow("must be a number");
    });

    it("should validate min items", () => {
      expect(() =>
        validate([1], { type: "array", items: { type: "number" }, minItems: 2 }, "field")
      ).toThrow("must have at least 2 items");
    });

    it("should validate max items", () => {
      expect(() =>
        validate([1, 2, 3], { type: "array", items: { type: "number" }, maxItems: 2 }, "field")
      ).toThrow("must have at most 2 items");
    });
  });

  describe("Object validation", () => {
    it("should validate objects", () => {
      expect(() =>
        validate(
          { name: "Alice", age: 30 },
          {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "number" },
            },
          },
          "field"
        )
      ).not.toThrow();
    });

    it("should reject non-objects", () => {
      expect(() =>
        validate("not an object", { type: "object", properties: {} }, "field")
      ).toThrow("must be an object");
    });

    it("should validate required fields", () => {
      expect(() =>
        validate(
          { name: "Alice" },
          {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "number" },
            },
            required: ["name", "age"],
          },
          "field"
        )
      ).toThrow("field.age");
    });

    it("should validate nested properties", () => {
      expect(() =>
        validate(
          { user: { name: "Alice", age: "thirty" } },
          {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  age: { type: "number" },
                },
              },
            },
          },
          "field"
        )
      ).toThrow("field.user.age");
    });
  });

  describe("Enum validation", () => {
    it("should validate enum values", () => {
      expect(() =>
        validate("red", { type: "enum", values: ["red", "green", "blue"] }, "field")
      ).not.toThrow();
    });

    it("should reject invalid enum values", () => {
      expect(() =>
        validate("purple", { type: "enum", values: ["red", "green", "blue"] }, "field")
      ).toThrow('must be one of: "red", "green", "blue"');
    });
  });

  describe("Full input validation", () => {
    it("should validate complete objects", () => {
      const schema = {
        username: { type: "string", minLength: 3, maxLength: 20 },
        email: { type: "string", pattern: Patterns.email },
        age: { type: "number", min: 0, max: 150, integer: true },
        role: { type: "enum", values: ["user", "admin"] },
      } as const;

      expect(() =>
        validateInput(
          {
            username: "alice",
            email: "alice@example.com",
            age: 30,
            role: "user",
          },
          schema
        )
      ).not.toThrow();
    });

    it("should reject invalid root input", () => {
      expect(() => validateInput("not an object", {})).toThrow(
        "input must be an object"
      );
    });
  });

  describe("Patterns", () => {
    it("should validate UUIDs", () => {
      expect(Patterns.uuid.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
      expect(Patterns.uuid.test("not-a-uuid")).toBe(false);
    });

    it("should validate emails", () => {
      expect(Patterns.email.test("user@example.com")).toBe(true);
      expect(Patterns.email.test("invalid-email")).toBe(false);
    });

    it("should validate ISO dates", () => {
      expect(Patterns.isoDate.test("2024-01-15")).toBe(true);
      expect(Patterns.isoDate.test("01/15/2024")).toBe(false);
    });

    it("should validate URLs", () => {
      expect(Patterns.url.test("https://example.com")).toBe(true);
      expect(Patterns.url.test("not a url")).toBe(false);
    });
  });

  describe("Sanitization", () => {
    it("should sanitize HTML", () => {
      expect(sanitizeHtml("<script>alert('xss')</script>")).toBe(
        "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;"
      );
    });

    it("should sanitize paths", () => {
      expect(sanitizePath("safe-file.txt")).toBe("safe-file.txt");
      expect(() => sanitizePath("../../etc/passwd")).toThrow(ValidationError);
      expect(() => sanitizePath("/etc/passwd")).toThrow(ValidationError); // Contains '/' after stripping leading slashes
      expect(sanitizePath("safe-file.txt")).toBe("safe-file.txt");
      expect(sanitizePath("/safe-file.txt")).toBe("safe-file.txt"); // Leading slash stripped
    });
  });
});
