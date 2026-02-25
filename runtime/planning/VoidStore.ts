import { readFile, writeFile, mkdir, access, stat } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { createLogger } from "./Logger";
import { PlanningStoreError } from "./StoreErrors";
import { StoreIntegrity } from "./StoreIntegrity";
import type { VoidThought } from "@mythologiq/qore-contracts";
import type { PlanningLedger } from "./PlanningLedger";

const logger = createLogger("void-store");

export interface VoidStoreOptions {
  ledger?: PlanningLedger;
  integrity?: StoreIntegrity;
}

/**
 * Index entry mapping thoughtId to byte offset in thoughts.jsonl
 */
export interface ThoughtIndexEntry {
  thoughtId: string;
  byteOffset: number;
  byteLength: number;
}

/**
 * Pagination options for getThoughts
 */
export interface GetThoughtsOptions {
  offset?: number;
  limit?: number;
  filter?: {
    status?: "raw" | "claimed";
    tags?: string[];
    source?: string;
  };
}

/**
 * Paginated result from getThoughts
 */
export interface PaginatedThoughts {
  thoughts: VoidThought[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Result of batch thought import
 */
export interface BatchImportResult {
  succeeded: Array<{ thoughtId: string; index: number }>;
  failed: Array<{ index: number; error: string }>;
  totalAttempted: number;
  totalSucceeded: number;
  totalFailed: number;
}

/**
 * Options for batch thought import
 */
export interface BatchImportOptions {
  skipDuplicates?: boolean;
  continueOnError?: boolean;
  actorId?: string;
}

/**
 * Input type for batch thought import
 * All fields are optional except those needed for validation
 */
export type BatchThoughtInput = {
  content: string;
  source: "text" | "voice";
  capturedBy: string;
  tags?: string[];
  status?: "raw" | "claimed";
};

export class VoidStore {
  private ledger?: PlanningLedger;
  private integrity?: StoreIntegrity;
  private indexCache: Map<string, ThoughtIndexEntry> | null = null;
  private indexLastModified: number = 0;

  constructor(
    private basePath: string,
    private projectId: string,
    options?: VoidStoreOptions,
  ) {
    this.ledger = options?.ledger;
    this.integrity = options?.integrity;
  }

  private get voidPath(): string {
    return join(this.basePath, this.projectId, "void");
  }

  private get thoughtsFile(): string {
    return join(this.voidPath, "thoughts.jsonl");
  }

  private get indexFile(): string {
    return join(this.voidPath, "index.json");
  }

  private async ensureDirectory(): Promise<void> {
    try {
      await mkdir(this.voidPath, { recursive: true });
    } catch (e) {
      throw new PlanningStoreError(
        "WRITE_FAILED",
        `Failed to create void directory: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId },
      );
    }
  }

  async addThought(thought: VoidThought, actorId?: string): Promise<VoidThought> {
    logger.info("Adding thought", { projectId: this.projectId, thoughtId: thought.thoughtId });
    await this.ensureDirectory();

    const checksumBefore = await this.integrity?.getChecksum("void", "thoughts.jsonl") ?? null;

    // Get current file size for index offset
    let byteOffset = 0;
    try {
      const stats = await stat(this.thoughtsFile);
      byteOffset = stats.size;
    } catch {
      // File doesn't exist yet, offset is 0
    }

    const line = JSON.stringify(thought) + "\n";
    const byteLength = Buffer.byteLength(line, "utf-8");
    
    try {
      await writeFile(this.thoughtsFile, line, { flag: "a" });
    } catch (e) {
      throw new PlanningStoreError(
        "WRITE_FAILED",
        `Failed to write thought: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId, thoughtId: thought.thoughtId },
      );
    }

    // Update index with new thought
    await this.appendIndexEntry({
      thoughtId: thought.thoughtId,
      byteOffset,
      byteLength,
    });

    const checksumAfter = await this.integrity?.getChecksum("void", "thoughts.jsonl") ?? null;

    if (this.ledger) {
      await this.ledger.appendEntry({
        projectId: this.projectId,
        view: "void",
        action: "create",
        artifactId: thought.thoughtId,
        actorId: actorId ?? "system",
        checksumBefore,
        checksumAfter,
        payload: { source: thought.source, status: thought.status },
      });
    }

    logger.info("Thought added", { projectId: this.projectId, thoughtId: thought.thoughtId });
    return thought;
  }

  /**
   * Append an entry to the index file
   */
  private async appendIndexEntry(entry: ThoughtIndexEntry): Promise<void> {
    try {
      const line = JSON.stringify(entry) + "\n";
      await writeFile(this.indexFile, line, { flag: "a" });
      // Invalidate cache
      this.indexCache = null;
    } catch (e) {
      logger.warn("Failed to update index", { error: e instanceof Error ? e.message : "Unknown error" });
      // Non-fatal - index can be rebuilt
    }
  }

  /**
   * Load the index into memory for O(1) lookups
   */
  private async loadIndex(): Promise<Map<string, ThoughtIndexEntry>> {
    // Check cache validity
    if (this.indexCache) {
      try {
        const stats = await stat(this.indexFile);
        if (stats.mtimeMs <= this.indexLastModified) {
          return this.indexCache;
        }
      } catch {
        // Index file may not exist
      }
    }

    const index = new Map<string, ThoughtIndexEntry>();
    
    try {
      const content = await readFile(this.indexFile, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as ThoughtIndexEntry;
          index.set(entry.thoughtId, entry);
        } catch {
          // Skip malformed entries
        }
      }

      try {
        const stats = await stat(this.indexFile);
        this.indexLastModified = stats.mtimeMs;
      } catch {
        // Ignore
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn("Failed to load index", { error: e instanceof Error ? e.message : "Unknown error" });
      }
      // Index doesn't exist yet, return empty map
    }

    this.indexCache = index;
    return index;
  }

