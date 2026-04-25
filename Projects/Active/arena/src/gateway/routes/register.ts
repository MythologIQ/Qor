import { Hono } from "hono";
import { registerOperator } from "../../storage/operators";
import type { Context } from "hono";

const register = new Hono();

register.post("/", (c: Context) => {
  const body = c.req.json ? undefined : undefined;
  return c.req.json().then((parsed: { handle?: string }) => {
    const handle = parsed?.handle;
    if (!handle || typeof handle !== "string") {
      return c.json({ error: "handle is required" }, 400);
    }
    try {
      const result = registerOperator(handle);
      return c.json(
        {
          operator: {
            id: result.operator.id,
            handle: result.operator.handle,
          },
          apiKey: result.apiKey,
        },
        201,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      if (msg.includes("UNIQUE")) {
        return c.json({ error: "Handle already taken" }, 409);
      }
      return c.json({ error: msg }, 400);
    }
  });
});

export { register };
