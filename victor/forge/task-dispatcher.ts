/**
 * Victor Forge Task Dispatcher
 * 
 * Maps task types to qor-* skills with S.H.I.E.L.D. lifecycle phases.
 * Every implementation workflow MUST end with qor-debug diagnostic sweep.
 */

export type TaskType = 
  | "diagnostic"      // qor-debug (also runs post-implementation)
  | "planning"        // qor-plan, qor-organize
  | "audit"           // qor-audit, qor-validate, qor-repo-audit
  | "implementation"  // qor-implement (main), qor-course-correct, qor-refactor
  | "documentation"   // qor-document, qor-help
  | "ux-review"       // qor-ux-evaluator
  | "research"        // qor-research
  | "bootstrap"       // qor-bootstrap, qor-repo-scaffold
  | "substantiate"    // qor-substantiate, qor-status
  | "release";        // qor-release, qor-repo-release

export type SLDPhase = 
  | "S"   // Secure Intent (bootstrap, document why, init merkle)
  | "H"   // Hypothesize (plan, organize, set limits)
  | "I"   // Interrogate (audit, validate, judge tribunal)
  | "E"   // Execute (implement <40 lines, <3 nesting, then debug)
  | "L"   // Lock Proof (substantiate, merkle seal)
  | "D";  // Deliver (release, handoff, monitor)

export interface SkillMapping {
  skill: string;           // Primary skill (e.g., "qor-plan")
  phase: SLDPhase;         // S.H.I.E.L.D. phase
  workflow: string[];      // Workflow steps (last step of E phase MUST be "qor-debug")
  persona: string;         // Associated persona
  constraints?: string[];  // KISS constraints for implementation
}

export interface ForgeTask {
  id: string;
  type: TaskType;
  description: string;
  priority: "P0" | "P1" | "P2" | "P3";
  phase: SLDPhase;
  status: "pending" | "active" | "complete" | "failed";
  createdAt: Date;
  completedAt?: Date;
}

/**
 * SKILL_REGISTRY: Maps task types to S.H.I.E.L.D. skills
 * 
 * S - Secure Intent: qor-bootstrap, qor-repo-scaffold, qor-document
 * H - Hypothesize: qor-plan, qor-organize, qor-refactor
 * I - Interrogate: qor-audit, qor-validate, qor-repo-audit
 * E - Execute: qor-implement, qor-course-correct (MUST end with qor-debug)
 * L - Lock Proof: qor-substantiate, qor-status
 * D - Deliver: qor-release, qor-repo-release, qor-help
 */
export const SKILL_REGISTRY: Record<TaskType, SkillMapping> = {
  // S - Secure Intent
  bootstrap: {
    skill: "qor-bootstrap",
    phase: "S",
    workflow: ["Document-Why", "Encode-Architecture", "Init-Merkle", "qor-bootstrap"],
    persona: "qor-governor",
    constraints: ["Merkle root committed", "Architecture encoded"]
  },
  
  // H - Hypothesize
  planning: {
    skill: "qor-plan",
    phase: "H", 
    workflow: ["Risk-Assessment", "File-Contracts", "Section-4-Limits", "qor-plan"],
    persona: "qor-governor",
    constraints: ["Functions <40 lines", "Nesting <3 levels", "Files <400 lines"]
  },
  
  // I - Interrogate
  audit: {
    skill: "qor-audit",
    phase: "I",
    workflow: ["Security-Review", "Correctness-Check", "Drift-Detection", "qor-audit"],
    persona: "qor-judge",
    constraints: ["PASS or VETO verdict required"]
  },
  
  // E - Execute (CRITICAL: Must end with qor-debug)
  implementation: {
    skill: "qor-implement",
    phase: "E",
    workflow: ["Build-KISS", "Function-Lint", "Nesting-Check", "qor-implement", "qor-debug"],
    persona: "qor-specialist",
    constraints: ["Functions <40 lines", "Nesting <3 levels", "Post-impl qor-debug REQUIRED"]
  },
  
  // E - Execute variant with course correction
  "ux-review": {
    skill: "qor-ux-evaluator",
    phase: "E",
    workflow: ["UX-Review", "Heuristic-Check", "qor-implement-fixes", "qor-debug"],
    persona: "qor-ux-evaluator",
    constraints: ["P0/P1 UX blockers fixed", "qor-debug post-fix REQUIRED"]
  },
  
  // H - Hypothesize (research is planning, not implementation)
  research: {
    skill: "qor-research",
    phase: "H",  // Research happens during Hypothesize phase
    workflow: ["Gather-Sources", "Synthesize-Context", "qor-research"],
    persona: "victor",  // Victor uses Scout persona
    constraints: ["Context documented for implementation"]
  },
  
  // L - Lock Proof
  substantiate: {
    skill: "qor-substantiate",
    phase: "L",
    workflow: ["Verify-Reality", "Compare-Promise", "Merkle-Seal", "qor-substantiate"],
    persona: "qor-judge",
    constraints: ["Cryptographic hash verified", "Reality matches Promise"]
  },
  
  // D - Deliver
  release: {
    skill: "qor-release",
    phase: "D",
    workflow: ["Deploy", "Handoff-Traceability", "Drift-Monitor", "qor-release"],
    persona: "qor-governor",
    constraints: ["Traceability ledger updated", "Monitoring active"]
  },
  
  // Also D phase for documentation
  documentation: {
    skill: "qor-document",
    phase: "D",
    workflow: ["Document-API", "Write-Guides", "qor-document"],
    persona: "qor-technical-writer",
    constraints: ["Documentation complete for handoff"]
  },
  
  // Diagnostic runs in E phase (post-implementation) or standalone
  diagnostic: {
    skill: "qor-debug",
    phase: "E",  // Debug is part of execution phase
    workflow: ["Four-Layer-Analysis", "Root-Cause", "Residual-Sweep", "qor-debug"],
    persona: "qor-fixer",
    constraints: ["Post-implementation REQUIRED", "All layers complete"]
  }
};

