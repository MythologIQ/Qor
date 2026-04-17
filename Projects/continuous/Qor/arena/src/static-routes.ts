import type { Hono } from "hono";
import { serveStatic as honoServeStatic } from "hono/bun";

export function serveStatic(app: Hono): void {
  app.use(
    "/arena/static/*",
    honoServeStatic({
      root: "./src/",
      rewriteRequestPath: (path) => path.replace(/^\/arena\/static\//, "/public/"),
    }),
  );

  app.get("/arena", (c) =>
    c.redirect("/arena.html"),
  );
}
