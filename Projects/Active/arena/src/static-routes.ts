import type { Hono } from "hono";
import { serveStatic as honoServeStatic } from "hono/bun";
import { readFileSync } from "fs";
import { resolve } from "path";

export function serveStatic(app: Hono): void {
  app.use(
    "/arena/static/*",
    honoServeStatic({
      root: "./src/",
      rewriteRequestPath: (path) => path.replace(/^\/arena\/static\//, "/public/"),
    }),
  );

  // Serve arena.html directly — /arena redirects here
  app.get("/arena.html", (c) => {
    try {
      const filePath = resolve(process.cwd(), "src/public/arena.html");
      const content = readFileSync(filePath);
      return c.body(content, 200, { "Content-Type": "text/html" });
    } catch (e: any) {
      return c.text(`Cannot load arena.html: ${e.message}`, 500);
    }
  });

  app.get("/arena", (c) =>
    c.redirect(`/arena.html${new URL(c.req.url).search}`),
  );
}
