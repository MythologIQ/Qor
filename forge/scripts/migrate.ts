#!/usr/bin/env node
import { MigrationManager, createMigrationFile } from "../runtime/ops/migrations";
import { join } from "node:path";

const command = process.argv[2];
const dataDir = process.env.QORE_DATA_DIR || "./data";
const dbPath = join(dataDir, "qore.db");
const migrationsDir = join(__dirname, "../migrations");

const manager = new MigrationManager(dbPath, migrationsDir);

// Register example migrations (in real use, these would be loaded from files)
// This is a placeholder - actual migrations would be loaded dynamically

async function main() {
  try {
    switch (command) {
      case "up":
        await manager.up();
        break;

      case "down":
        const steps = parseInt(process.argv[3] || "1", 10);
        await manager.down(steps);
        break;

      case "status":
        manager.status();
        break;

      case "create":
        const name = process.argv.slice(3).join(" ");
        if (!name) {
          console.error("Usage: migrate create <migration_name>");
          process.exit(1);
        }
        createMigrationFile(migrationsDir, name);
        break;

      default:
        console.log(`
Zo-Qore Migration CLI

Usage:
  migrate up              - Apply all pending migrations
  migrate down [steps]    - Rollback migrations (default: 1)
  migrate status          - Show migration status
  migrate create <name>   - Create a new migration file

Environment:
  QORE_DATA_DIR          - Data directory (default: ./data)
        `);
        break;
    }
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    manager.close();
  }
}

main();