export class ForgeDispatcher {
  private tasks: Map<string, ForgeTask> = new Map();
  private taskIdCounter = 0;

  /**
   * Dispatch a new task to Forge
   */
  dispatch(params: Omit<ForgeTask, "id" | "status" | "createdAt">): ForgeTask {
    const id = `forge_${Date.now()}_${++this.taskIdCounter}`;
    const task: ForgeTask = {
      id,
      ...params,
      status: "pending",
      createdAt: new Date()
    };
    this.tasks.set(id, task);
    console.log(`[FORGE] Dispatched ${id}: ${params.type} (S.H.I.E.L.D. ${params.phase})`);
    return task;
  }

  /**
   * Mark task as active
   */
  activate(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "active";
      console.log(`[FORGE] ${taskId} → active`);
    }
  }

  /**
   * Mark task as complete
   */
  complete(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "complete";
      task.completedAt = new Date();
      console.log(`[FORGE] ${taskId} → complete`);
    }
  }

  /**
   * Mark task as failed
   */
  fail(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "failed";
      console.log(`[FORGE] ${taskId} → failed`);
    }
  }

  /**
   * Transition task to different S.H.I.E.L.D. phase
   */
  transitionPhase(taskId: string, phase: SLDPhase): void {
    const task = this.tasks.get(taskId);
    if (task) {
      const oldPhase = task.phase;
      task.phase = phase;
      console.log(`[FORGE] ${taskId}: ${oldPhase} → ${phase}`);
    }
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): ForgeTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): ForgeTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks by S.H.I.E.L.D. phase
   */
  getTasksByPhase(phase: SLDPhase): ForgeTask[] {
    return this.getAllTasks().filter(t => t.phase === phase);
  }

  /**
   * Check if implementation workflow includes qor-debug
   * (Validation that post-implementation diagnostic is present)
   */
  validateDebugPresent(taskType: TaskType): boolean {
    const mapping = SKILL_REGISTRY[taskType];
    if (mapping.phase === "E") {
      const hasDebug = mapping.workflow.includes("qor-debug");
      if (!hasDebug) {
        console.error(`[FORGE] VIOLATION: ${taskType} (phase E) missing required qor-debug`);
      }
      return hasDebug;
    }
    return true; // Non-execution phases don't require debug
  }
}

// Singleton instance
export const forgeDispatcher = new ForgeDispatcher();

// Export convenience functions
export const dispatchTask = (params: Omit<ForgeTask, "id" | "status" | "createdAt">) => 
  forgeDispatcher.dispatch(params);
export const validateDebugRequired = (taskType: TaskType) => 
  forgeDispatcher.validateDebugPresent(taskType);
