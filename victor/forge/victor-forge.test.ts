/**
 * Victor Forge Integration Tests
 * 
 * Every function in the Forge system has corresponding tests.
 * Run: bun test Victor/forge/victor-forge.test.ts
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { 
  victorForge, 
  forgeDispatcher, 
  SKILL_REGISTRY,
  dispatchTask,
  getForgeState,
  victorPersona
} from "./victor-forge.js";
import type { ForgeTask, SLDPhase, TaskType } from "./task-dispatcher.js";
import type { PersonaMode } from "./persona-adapter.js";

describe("Victor Forge Integration", () => {
  
  beforeEach(() => {
    // Reset persona to default
    victorPersona.reset();
  });

  describe("Skill Registry (S.H.I.E.L.D. Mapping)", () => {
    it("should map all task types to skills", () => {
      const taskTypes: TaskType[] = [
        "diagnostic", "planning", "implementation", "audit",
        "documentation", "ux-review", "research", "bootstrap", 
        "substantiate", "release"
      ];
      
      for (const type of taskTypes) {
        const mapping = SKILL_REGISTRY[type];
        expect(mapping).toBeDefined();
        expect(mapping.skill).toMatch(/^qor-/);
        expect(mapping.workflow).toBeArray();
        expect(mapping.workflow.length).toBeGreaterThan(0);
      }
    });

    it("should use qor-* personas for most skills, victor for research", () => {
      for (const [type, mapping] of Object.entries(SKILL_REGISTRY)) {
        if (type === "research") {
          // Research uses Victor's built-in Scout capability
          expect(mapping.persona).toBe("victor");
        } else {
          expect(mapping.persona).toMatch(/^qor-/);
        }
      }
    });

    it("should use S.H.I.E.L.D. phases (S, H, I, E, L, D)", () => {
      const phases: SLDPhase[] = ["S", "H", "I", "E", "L", "D"];
      
      for (const [type, mapping] of Object.entries(SKILL_REGISTRY)) {
        expect(phases).toContain(mapping.phase);
      }
    });

    it("should require qor-debug in all E (Execute) phase workflows", () => {
      for (const [type, mapping] of Object.entries(SKILL_REGISTRY)) {
        if (mapping.phase === "E") {
          expect(mapping.workflow).toContain("qor-debug");
        }
      }
    });
  });

  describe("Persona Adapter (qor-* personas)", () => {
    it("should default to victor mode", () => {
      const current = victorPersona.current();
      expect(current.mode).toBe("victor");
    });

    it("should adopt qor-governor for planning (H phase)", () => {
      victorPersona.adopt("qor-governor");
      expect(victorPersona.current().mode).toBe("qor-governor");
      expect(victorPersona.isQoreMode()).toBe(true);
    });

    it("should adopt qor-judge for audit (I phase)", () => {
      victorPersona.adopt("qor-judge");
      expect(victorPersona.current().mode).toBe("qor-judge");
    });

    it("should adopt qor-fixer for diagnostic (E phase)", () => {
      victorPersona.adopt("qor-fixer");
      expect(victorPersona.current().mode).toBe("qor-fixer");
    });

    it("should restore previous persona", () => {
      victorPersona.adopt("qor-governor");
      victorPersona.adopt("qor-specialist");
      
      expect(victorPersona.current().mode).toBe("qor-specialist");
      
      victorPersona.restore();
      
      expect(victorPersona.current().mode).toBe("qor-governor");
    });

    it("should format persona preamble with S.H.I.E.L.D. context", () => {
      victorPersona.adopt("qor-specialist");
      const preamble = victorPersona.formatPreamble();
      
      expect(preamble).toContain("QOR-SPECIALIST MODE");
      expect(preamble).toContain("S.H.I.E.L.D. E Phase");
    });
  });

  describe("Task Dispatcher", () => {
    it("should dispatch task with S.H.I.E.L.D. phase", () => {
      const task = forgeDispatcher.dispatch({
        type: "implementation",
        description: "Test task",
        priority: "P1",
        phase: "E"
      });
      
      expect(task.id).toStartWith("forge_");
      expect(task.phase).toBe("E");
      
      // Clean up
      forgeDispatcher.complete(task.id);
    });

    it("should transition through S.H.I.E.L.D. phases", () => {
      const task = forgeDispatcher.dispatch({
        type: "implementation",
        description: "Lifecycle test",
        priority: "P1",
        phase: "S"
      });
      
      const phases: SLDPhase[] = ["H", "I", "E", "L", "D"];
      
      for (const phase of phases) {
        forgeDispatcher.transitionPhase(task.id, phase);
      }
      
      expect(forgeDispatcher.getTask(task.id)?.phase).toBe("D");
      
      forgeDispatcher.complete(task.id);
    });

    it("should validate qor-debug presence in E phase", () => {
      // Implementation should have qor-debug
      expect(forgeDispatcher.validateDebugPresent("implementation")).toBe(true);
      
      // Planning (H phase) doesn't need qor-debug
      expect(forgeDispatcher.validateDebugPresent("planning")).toBe(true);
    });
  });

  describe("Victor Forge", () => {
    it("should process queue through S.H.I.E.L.D. lifecycle", async () => {
      const state = await victorForge.processQueue();
      
      expect(state).toHaveProperty("activeSlices");
      expect(state).toHaveProperty("completedSlices");
      expect(state.currentPersona).toBe("victor"); // Restored after processing
    });

    it("should map task types to qor-* personas", () => {
      const mappings: Array<[TaskType, PersonaMode]> = [
        ["diagnostic", "qor-fixer"],
        ["planning", "qor-governor"],
        ["implementation", "qor-specialist"],
        ["audit", "qor-judge"],
        ["documentation", "qor-technical-writer"],
        ["ux-review", "qor-ux-evaluator"]
      ];
      
      for (const [taskType, expectedPersona] of mappings) {
        // Reset persona
        victorPersona.reset();
        
        const task = dispatchTask({
          type: taskType,
          description: `Test ${taskType}`,
          priority: "P1",
          phase: "E"
        });
        
        // Persona should be adopted during dispatch
        // We verify via SKILL_REGISTRY mapping
        expect(SKILL_REGISTRY[taskType].persona).toBe(expectedPersona);
        
        // Clean up
        forgeDispatcher.complete(task.id);
        victorPersona.restore();
      }
    });
  });

  describe("S.H.I.E.L.D. Lifecycle Integration", () => {
    it("should execute full S → H → I → E → L → D flow", async () => {
      const phases: SLDPhase[] = ["S", "H", "I", "E", "L", "D"];
      
      for (const phase of phases) {
        const task = forgeDispatcher.dispatch({
          type: phase === "E" ? "implementation" : 
                phase === "S" ? "bootstrap" :
                phase === "H" ? "planning" :
                phase === "I" ? "audit" :
                phase === "L" ? "substantiate" : "release",
          description: `${phase} phase task`,
          priority: "P0",
          phase
        });
        
        expect(task.phase).toBe(phase);
        
        // If E phase, verify qor-debug is present
        if (phase === "E") {
          expect(SKILL_REGISTRY["implementation"].workflow).toContain("qor-debug");
        }
        
        forgeDispatcher.complete(task.id);
      }
    });
  });
});

describe("Victor Forge E2E (S.H.I.E.L.D.)", () => {
  beforeEach(() => {
    victorPersona.reset();
  });

  it("should process diagnostic with post-implementation qor-debug", () => {
    const task = dispatchTask({
      taskType: "implementation",
      description: "Build feature",
      priority: "P0",
      phase: "E",
      targetTier: 2
    });
    
    // Verify qor-debug is in workflow
    const workflow = SKILL_REGISTRY["implementation"].workflow;
    expect(workflow[workflow.length - 1]).toBe("qor-debug");
    
    forgeDispatcher.complete(task.id);
    victorPersona.reset();
    expect(victorPersona.current().mode).toBe("victor");
  });
});
