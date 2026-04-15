const STATIC_DIR = import.meta.dir + "/../../public";

const ROUTE_MAP: Record<string, string> = {
  "/qor": "/qor/index.html",
  "/qor/victor": "/qor/victor.html",
  "/qor/victor/chat": "/qor/victor-chat.html",
  "/qor/victor/automation": "/qor/victor-automation.html",
  "/qor/victor/governance": "/qor/victor-governance.html",
  "/qor/victor/audit": "/qor/victor-audit.html",
  "/qor/forge": "/qor/forge.html",
  "/qor/forge/projects": "/qor/forge-projects.html",
  "/qor/forge/roadmap": "/qor/forge-roadmap.html",
  "/qor/forge/risks": "/qor/forge-risks.html",
  "/qor/forge/constellation": "/qor/forge-constellation.html",
  "/qor/forge/chat": "/qor/forge-chat.html",
  "/qor/qora": "/qor/qora.html",
  "/qor/continuum": "/qor/continuum.html",
  "/mobile/qor": "/mobile/qor.html",
  "/mobile/qor/victor": "/mobile/qor-victor.html",
  "/mobile/qor/qora": "/mobile/qor-qora.html",
  "/mobile/qor/continuum": "/mobile/qor-continuum.html",
  "/mobile/qor/forge": "/mobile/qor-forge.html",
};

export async function staticRoutes(path: string): Promise<Response> {
  if (path === "/" || path === "/index.html") {
    const f = Bun.file(STATIC_DIR + "/index.html");
    if (await f.exists()) return new Response(f);
  }
  const mapped = ROUTE_MAP[path];
  const file = mapped
    ? Bun.file(STATIC_DIR + mapped)
    : Bun.file(STATIC_DIR + path);
  if (!(await file.exists())) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return new Response(file);
}
