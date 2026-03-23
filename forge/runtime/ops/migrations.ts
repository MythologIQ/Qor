import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

export interface MigrationRecord {
  version: number;
  name: string;
  applied_at: string;
}

export class MigrationManager {
  private db: Database.Database;
  private migrationsDir: string;
  private migrations: Migration[] = [];

  constructor(dbPath: string, migrationsDir: string) {
    this.db = new Database(dbPath);
    this.migrationsDir = migrationsDir;
    this.initMigrationsTable();
  }

  private initMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  registerMigration(migration: Migration): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  getCurrentVersion(): number {
    const result = this.db
      .prepare("SELECT MAX(version) as version FROM schema_migrations")
      .get() as { version: number | null };
    return result.version ?? 0;
  }

  getPendingMigrations(): Migration[] {
    const currentVersion = this.getCurrentVersion();
    return this.migrations.filter((m) => m.version > currentVersion);
  }

  getAppliedMigrations(): MigrationRecord[] {
    return this.db
      .prepare("SELECT * FROM schema_migrations ORDER BY version ASC")
      .all() as MigrationRecord[];
  }

  async up(targetVersion?: number): Promise<void> {
    const pending = this.getPendingMigrations();
    const toApply = targetVersion
      ? pending.filter((m) => m.version <= targetVersion)
      : pending;

    if (toApply.length === 0) {
      console.log("No pending migrations");
      return;
    }

    for (const migration of toApply) {
      console.log(`Applying migration ${migration.version}: ${migration.name}`);
      
      const transaction = this.db.transaction(() => {
        this.db.exec(migration.up);
        this.db
          .prepare(
            "INSERT INTO schema_migrations (version, name) VALUES (?, ?)"
          )
          .run(migration.version, migration.name);
      });

      try {
        transaction();
        console.log(`✓ Migration ${migration.version} applied successfully`);
      } catch (err) {
        console.error(`✗ Migration ${migration.version} failed:`, err);
        throw err;
      }
    }
  }

  async down(steps = 1): Promise<void> {
    const applied = this.getAppliedMigrations();
    const toRollback = applied.slice(-steps).reverse();

    if (toRollback.length === 0) {
      console.log("No migrations to rollback");
      return;
    }

    for (const record of toRollback) {
      const migration = this.migrations.find((m) => m.version === record.version);
      if (!migration) {
        throw new Error(`Migration ${record.version} not found in registry`);
      }

      console.log(`Rolling back migration ${migration.version}: ${migration.name}`);

      const transaction = this.db.transaction(() => {
        this.db.exec(migration.down);
        this.db
          .prepare("DELETE FROM schema_migrations WHERE version = ?")
          .run(migration.version);
      });

      try {
        transaction();
        console.log(`✓ Migration ${migration.version} rolled back successfully`);
      } catch (err) {
        console.error(`✗ Rollback ${migration.version} failed:`, err);
        throw err;
      }
    }
  }

  status(): void {
    const current = this.getCurrentVersion();
    const pending = this.getPendingMigrations();
    const applied = this.getAppliedMigrations();

    console.log("\nMigration Status:");
    console.log(`Current version: ${current}`);
    console.log(`Applied migrations: ${applied.length}`);
    console.log(`Pending migrations: ${pending.length}\n`);

    if (applied.length > 0) {
      console.log("Applied:");
      applied.forEach((m) => {
        console.log(`  ✓ ${m.version}: ${m.name} (${m.applied_at})`);
      });
    }

    if (pending.length > 0) {
      console.log("\nPending:");
      pending.forEach((m) => {
        console.log(`  ○ ${m.version}: ${m.name}`);
      });
    }
  }

  close(): void {
    this.db.close();
  }
}

export function createMigrationFile(
  migrationsDir: string,
  name: string
): string {
  if (!existsSync(migrationsDir)) {
    mkdirSync(migrationsDir, { recursive: true });
  }

  const version = Date.now();
  const fileName = `${version}_${name.replace(/\s+/g, "_")}.sql`;
  const filePath = join(migrationsDir, fileName);

  const template = `-- Migration: ${name}
-- Version: ${version}

-- UP
-- Add your migration SQL here


-- DOWN
-- Add your rollback SQL here

`;

  writeFileSync(filePath, template, "utf-8");
  console.log(`Created migration: ${filePath}`);
  return filePath;
}
