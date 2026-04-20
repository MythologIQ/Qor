import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { openDb, initDb } from "../../src/persistence/db";
import {
  createOperator,
  getOperatorByToken,
  rotateToken,
  normalizeHandle,
  HandleCollisionError,
  EmptyHandleError,
} from "../../src/identity/operator";

function freshDb(): Database {
  const db = openDb(":memory:");
  initDb(db);
  return db;
}

describe("operator identity", () => {
  let db: Database;
  beforeEach(() => {
    db = freshDb();
  });

  test("normalizeHandle: NFKC + lowercase + strip zero-width/control", () => {
    expect(normalizeHandle("Alice")).toBe("alice");
    expect(normalizeHandle("ALICE")).toBe("alice");
    expect(normalizeHandle("alice\u200b")).toBe("alice");
    expect(normalizeHandle("al\u200dice")).toBe("alice");
    expect(normalizeHandle("  al ice  ")).toBe("alice");
    // NFKC: fullwidth 'Ａ' (U+FF21) → 'A' → 'a'
    expect(normalizeHandle("\uFF21lice")).toBe("alice");
  });

  test("createOperator returns operator + dotted token; token persists NOT stored plaintext", () => {
    const { operator, token } = createOperator(db, "Kevin");
    expect(operator.id).toBeGreaterThan(0);
    expect(operator.handle).toBe("Kevin");
    expect(operator.handleNormalized).toBe("kevin");
    expect(token.split(".").length).toBe(2);
    const [tokenId, secret] = token.split(".");
    expect(tokenId).toMatch(/^[0-9a-f]{16}$/);
    expect(secret).toMatch(/^[0-9a-f]{48}$/);
    // Verify plaintext secret is NOT stored anywhere in operators table.
    const rows = db.prepare("SELECT * FROM operators").all() as Array<
      Record<string, unknown>
    >;
    for (const r of rows) {
      for (const v of Object.values(r)) {
        if (typeof v === "string") expect(v.includes(secret)).toBe(false);
      }
    }
  });

  test("create + getOperatorByToken roundtrip", () => {
    const { operator, token } = createOperator(db, "Alice");
    const fetched = getOperatorByToken(db, token);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(operator.id);
    expect(fetched!.handleNormalized).toBe("alice");
  });

  test("handle collision: Alice / alice / alice\\u200b all collide", () => {
    createOperator(db, "Alice");
    expect(() => createOperator(db, "alice")).toThrow(HandleCollisionError);
    expect(() => createOperator(db, "alice\u200b")).toThrow(HandleCollisionError);
    expect(() => createOperator(db, "\uFF21lice")).toThrow(HandleCollisionError);
  });

  test("empty handle after normalization rejected", () => {
    expect(() => createOperator(db, "")).toThrow(EmptyHandleError);
    expect(() => createOperator(db, "\u200b\u200b")).toThrow(EmptyHandleError);
    expect(() => createOperator(db, "   ")).toThrow(EmptyHandleError);
  });

  test("wrong secret, right token_id → null (timing-safe compare path)", () => {
    const { token } = createOperator(db, "Bob");
    const [tokenId] = token.split(".");
    const bogus = `${tokenId}.${"f".repeat(48)}`;
    expect(getOperatorByToken(db, bogus)).toBeNull();
  });

  test("right secret, wrong token_id → null", () => {
    const { token } = createOperator(db, "Carol");
    const secret = token.split(".")[1];
    const bogus = `${"0".repeat(16)}.${secret}`;
    expect(getOperatorByToken(db, bogus)).toBeNull();
  });

  test("malformed tokens return null", () => {
    expect(getOperatorByToken(db, "")).toBeNull();
    expect(getOperatorByToken(db, "nodothere")).toBeNull();
    expect(getOperatorByToken(db, ".leadingdot")).toBeNull();
    expect(getOperatorByToken(db, "trailingdot.")).toBeNull();
  });

  test("rotateToken invalidates prior token and issues a new valid one", () => {
    const { operator, token: oldToken } = createOperator(db, "Dave");
    expect(getOperatorByToken(db, oldToken)).not.toBeNull();
    const newToken = rotateToken(db, operator.id);
    expect(newToken).not.toBe(oldToken);
    expect(getOperatorByToken(db, oldToken)).toBeNull();
    const fetched = getOperatorByToken(db, newToken);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(operator.id);
  });

  test("rotateToken on unknown operator throws", () => {
    expect(() => rotateToken(db, 999_999)).toThrow();
  });

  test("stored token_hash differs from plaintext secret bytes", () => {
    const { operator, token } = createOperator(db, "Eve");
    const secret = token.split(".")[1];
    const row = db
      .prepare(
        "SELECT token_hash, token_salt FROM operators WHERE id = ?",
      )
      .get(operator.id) as { token_hash: Uint8Array; token_salt: Uint8Array };
    expect(row.token_hash.length).toBe(32); // sha256
    expect(row.token_salt.length).toBe(16);
    // hash bytes must not equal utf-8 of secret
    const secretBytes = Buffer.from(secret, "utf8");
    expect(Buffer.from(row.token_hash).equals(secretBytes)).toBe(false);
  });

  test("two operators with different handles get distinct token_ids", () => {
    const a = createOperator(db, "opA");
    const b = createOperator(db, "opB");
    expect(a.operator.tokenId).not.toBe(b.operator.tokenId);
    expect(a.token).not.toBe(b.token);
  });
});
