import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BackupManager } from "../../runtime/ops/backup";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

const TEST_DIR = join(__dirname, "test-backup-data");
const TEST_DB = join(TEST_DIR, "test.db");
const BACKUP_DIR = join(TEST_DIR, "backups");

describe("Backup Manager", () => {
  let manager: BackupManager;
  let db: Database.Database;

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    db = new Database(TEST_DB);
    db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT);");
    db.exec("INSERT INTO test (data) VALUES ('test data');");
    db.close();

    manager = new BackupManager(TEST_DIR, BACKUP_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("should create backup directory", () => {
    expect(existsSync(BACKUP_DIR)).toBe(true);
  });

  it("should create uncompressed backup", async () => {
    const backupPath = await manager.createBackup(TEST_DB, false);
    expect(existsSync(backupPath)).toBe(true);
    expect(backupPath).toMatch(/backup-.*\.db$/);
  });

  it("should create compressed backup", async () => {
    const backupPath = await manager.createBackup(TEST_DB, true);
    expect(existsSync(backupPath)).toBe(true);
    expect(backupPath).toMatch(/backup-.*\.db\.gz$/);
  });

  it("should list backups", async () => {
    await manager.createBackup(TEST_DB, false);
    await manager.createBackup(TEST_DB, true);

    const backups = manager.listBackups();
    expect(backups.length).toBeGreaterThanOrEqual(2);
    expect(backups[0].filename).toMatch(/^backup-/);
  });

  it("should restore from uncompressed backup", async () => {
    const backupPath = await manager.createBackup(TEST_DB, false);
    const restoreDb = join(TEST_DIR, "restored.db");

    await manager.restoreBackup(backupPath, restoreDb);

    const restored = new Database(restoreDb);
    const result = restored.prepare("SELECT * FROM test").all();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ data: "test data" });
    restored.close();
  });

  it("should restore from compressed backup", async () => {
    const backupPath = await manager.createBackup(TEST_DB, true);
    const restoreDb = join(TEST_DIR, "restored.db");

    await manager.restoreBackup(backupPath, restoreDb);

    const restored = new Database(restoreDb);
    const result = restored.prepare("SELECT * FROM test").all();
    expect(result).toHaveLength(1);
    restored.close();
  });

  it("should delete old backups", async () => {
    await manager.createBackup(TEST_DB, false);
    await manager.createBackup(TEST_DB, false);
    await manager.createBackup(TEST_DB, false);

    let backups = manager.listBackups();
    const initialCount = backups.length;
    expect(initialCount).toBeGreaterThanOrEqual(3);

    manager.deleteOldBackups(1);

    backups = manager.listBackups();
    expect(backups.length).toBe(1);
  });

  it("should calculate total backup size", async () => {
    await manager.createBackup(TEST_DB, false);
    await manager.createBackup(TEST_DB, false);

    const size = manager.getBackupSize();
    expect(size).toBeGreaterThan(0);
  });

  it("should sort backups by creation time", async () => {
    await manager.createBackup(TEST_DB, false);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await manager.createBackup(TEST_DB, false);

    const backups = manager.listBackups();
    expect(backups.length).toBeGreaterThanOrEqual(2);
    expect(backups[0].created.getTime()).toBeGreaterThanOrEqual(
      backups[1].created.getTime()
    );
  });

  it("should throw error for non-existent database", async () => {
    await expect(
      manager.createBackup(join(TEST_DIR, "nonexistent.db"), false)
    ).rejects.toThrow();
  });

  it("should throw error for non-existent backup", async () => {
    await expect(
      manager.restoreBackup(join(BACKUP_DIR, "nonexistent.db"), TEST_DB)
    ).rejects.toThrow();
  });
});
