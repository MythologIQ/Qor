/**
 * Structural enforcement: single driver owner + no hardcoded Neo4j credentials.
 * Fails the build if a second caller instantiates neo4j.driver() or if any file
 * reintroduces a default NEO4J_PASS fallback.
 */
import { describe, it, expect } from "bun:test";
import { readdir } from "fs/promises";
import { join, relative } from "path";

const ROOT = join(import.meta.dir, "..", "..", "src");
const DRIVER_OWNER = "memory/driver.ts";

async function collectTsFiles(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await collectTsFiles(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("single-driver-owner enforcement", () => {
  it("only memory/driver.ts calls neo4j.driver()", async () => {
    const files = await collectTsFiles(ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      const text = await Bun.file(file).text();
      if (/neo4j\.driver\s*\(/.test(text)) {
        const rel = relative(ROOT, file).replaceAll("\\", "/");
        if (rel !== DRIVER_OWNER) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no src/** file hardcodes a default NEO4J password", async () => {
    const files = await collectTsFiles(ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      const text = await Bun.file(file).text();
      if (/NEO4J_PASS[^=]*\?\?\s*"[^"]+"/.test(text) ||
          /process\.env\.NEO4J_PASS\s*\|\|\s*"[^"]+"/.test(text)) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no src/** file hardcodes a default NEO4J_URI", async () => {
    const files = await collectTsFiles(ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      const text = await Bun.file(file).text();
      if (/NEO4J_URI[^=]*\?\?\s*"bolt:\/\//.test(text)) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
