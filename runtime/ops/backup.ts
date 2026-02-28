import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createGzip } from "node:zlib";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

export interface BackupMetadata {
  timestamp: string;
  version: string;
  dbSize: number;
  schemaVersion: number;
}

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  created: Date;
  metadata?: BackupMetadata;
}

export class BackupManager {
  private dataDir: string;
  private backupDir: string;

  constructor(dataDir: string, backupDir?: string) {
    this.dataDir = dataDir;
    this.backupDir = backupDir || join(dataDir, "backups");

    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async createBackup(dbPath: string, compress = true): Promise<string> {
    if (!existsSync(dbPath)) {
      throw new Error(`Database not found: ${dbPath}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `backup-${timestamp}.db`;
    const backupPath = join(this.backupDir, baseName);

    // Use SQLite's VACUUM INTO for consistent backup
    try {
      execSync(`sqlite3 "${dbPath}" "VACUUM INTO '${backupPath}'"`);
    } catch (err) {
      throw new Error(`Backup failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }

    // Compress if requested
    if (compress) {
      const gzPath = `${backupPath}.gz`;
      await this.compressFile(backupPath, gzPath);
      
      // Remove uncompressed backup
      const fs = require("node:fs");
      fs.unlinkSync(backupPath);
      
      console.log(`✓ Backup created: ${basename(gzPath)}`);
      return gzPath;
    }

    console.log(`✓ Backup created: ${baseName}`);
    return backupPath;
  }

  private async compressFile(input: string, output: string): Promise<void> {
    const gzip = createGzip({ level: 9 });
    const source = createReadStream(input);
    const destination = createWriteStream(output);

    await pipeline(source, gzip, destination);
  }

  private async decompressFile(input: string, output: string): Promise<void> {
    const { createGunzip } = require("node:zlib");
    const gunzip = createGunzip();
    const source = createReadStream(input);
    const destination = createWriteStream(output);

    await pipeline(source, gunzip, destination);
  }

  async restoreBackup(backupPath: string, targetDbPath: string): Promise<void> {
    if (!existsSync(backupPath)) {
      throw new Error(`Backup not found: ${backupPath}`);
    }

    let sourceDb = backupPath;

    // Decompress if needed
    if (backupPath.endsWith(".gz")) {
      const tempDb = backupPath.replace(".gz", "");
      await this.decompressFile(backupPath, tempDb);
      sourceDb = tempDb;
    }

    // Close any existing connections to target DB
    // (In production, ensure app is stopped before restore)

    // Copy backup to target location
    copyFileSync(sourceDb, targetDbPath);

    // Clean up temp file if we decompressed
    if (sourceDb !== backupPath) {
      const fs = require("node:fs");
      fs.unlinkSync(sourceDb);
    }

    console.log(`✓ Database restored from ${basename(backupPath)}`);
  }

  listBackups(): BackupInfo[] {
    const files = readdirSync(this.backupDir);
    const backups: BackupInfo[] = [];

    for (const file of files) {
      if (file.startsWith("backup-") && (file.endsWith(".db") || file.endsWith(".db.gz"))) {
        const path = join(this.backupDir, file);
        const stats = statSync(path);
        backups.push({
          filename: file,
          path,
          size: stats.size,
          created: stats.mtime,
        });
      }
    }

    return backups.sort((a, b) => b.created.getTime() - a.created.getTime());
  }

  deleteOldBackups(keepCount: number): void {
    const backups = this.listBackups();
    const toDelete = backups.slice(keepCount);

    for (const backup of toDelete) {
      const fs = require("node:fs");
      fs.unlinkSync(backup.path);
      console.log(`✓ Deleted old backup: ${backup.filename}`);
    }

    if (toDelete.length === 0) {
      console.log("No old backups to delete");
    }
  }

  getBackupSize(): number {
    const backups = this.listBackups();
    return backups.reduce((total, b) => total + b.size, 0);
  }
}

export async function scheduleBackup(
  dbPath: string,
  backupDir: string,
  intervalHours = 24,
  keepBackups = 7
): Promise<NodeJS.Timeout> {
  const manager = new BackupManager(backupDir);

  const runBackup = async () => {
    try {
      await manager.createBackup(dbPath, true);
      manager.deleteOldBackups(keepBackups);
    } catch (err) {
      console.error("Scheduled backup failed:", err);
    }
  };

  // Run initial backup
  await runBackup();

  // Schedule recurring backups
  const intervalMs = intervalHours * 60 * 60 * 1000;
  return setInterval(runBackup, intervalMs);
}
