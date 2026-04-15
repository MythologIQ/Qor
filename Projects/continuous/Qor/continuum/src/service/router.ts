import { staticRoutes } from "./static-routes";

const API_PREFIXES = [
  "/api/continuum",
  "/api/victor",
  "/api/forge",
  "/api/qora",
  "/api/qor",
  "/api/chat",
];

export async function route(
  req: Request,
  handleGraphRoutes: (path: string, url: URL, req: Request) => Promise<Response | null>,
  handleLayerRoutes: (path: string, req: Request) => Promise<Response | null>,
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path.startsWith("/api/chat")) {
    return Response.json({ error: "not implemented" }, { status: 501 });
  }

  if (API_PREFIXES.some((p) => path.startsWith(p))) {
    const graphRes = await handleGraphRoutes(path, url, req);
    if (graphRes) return graphRes;
    const layerRes = await handleLayerRoutes(path, req);
    if (layerRes) return layerRes;
    return Response.json({ error: "not found" }, { status: 404 });
  }

  if (req.headers.get("upgrade") === "websocket") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  return staticRoutes(path);
}
