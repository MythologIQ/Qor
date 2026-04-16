/**
 * Continuum Memory Service — sole owner of the Neo4j driver.
 * Fail-closed on missing env vars: NEO4J_URI, NEO4J_USER, NEO4J_PASS.
 * No defaults, no fallbacks. All Cypher execution funnels through memory/ops/*.
 */

import neo4j, { type Driver } from "neo4j-driver";

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(`missing required env var: ${name}`);
    this.name = "MissingEnvError";
  }
}

let driver: Driver | null = null;

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new MissingEnvError(name);
  return value;
}

export function getDriver(): Driver {
  if (driver) return driver;
  const uri = readEnv("NEO4J_URI");
  const user = readEnv("NEO4J_USER");
  const pass = readEnv("NEO4J_PASS");
  driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  return driver;
}

export async function closeDriver(): Promise<void> {
  if (!driver) return;
  await driver.close();
  driver = null;
}
