import { describe, it, expect } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const VICTOR_SRC = resolve(import.meta.dir, "..", "src");

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(p));
    else if (entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("victor has no direct Neo4j driver coupling", () => {
  it("no file imports from 'neo4j-driver'", async () => {
    const files = await walk(VICTOR_SRC);
    const offenders: string[] = [];
    for (const f of files) {
      const text = await readFile(f, "utf8");
      if (/from\s+['"]neo4j-driver['"]/.test(text)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("no file named neo4j-store.ts exists in victor/src", async () => {
    const files = await walk(VICTOR_SRC);
    expect(files.find((f) => f.endsWith("/memory/neo4j-store.ts"))).toBeUndefined();
  });
});
