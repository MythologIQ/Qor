/**
 * Victor Forge Integration
 * 
 * Deep integration between Victor's autonomy and the QoreLogic S.H.I.E.L.D. lifecycle.
 * S.H.I.E.L.D.: Secure Intent → Hypothesize → Interrogate → Execute → Lock Proof → Deliver
 * 
 * Every implementation MUST be followed by qor-debug diagnostic sweep.
 */

import { forgeDispatcher, ForgeTask, SKILL_REGISTRY } from "./task-dispatcher.js";
import { victorPersona, PersonaMode } from "./persona-adapter.js";
import type { SLDPhase } from "./task-dispatcher.js";

export interface BuildingSlice {
  id: string;
  phase: SLDPhase;  // S.H.I.E.L.D. phase
  taskType: ForgeTask["type"];
  description: string;
  targetTier: number;
  priority: "P0" | "P1" | "P2" | "P3";
}

export interface ForgeState {
  activeSlices: BuildingSlice[];
  completedSlices: BuildingSlice[];
  currentPersona: PersonaMode;
  pendingSkills: string[];
}

export class VictorForge {
  private state: ForgeState = {
    activeSlices: [],
    completedSlices: [],
    currentPersona: "victor",
    pendingSkills: []
  };

  /**
   * Process Victor's building queue through Forge
   */
  async processQueue(): Promise<ForgeState> {
    console.log("[VICTOR-FORGE] Processing building queue...");
    
    // Get tasks from Victor's queue
    const tasks = this.gatherBuildingTasks();
    
    for (const slice of tasks) {
      // Select appropriate skill and persona
      const mapping = SKILL_REGISTRY[slice.taskType];
      const persona = this.mapTaskToPersona(slice.taskType);
      
      // Adopt persona
      victorPersona.adopt(persona);
      this.state.currentPersona = persona;
      
      console.log(`[VICTOR-FORGE] Slice ${slice.id}: ${slice.taskType} → ${mapping.skill} → ${persona}`);
      
      // Dispatch to Forge
      const task = forgeDispatcher.dispatch({
        type: slice.taskType,
        description: slice.description,
        priority: slice.priority,
        phase: slice.phase
      });
      
      this.state.activeSlices.push(slice);
      
      // Execute workflow steps
      await this.executeWorkflow(task.id, mapping.workflow, slice);
      
      // Mark complete
      forgeDispatcher.complete(task.id);
      this.state.completedSlices.push(slice);
      
      // Restore Victor's default persona
      victorPersona.restore();
      this.state.currentPersona = "victor";
    }
    
    return this.state;
  }

  /**
   * Map task type to appropriate persona
   */
  private mapTaskToPersona(taskType: ForgeTask["type"]): PersonaMode {
    const mapping: Record<ForgeTask["type"], PersonaMode> = {
      diagnostic: "qor-fixer",
      planning: "qor-governor",
      implementation: "qor-specialist",
      audit: "qor-judge",
      documentation: "qor-technical-writer",
      "ux-review": "qor-ux-evaluator",
      research: "victor",  // Victor uses built-in research capability
      substantiate: "qor-judge",
      release: "qor-governor",
      bootstrap: "qor-governor"
    };
    return mapping[taskType];
  }

  /**
   * Execute workflow steps for a task
   */
  private async executeWorkflow(
    taskId: string, 
    workflow: string[], 
    slice: BuildingSlice
  ): Promise<void> {
    console.log(`[VICTOR-FORGE] Executing workflow for ${taskId}`);
    
    for (const step of workflow) {
      console.log(`[VICTOR-FORGE]  → ${step}`);
      
      // Transition phase based on workflow step
      const phase = this.inferPhaseFromStep(step);
      if (phase) {
        forgeDispatcher.transitionPhase(taskId, phase);
      }
      
      // Execute step (simulated - would call actual skill in production)
      await this.executeStep(step, slice);
    }
  }

  /**
   * Infer A.E.G.I.S. phase from workflow step
   */
  private inferPhaseFromStep(step: string): ForgeTask["phase"] | null {
    if (step.includes("Align") || step.includes("Concept")) return "ALIGN";
    if (step.includes("Encode") || step.includes("Architecture")) return "ENCODE";
    if (step.includes("Implement") || step.includes("Build")) return "IMPLEMENT";
    if (step.includes("Verify") || step.includes("Validate")) return "SUBSTANTIATE";
    if (step.includes("Gate") || step.includes("Audit")) return "GATE";
    return null;
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(step: string, slice: BuildingSlice): Promise<void> {
    // In production, this would invoke the actual skill
    // For now, we log the step execution
    const persona = victorPersona.current();
    console.log(`[VICTOR-FORGE]    [${persona.mode}] Executing: ${step}`);
    
    // Simulate work duration based on priority
    const duration = { P0: 100, P1: 200, P2: 300, P3: 400 }[slice.priority];
    await new Promise(r => setTimeout(r, duration));
  }

  /**
   * Gather building tasks from Victor's queue
   */
  private gatherBuildingTasks(): BuildingSlice[] {
    // In production, this would read from Victor's actual queue
    // For integration testing, return sample tasks
    return [
      {
        id: "slice_memory_governance",
        phase: "ALIGN",
        taskType: "planning",
        description: "Design thermodynamic decay governance primitives",
        targetTier: 3,
        priority: "P0"
      },
      {
        id: "slice_debug_ui",
        phase: "IMPLEMENT",
        taskType: "diagnostic",
        description: "Trace Victor Shell UI rendering failures",
        targetTier: 2,
        priority: "P1"
      },
      {
        id: "slice_audit_queue",
        phase: "GATE",
        taskType: "audit",
        description: "Verify task queue integrity and security boundaries",
        targetTier: 3,
        priority: "P0"
      }
    ];
  }

  /**
   * Get current Forge state
   */
  getState(): ForgeState {
    return { 
      ...this.state,
      currentPersona: victorPersona.current().mode  // Always sync with persona adapter
    };
  }

  /**
   * Get persona preamble for current context
   */
  getPersonaPreamble(): string {
    return victorPersona.formatPreamble();
  }

  /**
   * Manually dispatch a task (for testing/direct invocation)
   */
  manualDispatch(slice: Omit<BuildingSlice, "id">): ForgeTask {
    const task = forgeDispatcher.dispatch({
      type: slice.taskType,
      description: slice.description,
      priority: slice.priority,
      phase: slice.phase
    });
    
    // Adopt appropriate persona
    const persona = this.mapTaskToPersona(slice.taskType);
    victorPersona.adopt(persona);
    this.state.currentPersona = persona;
    
    console.log(`[VICTOR-FORGE] Manual dispatch: ${task.id}`);
    console.log(this.getPersonaPreamble());
    
    return task;
  }
}

// Singleton instance
export const victorForge = new VictorForge();

// Export convenience functions
export const dispatchTask = (slice: Omit<BuildingSlice, "id">): ForgeTask => 
  victorForge.manualDispatch(slice);
export const getForgeState = () => victorForge.getState();
export const processQueue = () => victorForge.processQueue();

// Re-export types and functions for test access
export { forgeDispatcher, SKILL_REGISTRY };
export { victorPersona };
export type { PersonaMode } from "./persona-adapter.js";
export type { ForgeTask, TaskType, SkillMapping } from "./task-dispatcher.js";