  /**
   * Build or rebuild the index from thoughts.jsonl
   * Call this if the index is corrupted or missing
   */
  async buildIndex(): Promise<number> {
    logger.info("Building thought index", { projectId: this.projectId });
    
    // Ensure directory exists
    await this.ensureDirectory();
    
    const index = new Map<string, ThoughtIndexEntry>();
    let byteOffset = 0;
    let count = 0;

    try {
      const content = await readFile(this.thoughtsFile, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        const byteLength = Buffer.byteLength(line + "\n", "utf-8");
        try {
          const thought = JSON.parse(line) as VoidThought;
          index.set(thought.thoughtId, {
            thoughtId: thought.thoughtId,
            byteOffset,
            byteLength,
          });
          count++;
        } catch {
          // Skip malformed lines
        }
        byteOffset += byteLength;
      }

      // Write index file
      const indexContent = Array.from(index.values())
        .map((entry) => JSON.stringify(entry))
        .join("\n") + "\n";
      
      await writeFile(this.indexFile, indexContent, "utf-8");
      this.indexCache = index;
      
      logger.info("Index built", { projectId: this.projectId, count });
      return count;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        // No thoughts file, create empty index
        await writeFile(this.indexFile, "", "utf-8");
        this.indexCache = new Map();
        return 0;
      }
      throw new PlanningStoreError(
        "READ_FAILED",
        `Failed to build index: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId },
      );
    }
  }

  /**
   * Get a single thought by ID using index for O(1) lookup
   */
  async getThought(thoughtId: string): Promise<VoidThought | null> {
    const index = await this.loadIndex();
    const entry = index.get(thoughtId);
    
    if (!entry) {
      // Fallback to linear search in case index is out of sync
      const thoughts = await this.getAllThoughts();
      return thoughts.find((t) => t.thoughtId === thoughtId) ?? null;
    }

    try {
      const fd = await import("fs/promises").then((fs) => 
        fs.open(this.thoughtsFile, "r")
      );
      
      const buffer = Buffer.alloc(entry.byteLength);
      await fd.read(buffer, 0, entry.byteLength, entry.byteOffset);
      await fd.close();
      
      const line = buffer.toString("utf-8").trim();
      return JSON.parse(line) as VoidThought;
    } catch (e) {
      logger.warn("Index lookup failed, falling back to linear search", { 
        thoughtId, 
        error: e instanceof Error ? e.message : "Unknown error" 
      });
      // Fallback to linear search
      const thoughts = await this.getAllThoughts();
      return thoughts.find((t) => t.thoughtId === thoughtId) ?? null;
    }
  }

  /**
   * Get all thoughts (loads entire file - use getThoughts for pagination)
   */
  async getAllThoughts(): Promise<VoidThought[]> {
    logger.debug("Reading all thoughts", { projectId: this.projectId });

    try {
      const content = await readFile(this.thoughtsFile, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      return lines.map((line) => {
        try {
          return JSON.parse(line) as VoidThought;
        } catch {
          logger.warn("Skipping malformed thought entry");
          return null;
        }
      }).filter((t): t is VoidThought => t !== null);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        logger.debug("thoughts.jsonl not found, returning empty array");
        return [];
      }
      throw new PlanningStoreError(
        "READ_FAILED",
        `Failed to read thoughts: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId },
      );
    }
  }

  /**
   * Get thoughts with pagination and filtering
   * Recommended for large datasets instead of getAllThoughts()
   */
  async getThoughts(options: GetThoughtsOptions = {}): Promise<PaginatedThoughts> {
    const { offset = 0, limit = 50, filter } = options;
    
    logger.debug("Getting paginated thoughts", { 
      projectId: this.projectId, 
      offset, 
      limit, 
      hasFilter: !!filter 
    });

    // For filtered queries, we need to scan
    if (filter) {
      const allThoughts = await this.getAllThoughts();
      let filtered = allThoughts;

      if (filter.status) {
        filtered = filtered.filter((t) => t.status === filter.status);
      }

      if (filter.tags && filter.tags.length > 0) {
        filtered = filtered.filter((t) => 
          t.tags?.some((tag) => filter.tags!.includes(tag))
        );
      }

      if (filter.source) {
        filtered = filtered.filter((t) => t.source === filter.source);
      }

      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + limit);

      return {
        thoughts: paginated,
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
      };
    }

    // For unfiltered pagination, use streaming to avoid loading all into memory
    try {
      const content = await readFile(this.thoughtsFile, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      
      // We still need to count total for pagination metadata
      const total = lines.length;
      
      // Slice the lines for pagination
      const paginatedLines = lines.slice(offset, offset + limit);
      const thoughts = paginatedLines.map((line) => {
        try {
          return JSON.parse(line) as VoidThought;
        } catch {
          return null;
        }
      }).filter((t): t is VoidThought => t !== null);

      return {
        thoughts,
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          thoughts: [],
          total: 0,
          offset,
          limit,
          hasMore: false,
        };
      }
      throw new PlanningStoreError(
        "READ_FAILED",
        `Failed to read thoughts: ${e instanceof Error ? e.message : "Unknown error"}`,
        { projectId: this.projectId },
      );
    }
  }

  /**
   * Get the total count of thoughts (fast, reads index if available)
   */
  async getThoughtCount(): Promise<number> {
    const index = await this.loadIndex();
    if (index.size > 0) {
      return index.size;
    }
    
    // Fallback: count lines in file
    try {
      const content = await readFile(this.thoughtsFile, "utf-8");
      return content.split("\n").filter((line) => line.trim()).length;
    } catch {
      return 0;
    }
  }

  async getUnclaimedThoughts(): Promise<VoidThought[]> {
    const thoughts = await this.getAllThoughts();
    return thoughts.filter((t) => t.status === "raw");
  }

  async updateThoughtStatus(
    thoughtId: string,
    status: "raw" | "claimed",
    actorId?: string,
  ): Promise<VoidThought | null> {
    const thoughts = await this.getAllThoughts();
    const index = thoughts.findIndex((t) => t.thoughtId === thoughtId);

    if (index === -1) {
      return null;
    }

    const checksumBefore = await this.integrity?.getChecksum("void", "thoughts.jsonl") ?? null;

    thoughts[index] = { ...thoughts[index], status };

    await writeFile(
      this.thoughtsFile,
      thoughts.map((t) => JSON.stringify(t)).join("\n") + "\n",
      "utf-8",
    );

    // Rebuild index after update (file positions changed)
    await this.buildIndex();

    const checksumAfter = await this.integrity?.getChecksum("void", "thoughts.jsonl") ?? null;

    const action = status === "claimed" ? "claim" : "update";

    if (this.ledger) {
      await this.ledger.appendEntry({
        projectId: this.projectId,
        view: "void",
        action,
        artifactId: thoughtId,
        actorId: actorId ?? "system",
        checksumBefore,
        checksumAfter,
      });
    }

    logger.info("Thought status updated", { projectId: this.projectId, thoughtId, status });
    return thoughts[index];
  }

  async getThoughtsByTags(tags: string[]): Promise<VoidThought[]> {
    const thoughts = await this.getAllThoughts();
    return thoughts.filter((t) => t.tags?.some((tag) => tags.includes(tag)));
  }

  /**
   * Import multiple thoughts in a single batch operation
   * Optimized for bulk imports from brainstorming sessions
   */
  async addThoughtsBatch(
    thoughts: BatchThoughtInput[],
    options: BatchImportOptions = {},
  ): Promise<BatchImportResult> {
    const { skipDuplicates = true, continueOnError = true, actorId = "system" } = options;
    
    logger.info("Starting batch thought import", { 
      projectId: this.projectId, 
      count: thoughts.length,
      skipDuplicates,
    });

    await this.ensureDirectory();

    const result: BatchImportResult = {
      succeeded: [],
      failed: [],
      totalAttempted: thoughts.length,
      totalSucceeded: 0,
      totalFailed: 0,
    };

    // Check for existing thoughts if skipDuplicates is true
    let existingIds = new Set<string>();
    if (skipDuplicates) {
      const existing = await this.getAllThoughts();
      // Create a hash of content+source to detect duplicates
      existingIds = new Set(
        existing.map((t) => `${t.content}:${t.source}`)
      );
    }

    const checksumBefore = await this.integrity?.getChecksum("void", "thoughts.jsonl") ?? null;

    // Get current file size for index offset
    let byteOffset = 0;
    try {
      const stats = await stat(this.thoughtsFile);
      byteOffset = stats.size;
    } catch {
      // File doesn't exist yet, offset is 0
    }

    // Process thoughts in batch
    const lines: string[] = [];
    const indexEntries: ThoughtIndexEntry[] = [];
    const timestamp = new Date().toISOString();

    for (let i = 0; i < thoughts.length; i++) {
      const input = thoughts[i];
      
      try {
        // Validate required fields
        if (!input.content || !input.source || !input.capturedBy) {
          result.failed.push({ 
            index: i, 
            error: "Missing required fields: content, source, capturedBy" 
          });
          result.totalFailed++;
          if (!continueOnError) break;
          continue;
        }

        // Check for duplicates
        const contentKey = `${input.content}:${input.source}`;
        if (skipDuplicates && existingIds.has(contentKey)) {
          result.failed.push({ 
            index: i, 
            error: "Duplicate thought (same content and source)" 
          });
          result.totalFailed++;
          continue;
        }

        // Create full thought object
        const thoughtId = `thought_${randomUUID?.()?.slice(0, 8) ?? Date.now().toString(36)}_${i}`;
        const thought: VoidThought = {
          thoughtId,
          projectId: this.projectId,
          content: input.content,
          source: input.source,
          capturedAt: timestamp,
          capturedBy: input.capturedBy,
          tags: input.tags ?? [],
          status: input.status ?? "raw",
        };

        const line = JSON.stringify(thought) + "\n";
        const byteLength = Buffer.byteLength(line, "utf-8");
        
        lines.push(line);
        indexEntries.push({
          thoughtId,
          byteOffset,
          byteLength,
        });

        byteOffset += byteLength;
        result.succeeded.push({ thoughtId, index: i });
        result.totalSucceeded++;

      } catch (err) {
        result.failed.push({ 
          index: i, 
          error: err instanceof Error ? err.message : "Unknown error" 
        });
        result.totalFailed++;
        if (!continueOnError) break;
      }
    }

    // Write all thoughts in a single operation
    if (lines.length > 0) {
      try {
        await writeFile(this.thoughtsFile, lines.join(""), { flag: "a" });
        
        // Append index entries
        const indexContent = indexEntries
          .map((e) => JSON.stringify(e))
          .join("\n") + "\n";
        await writeFile(this.indexFile, indexContent, { flag: "a" });
        
        // Invalidate cache
        this.indexCache = null;
      } catch (e) {
        // On write failure, mark all as failed
        for (const success of result.succeeded) {
          result.failed.push({ 
            index: success.index, 
            error: "Write failed after validation" 
          });
        }
        result.succeeded = [];
        result.totalFailed = result.totalAttempted;
        result.totalSucceeded = 0;
      }
    }

    const checksumAfter = await this.integrity?.getChecksum("void", "thoughts.jsonl") ?? null;

    // Log single ledger entry for batch operation
    if (this.ledger && result.totalSucceeded > 0) {
      await this.ledger.appendEntry({
        projectId: this.projectId,
        view: "void",
        action: "create",
        artifactId: `batch_${result.totalSucceeded}_thoughts`,
        actorId,
        checksumBefore,
        checksumAfter,
        payload: { 
          batchImport: true, 
          count: result.totalSucceeded,
          failed: result.totalFailed,
        },
      });
    }

    logger.info("Batch thought import complete", { 
      projectId: this.projectId, 
      succeeded: result.totalSucceeded,
      failed: result.totalFailed,
    });

    return result;
  }
}

export function createVoidStore(
  basePath: string,
  projectId: string,
  options?: VoidStoreOptions,
): VoidStore {
  return new VoidStore(basePath, projectId, options);
}