import type { Database } from "bun:sqlite";
import type { Context } from "hono";
import { getOperatorByToken } from "../identity/operator";

export function requireOperator(db: Database, c: Context) {
  const auth = c.req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) return null;
  return getOperatorByToken(db, match[1]);
}
