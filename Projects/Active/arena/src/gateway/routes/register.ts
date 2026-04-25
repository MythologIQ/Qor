import { Hono } from "hono";
import { createOperator } from "../../storage/operators.js";

const router = new Hono();

router.post("/", async (c) => {
  const body = await c.req.json<{ handle?: string }>();
  const { handle } = body ?? {};

  if (!handle || typeof handle !== "string") {
    return c.json({ error: "handle is required" }, 400);
  }
  if (handle.length < 3 || handle.length > 32) {
    return c.json({ error: "handle must be 3–32 characters" }, 400);
  }
  if (!/^[a-zA-Z0-9\-]+$/.test(handle)) {
    return c.json({ error: "handle must be alphanumeric + hyphens only" }, 400);
  }

  try {
    const result = createOperator(handle);
    return c.json({ operator: result.operator, apiKey: result.apiKey }, 201);
  } catch (err: any) {
    if (err.message?.includes("already taken")) {
      return c.json({ error: err.message }, 409);
    }
    return c.json({ error: "Internal error" }, 500);
  }
});

export default router;