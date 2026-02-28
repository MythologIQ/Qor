#!/usr/bin/env node
import { BackupManager } from "../runtime/ops/backup";
import { join } from "node:path";

const command = process.argv[2];
const dataDir = process.env.QORE_DATA_DIR || "./data";
const dbPath = join(dataDir, "qore.db");
const backupDir = join(dataDir, "backups");

const manager = new BackupManager(dataDir, backupDir);

async function formatBytes(bytes: number): Promise<string> {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

async function main() {
  try {
    switch (command) {
      case "create":
        const compress = !process.argv.includes("--no-compress");
        await manager.createBackup(dbPath, compress);
        break;

      case "restore":
        const backupFile = process.argv[3];
        if (!backupFile) {
          console.error("Usage: backup restore <backup_file>");
          process.exit(1);
        }
        const backupPath = join(backupDir, backupFile);
        await manager.restoreBackup(backupPath, dbPath);
        break;

      case "list":
        const backups = manager.listBackups();
        if (backups.length === 0) {
          console.log("No backups found");
        } else {
          console.log("\nAvailable backups:");
          for (const backup of backups) {
            const size = await formatBytes(backup.size);
            console.log(`  ${backup.filename} - ${size} - ${backup.created.toISOString()}`);
          }
          const totalSize = await formatBytes(manager.getBackupSize());
          console.log(`\nTotal: ${backups.length} backups (${totalSize})\n`);
        }
        break;

      case "clean":
        const keepCount = parseInt(process.argv[3] || "7", 10);
        manager.deleteOldBackups(keepCount);
        break;

      default:
        console.log(`
Zo-Qore Backup CLI

Usage:
  backup create [--no-compress]  - Create a new backup
  backup restore <file>          - Restore from backup
  backup list                    - List available backups
  backup clean [keep]            - Delete old backups (default: keep 7)

Environment:
  QORE_DATA_DIR                  - Data directory (default: ./data)
        `);
        break;
    }
  } catch (err) {
    console.error("Backup operation failed:", err);
    process.exit(1);
  }
}

main();
