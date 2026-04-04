import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";

export const PATHS = {
  forgeRoot: "/home/workspace/Projects/continuous/Qor/forge",
  builderPhases: "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/path/phases.json",
  builderLedger: "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/ledger.jsonl",
  forgeGovernance: "/home/workspace/Projects/continuous/Qor/forge/docs/GOVERNANCE.md",
  forgeState: "/home/workspace/Projects/continuous/Qor/forge/state.json",
  projectsDir: "/home/workspace/Projects/continuous/Qor/.qore/projects",
} as const;

export function readJson<T>(path: string, fallback: T): T {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : fallback;
  } catch {
    return fallback;
  }
}

export function readLines(path: string): string[] {
  try {
    return existsSync(path)
      ? readFileSync(path, "utf-8").trim().split("\n").filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function loadPhases(phasesPath: string): any[] {
  const raw = readJson<any>(phasesPath, { phases: [] });
  const candidate = Array.isArray(raw) ? raw : raw?.phases;
  return Array.isArray(candidate) ? candidate : [];
}

export function computeProgress(phases: any[]) {
  const allTasks = phases.flatMap((p) => p.tasks || []);
  const done = allTasks.filter((t: any) => t.status === "done");
  return {
    percent: allTasks.length > 0
      ? Math.round((done.length / allTasks.length) * 100)
      : 0,
    completed: done.length,
    total: allTasks.length,
  };
}

export function findActivePhase(phases: any[]) {
  return phases.find(
    (p: any) => p.status === "active" || p.status === "in-progress",
  ) || null;
}

export function countCompleted(phases: any[]) {
  return phases.filter(
    (p: any) =>
      p.status === "done" ||
      p.status === "complete" ||
      (p.tasks || []).every((t: any) => t.status === "done"),
  );
}

function projectDisplayName(dirName: string): string {
  if (dirName === "builder-console") return "Forge (Builder Console)";
  if (dirName === "victor-resident") return "Victor Resident";
  return dirName;
}

function projectStatus(activePhase: any, completed: any[], total: number): string {
  if (activePhase) return "active";
  return completed.length === total ? "complete" : "planned";
}

export function buildSubProject(dirName: string) {
  const phases = loadPhases(`${PATHS.projectsDir}/${dirName}/path/phases.json`);
  const progress = computeProgress(phases);
  const activePhase = findActivePhase(phases);
  const completed = countCompleted(phases);
  const allTasks = phases.flatMap((p) => p.tasks || []);
  const active = allTasks.filter(
    (t: any) => t.status === "active" || t.status === "in-progress",
  );
  const future = allTasks.filter(
    (t: any) => t.status === "pending" || t.status === "queued" || t.status === "active",
  );
  return {
    id: dirName,
    name: projectDisplayName(dirName),
    status: projectStatus(activePhase, completed, phases.length),
    summary: activePhase?.objective || phases[0]?.objective || "",
    currentPhase: activePhase?.name || null,
    progress,
    phases: phases.map((p: any) => ({
      id: p.phaseId, name: p.name, status: p.status, objective: p.objective,
      percent: (p.tasks || []).length > 0
        ? Math.round(((p.tasks || []).filter((t: any) => t.status === "done").length / (p.tasks || []).length) * 100)
        : 0,
      taskCount: (p.tasks || []).length,
    })),
    activeTasks: active.slice(0, 10).map((t: any) => ({ id: t.taskId, title: t.title, status: t.status })),
    futureTasks: future.slice(0, 20).map((t: any) => ({ id: t.taskId, title: t.title, status: t.status, acceptance: t.acceptance || [] })),
    milestones: completed.slice(0, 10).map((p: any) => ({ title: p.name, detail: `${(p.tasks || []).length} tasks` })),
    dependencies: [],
    risks: [],
  };
}

export function buildProjectTree(): any[] {
  if (!existsSync(PATHS.projectsDir)) return [];
  const dirs = readdirSync(PATHS.projectsDir).filter((d) => {
    const p = `${PATHS.projectsDir}/${d}`;
    return statSync(p).isDirectory() && existsSync(`${p}/path/phases.json`);
  });
  const subProjects = dirs.map(buildSubProject);
  return [{ id: "qor-forge", name: "QOR Forge", subProjects, status: "active" }];
}
