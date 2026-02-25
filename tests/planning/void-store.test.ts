import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createVoidStore, VoidStore } from "../../runtime/planning/VoidStore";
import type { VoidThought } from "@mythologiq/qore-contracts";

describe("VoidStore", () => {
  let basePath: string;
  const projectId = "test-project";

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "void-store-test-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  describe("addThought", () => {
    it("adds a thought to thoughts.jsonl", async () => {
      const store = createVoidStore(basePath, projectId);
      const thought: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "Test thought content",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: ["test"],
        status: "raw",
      };

      const result = await store.addThought(thought);

      expect(result.thoughtId).toBe("thought-1");
      expect(result.content).toBe("Test thought content");
    });

    it("appends multiple thoughts without overwriting", async () => {
      const store = createVoidStore(basePath, projectId);

      const thought1: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "First thought",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      const thought2: VoidThought = {
        thoughtId: "thought-2",
        projectId,
        content: "Second thought",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      await store.addThought(thought1);
      await store.addThought(thought2);

      const allThoughts = await store.getAllThoughts();
      expect(allThoughts).toHaveLength(2);
    });
  });

  describe("getThought", () => {
    it("returns thought by id", async () => {
      const store = createVoidStore(basePath, projectId);
      const thought: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "Test thought",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      await store.addThought(thought);
      const result = await store.getThought("thought-1");

      expect(result).not.toBeNull();
      expect(result?.content).toBe("Test thought");
    });

    it("returns null for non-existent thought", async () => {
      const store = createVoidStore(basePath, projectId);

      const result = await store.getThought("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("getAllThoughts", () => {
    it("returns empty array when file doesn't exist", async () => {
      const store = createVoidStore(basePath, projectId);

      const result = await store.getAllThoughts();

      expect(result).toEqual([]);
    });

    it("returns all thoughts", async () => {
      const store = createVoidStore(basePath, projectId);

      const thought1: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "First",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      const thought2: VoidThought = {
        thoughtId: "thought-2",
        projectId,
        content: "Second",
        source: "voice",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      await store.addThought(thought1);
      await store.addThought(thought2);

      const result = await store.getAllThoughts();
      expect(result).toHaveLength(2);
    });
  });

  describe("getUnclaimedThoughts", () => {
    it("returns only raw status thoughts", async () => {
      const store = createVoidStore(basePath, projectId);

      const thought1: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "Raw thought",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      const thought2: VoidThought = {
        thoughtId: "thought-2",
        projectId,
        content: "Claimed thought",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "claimed",
      };

      await store.addThought(thought1);
      await store.addThought(thought2);

      const result = await store.getUnclaimedThoughts();
      expect(result).toHaveLength(1);
      expect(result[0].thoughtId).toBe("thought-1");
    });
  });

  describe("updateThoughtStatus", () => {
    it("updates thought status from raw to claimed", async () => {
      const store = createVoidStore(basePath, projectId);
      const thought: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "Test thought",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: [],
        status: "raw",
      };

      await store.addThought(thought);
      const result = await store.updateThoughtStatus("thought-1", "claimed");

      expect(result?.status).toBe("claimed");
    });

    it("returns null for non-existent thought", async () => {
      const store = createVoidStore(basePath, projectId);

      const result = await store.updateThoughtStatus("non-existent", "claimed");

      expect(result).toBeNull();
    });
  });

  describe("getThoughtsByTags", () => {
    it("returns thoughts matching any of the provided tags", async () => {
      const store = createVoidStore(basePath, projectId);

      const thought1: VoidThought = {
        thoughtId: "thought-1",
        projectId,
        content: "Thought with tag1",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: ["tag1", "tag2"],
        status: "raw",
      };

      const thought2: VoidThought = {
        thoughtId: "thought-2",
        projectId,
        content: "Thought with tag3",
        source: "text",
        capturedAt: new Date().toISOString(),
        capturedBy: "test-actor",
        tags: ["tag3"],
        status: "raw",
      };

      await store.addThought(thought1);
      await store.addThought(thought2);

      const result = await store.getThoughtsByTags(["tag1", "tag3"]);
      expect(result).toHaveLength(2);
    });
  });

  // ==========================================
  // PHASE 15: PAGINATION & INDEXING TESTS
  // ==========================================

  describe("getThoughts (pagination)", () => {
    it("returns paginated thoughts with default limit of 50", async () => {
      const store = createVoidStore(basePath, projectId);

      // Add 60 thoughts
      for (let i = 0; i < 60; i++) {
        await store.addThought({
          thoughtId: `thought-${i}`,
          projectId,
          content: `Thought ${i}`,
          source: "text",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: [],
          status: "raw",
        });
      }

      const result = await store.getThoughts();

      expect(result.thoughts).toHaveLength(50);
      expect(result.total).toBe(60);
      expect(result.offset).toBe(0);
      expect(result.limit).toBe(50);
      expect(result.hasMore).toBe(true);
    });

    it("respects offset and limit parameters", async () => {
      const store = createVoidStore(basePath, projectId);

      for (let i = 0; i < 30; i++) {
        await store.addThought({
          thoughtId: `thought-${i}`,
          projectId,
          content: `Thought ${i}`,
          source: "text",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: [],
          status: "raw",
        });
      }

      const result = await store.getThoughts({ offset: 10, limit: 10 });

      expect(result.thoughts).toHaveLength(10);
      expect(result.total).toBe(30);
      expect(result.offset).toBe(10);
      expect(result.limit).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it("returns hasMore=false when at end of list", async () => {
      const store = createVoidStore(basePath, projectId);

      for (let i = 0; i < 20; i++) {
        await store.addThought({
          thoughtId: `thought-${i}`,
          projectId,
          content: `Thought ${i}`,
          source: "text",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: [],
          status: "raw",
        });
      }

      const result = await store.getThoughts({ offset: 15, limit: 10 });

      expect(result.thoughts).toHaveLength(5);
      expect(result.hasMore).toBe(false);
    });

    it("returns empty array for offset beyond total", async () => {
      const store = createVoidStore(basePath, projectId);

      for (let i = 0; i < 10; i++) {
        await store.addThought({
          thoughtId: `thought-${i}`,
          projectId,
          content: `Thought ${i}`,
          source: "text",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: [],
          status: "raw",
        });
      }

      const result = await store.getThoughts({ offset: 100, limit: 10 });

      expect(result.thoughts).toHaveLength(0);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(false);
    });

    it("filters by status", async () => {
      const store = createVoidStore(basePath, projectId);

      for (let i = 0; i < 20; i++) {
        await store.addThought({
          thoughtId: `thought-${i}`,
          projectId,
          content: `Thought ${i}`,
          source: "text",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: [],
          status: i < 5 ? "claimed" : "raw",
        });
      }

      const result = await store.getThoughts({ filter: { status: "claimed" } });

      expect(result.thoughts).toHaveLength(5);
      expect(result.total).toBe(5);
    });

    it("filters by tags", async () => {
      const store = createVoidStore(basePath, projectId);

      for (let i = 0; i < 15; i++) {
        await store.addThought({
          thoughtId: `thought-${i}`,
          projectId,
          content: `Thought ${i}`,
          source: "text",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: i % 3 === 0 ? ["important"] : ["normal"],
          status: "raw",
        });
      }

      const result = await store.getThoughts({ filter: { tags: ["important"] } });

      expect(result.thoughts).toHaveLength(5); // 0, 3, 6, 9, 12
      expect(result.total).toBe(5);
    });

    it("filters by source", async () => {
      const store = createVoidStore(basePath, projectId);

      for (let i = 0; i < 20; i++) {
        await store.addThought({
          thoughtId: `thought-${i}`,
          projectId,
          content: `Thought ${i}`,
          source: i % 2 === 0 ? "text" : "voice",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: [],
          status: "raw",
        });
      }

      const result = await store.getThoughts({ filter: { source: "voice" } });

      expect(result.thoughts).toHaveLength(10);
      expect(result.total).toBe(10);
    });

    it("combines multiple filters", async () => {
      const store = createVoidStore(basePath, projectId);

      for (let i = 0; i < 30; i++) {
        await store.addThought({
          thoughtId: `thought-${i}`,
          projectId,
          content: `Thought ${i}`,
          source: i < 15 ? "text" : "voice",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: i % 2 === 0 ? ["important"] : ["normal"],
          status: i < 10 ? "claimed" : "raw",
        });
      }

      const result = await store.getThoughts({
        filter: { status: "raw", source: "text" },
        limit: 5,
      });

      // Raw + text: thoughts 10-14 (5 thoughts)
      expect(result.thoughts).toHaveLength(5);
      expect(result.total).toBe(5);
    });
  });

  describe("buildIndex", () => {
    it("creates an index file mapping thoughtIds to byte offsets", async () => {
      const store = createVoidStore(basePath, projectId);

      for (let i = 0; i < 10; i++) {
        await store.addThought({
          thoughtId: `thought-${i}`,
          projectId,
          content: `Thought ${i}`,
          source: "text",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: [],
          status: "raw",
        });
      }

      const count = await store.buildIndex();

      expect(count).toBe(10);

      // Verify index file exists
      const indexPath = join(basePath, projectId, "void", "index.json");
      await expect(access(indexPath)).resolves.not.toThrow();
    });

    it("rebuilds index correctly after manual deletion", async () => {
      const store = createVoidStore(basePath, projectId);

      for (let i = 0; i < 5; i++) {
        await store.addThought({
          thoughtId: `thought-${i}`,
          projectId,
          content: `Thought ${i}`,
          source: "text",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: [],
          status: "raw",
        });
      }

      // Delete the index file
      await rm(join(basePath, projectId, "void", "index.json"));

      // Rebuild
      const count = await store.buildIndex();
      expect(count).toBe(5);

      // Verify we can still lookup thoughts
      const thought = await store.getThought("thought-3");
      expect(thought).not.toBeNull();
      expect(thought?.content).toBe("Thought 3");
    });

    it("returns 0 for empty store", async () => {
      const store = createVoidStore(basePath, projectId);

      const count = await store.buildIndex();

      expect(count).toBe(0);
    });
  });

  describe("getThought with index", () => {
    it("uses index for O(1) lookup", async () => {
      const store = createVoidStore(basePath, projectId);

      // Add many thoughts
      for (let i = 0; i < 100; i++) {
        await store.addThought({
          thoughtId: `thought-${i}`,
          projectId,
          content: `Thought content ${i}`,
          source: "text",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: [],
          status: "raw",
        });
      }

      // Lookup a specific thought - should use index
      const thought = await store.getThought("thought-50");

      expect(thought).not.toBeNull();
      expect(thought?.content).toBe("Thought content 50");
    });

    it("falls back to linear search if index is missing", async () => {
      const store = createVoidStore(basePath, projectId);

      for (let i = 0; i < 10; i++) {
        await store.addThought({
          thoughtId: `thought-${i}`,
          projectId,
          content: `Thought ${i}`,
          source: "text",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: [],
          status: "raw",
        });
      }

      // Delete index to force fallback
      await rm(join(basePath, projectId, "void", "index.json"));

      const thought = await store.getThought("thought-5");
      expect(thought).not.toBeNull();
      expect(thought?.content).toBe("Thought 5");
    });
  });

  describe("getThoughtCount", () => {
    it("returns total count from index", async () => {
      const store = createVoidStore(basePath, projectId);

      for (let i = 0; i < 75; i++) {
        await store.addThought({
          thoughtId: `thought-${i}`,
          projectId,
          content: `Thought ${i}`,
          source: "text",
          capturedAt: new Date().toISOString(),
          capturedBy: "test-actor",
          tags: [],
          status: "raw",
        });
      }

      const count = await store.getThoughtCount();

      expect(count).toBe(75);
    });

    it("returns 0 for empty store", async () => {
      const store = createVoidStore(basePath, projectId);

      const count = await store.getThoughtCount();

      expect(count).toBe(0);
    });
  });
});
