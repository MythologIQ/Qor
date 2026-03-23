import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MigrationManager } from "../../runtime/ops/migrations";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const TEST_DB = join(__dirname, "test-migrations.db");
const MIGRATIONS_DIR = join(__dirname, "../fixtures/migrations");

describe("Migration Manager", () => {
  let manager: MigrationManager;

  beforeEach(() => {
    if (existsSync(TEST_DB)) {
      unlinkSync(TEST_DB);
    }
    manager = new MigrationManager(TEST_DB, MIGRATIONS_DIR);
  });

  afterEach(() => {
    manager.close();
    if (existsSync(TEST_DB)) {
      unlinkSync(TEST_DB);
    }
  });

  it("should initialize migrations table", () => {
    expect(manager.getCurrentVersion()).toBe(0);
  });

  it("should register and track migrations", () => {
    manager.registerMigration({
      version: 1,
      name: "create_users_table",
      up: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);",
      down: "DROP TABLE users;",
    });

    const pending = manager.getPendingMigrations();
    expect(pending).toHaveLength(1);
    expect(pending[0].version).toBe(1);
  });

  it("should apply migrations", async () => {
    manager.registerMigration({
      version: 1,
      name: "create_users_table",
      up: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);",
      down: "DROP TABLE users;",
    });

    await manager.up();

    expect(manager.getCurrentVersion()).toBe(1);
    const applied = manager.getAppliedMigrations();
    expect(applied).toHaveLength(1);
    expect(applied[0].name).toBe("create_users_table");
  });

  it("should rollback migrations", async () => {
    manager.registerMigration({
      version: 1,
      name: "create_users_table",
      up: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);",
      down: "DROP TABLE users;",
    });

    await manager.up();
    expect(manager.getCurrentVersion()).toBe(1);

    await manager.down(1);
    expect(manager.getCurrentVersion()).toBe(0);
  });

  it("should apply migrations in order", async () => {
    manager.registerMigration({
      version: 2,
      name: "add_email_column",
      up: "ALTER TABLE users ADD COLUMN email TEXT;",
      down: "ALTER TABLE users DROP COLUMN email;",
    });

    manager.registerMigration({
      version: 1,
      name: "create_users_table",
      up: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);",
      down: "DROP TABLE users;",
    });

    await manager.up();

    const applied = manager.getAppliedMigrations();
    expect(applied).toHaveLength(2);
    expect(applied[0].version).toBe(1);
    expect(applied[1].version).toBe(2);
  });

  it("should apply migrations up to target version", async () => {
    manager.registerMigration({
      version: 1,
      name: "migration_1",
      up: "CREATE TABLE test1 (id INTEGER);",
      down: "DROP TABLE test1;",
    });

    manager.registerMigration({
      version: 2,
      name: "migration_2",
      up: "CREATE TABLE test2 (id INTEGER);",
      down: "DROP TABLE test2;",
    });

    manager.registerMigration({
      version: 3,
      name: "migration_3",
      up: "CREATE TABLE test3 (id INTEGER);",
      down: "DROP TABLE test3;",
    });

    await manager.up(2);

    expect(manager.getCurrentVersion()).toBe(2);
    const pending = manager.getPendingMigrations();
    expect(pending).toHaveLength(1);
    expect(pending[0].version).toBe(3);
  });

  it("should handle no pending migrations", async () => {
    await expect(manager.up()).resolves.toBeUndefined();
  });

  it("should handle no migrations to rollback", async () => {
    await expect(manager.down()).resolves.toBeUndefined();
  });

  it("should track migration timestamps", async () => {
    manager.registerMigration({
      version: 1,
      name: "test_migration",
      up: "CREATE TABLE test (id INTEGER);",
      down: "DROP TABLE test;",
    });

    await manager.up();

    const applied = manager.getAppliedMigrations();
    expect(applied[0].applied_at).toBeTruthy();
    const timestamp = new Date(applied[0].applied_at);
    expect(timestamp.getTime()).toBeGreaterThan(0);
  });
});
