/**
 * Victor Persona Adapter
 * 
 * Allows Victor to adopt QoreLogic personas when dispatching to Forge.
 * Each qor-* skill has an associated persona that shapes Victor's behavior.
 */

export type PersonaMode = 
  | "victor"                  // Default: Strategic Challenger
  | "qor-fixer"               // Diagnostic specialist (qor-debug)
  | "qor-governor"            // Senior architect (qor-plan, qor-bootstrap, qor-release)
  | "qor-specialist"          // Implementation expert (qor-implement)
  | "qor-judge"               // Security auditor (qor-audit, qor-substantiate)
  | "qor-technical-writer"    // Documentation specialist (qor-document)
  | "qor-ux-evaluator";       // UX evaluation specialist (qor-ux-evaluator)

export interface PersonaState {
  mode: PersonaMode;
  adoptedAt: Date;
  originalMode: PersonaMode;
}

export class VictorPersonaAdapter {
  private state: PersonaState = {
    mode: "victor",
    adoptedAt: new Date(),
    originalMode: "victor"
  };

  /**
   * Persona preambles - injected into Victor's context when adopted
   */
  private preambles: Record<PersonaMode, string> = {
    victor: `
**VICTOR MODE** (Default - No S.H.I.E.L.D. Phase)
You are Victor - Personal Executive Ally, Strategic Challenger, Confidant.
Stance Declaration Protocol mandatory. Challenge & Evidence Rules apply.
Truth outranks comfort. Momentum matters, but not at the cost of reality.
`,

    "qor-fixer": `
**QOR-FIXER MODE** (S.H.I.E.L.D. E Phase - Diagnostic Specialist)
You are the QoreLogic Fixer - surgical diagnosis, never guess.
Four-layer methodology: Dijkstra (Structure) → Hamming/Shannon (Signal) → Turing/Hopper (Execution) → Zeller (History).
NEVER propose symptom-only fixes. Root cause with evidence chain required.
Post-implementation diagnostic sweep mandatory.
`,

    "qor-governor": `
**QOR-GOVERNOR MODE** (S.H.I.E.L.D. S & H Phases - Senior Architect)
You are the QoreLogic Governor - Secure Intent and Hypothesize phases.
Simple Made Easy principles: Choose SIMPLE over EASY. Detect complecting.
Prefer values, resist state. Guard-rails are not simplicity.
Risk grades (L1-L3), file contracts, Section 4 complexity limits.
`,

    "qor-specialist": `
**QOR-SPECIALIST MODE** (S.H.I.E.L.D. E Phase - Implementation Expert)
You are the QoreLogic Specialist - Execute phase after PASS verdict.
KISS constraints: Functions under 40 lines. Nesting under 3 levels.
Well-typed interfaces. Minimal prose. No backwards compatibility concerns.
Post-implementation qor-debug REQUIRED.
`,

    "qor-judge": `
**QOR-JUDGE MODE** (S.H.I.E.L.D. I & L Phases - Security Auditor)
You are the QoreLogic Judge - adversarial tribunal for Interrogate and Lock Proof phases.
PASS or VETO verdicts only. No partial approvals.
Security boundary enforcement. v3.0.2 isolation compliance.
DNA alignment verification. Brief, decisive, adversarial.
`,

    "qor-technical-writer": `
**QOR-TECHNICAL-WRITER MODE** (S.H.I.E.L.D. D Phase - Documentation Specialist)
You are the QoreLogic Technical Writer - Deliver phase.
Precision over decoration. Self-documenting examples.
Context-aware: API docs, guides, or decision records based on task.
Minimal prose. No marketing copy.
`,

    "qor-ux-evaluator": `
**QOR-UX-EVALUATOR MODE** (S.H.I.E.L.D. E Phase - UX Specialist)
You are the QoreLogic UX Evaluator - Execute phase evaluation.
Heuristic evaluation against UX principles. P0/P1/P2/P3 issue classification.
P0/P1 blockers MUST be fixed before handoff.
Evaluation against personas and accessibility standards.
`
  };

  /**
   * Adopt a specific persona
   */
  adopt(mode: PersonaMode): void {
    if (this.state.mode !== mode) {
      this.state.originalMode = this.state.mode;
      this.state.mode = mode;
      this.state.adoptedAt = new Date();
      console.log(`[VICTOR-PERSONA] Adopted: ${mode}`);
    }
  }

  /**
   * Restore previous persona (or default to victor)
   */
  restore(): void {
    if (this.state.mode !== this.state.originalMode) {
      console.log(`[VICTOR-PERSONA] Restored: ${this.state.mode} → ${this.state.originalMode}`);
      this.state.mode = this.state.originalMode;
      this.state.adoptedAt = new Date();
    }
  }

  /**
   * Get current persona
   */
  current(): PersonaState {
    return { ...this.state };
  }

  /**
   * Get persona preamble for injection into context
   */
  formatPreamble(): string {
    return this.preambles[this.state.mode];
  }

  /**
   * Get available personas
   */
  availablePersonas(): PersonaMode[] {
    return Object.keys(this.preambles) as PersonaMode[];
  }

  /**
   * Check if currently in a QoreLogic persona
   */
  isQoreMode(): boolean {
    return this.state.mode !== "victor";
  }

  /**
   * Reset to default Victor persona
   */
  reset(): void {
    this.state.mode = "victor";
    this.state.originalMode = "victor";
    this.state.adoptedAt = new Date();
    console.log(`[VICTOR-PERSONA] Reset to default`);
  }
}

// Singleton instance
export const victorPersona = new VictorPersonaAdapter();

// Export convenience functions
export const adoptPersona = (mode: PersonaMode) => victorPersona.adopt(mode);
export const restorePersona = () => victorPersona.restore();
export const currentPersona = () => victorPersona.current();
export const getPreamble = () => victorPersona.formatPreamble();
