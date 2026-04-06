/**
 * Phase Auto-Completion — promotes phases when all tasks are done.
 * Called by /api/forge/update-task after every status change.
 */

export interface PhaseTransition {
  completedPhaseId: string;
  completedPhaseName: string;
  promotedPhaseId: string | null;
  promotedPhaseName: string | null;
  timestamp: string;
}

interface TaskLike {
  status: string;
}

interface PhaseLike {
  phaseId: string;
  name: string;
  ordinal: number;
  status: string;
  tasks: TaskLike[];
  updatedAt?: string;
}

export function checkPhaseCompletion(
  phases: PhaseLike[],
  phaseId: string
): PhaseTransition | null {
  const phase = phases.find((p) => p.phaseId === phaseId);
  if (!phase) return null;
  if (phase.tasks.length === 0) return null;

  const allDone = phase.tasks.every(
    (t) => t.status === "done" || t.status === "complete"
  );
  if (!allDone) return null;

  phase.status = "complete";
  phase.updatedAt = new Date().toISOString();

  const promoted = promoteNextPhase(phases, phase.ordinal);

  return {
    completedPhaseId: phase.phaseId,
    completedPhaseName: phase.name,
    promotedPhaseId: promoted?.phaseId ?? null,
    promotedPhaseName: promoted?.name ?? null,
    timestamp: phase.updatedAt,
  };
}

function promoteNextPhase(
  phases: PhaseLike[],
  completedOrdinal: number
): PhaseLike | null {
  const sorted = [...phases].sort((a, b) => a.ordinal - b.ordinal);
  const next = sorted.find(
    (p) => p.ordinal > completedOrdinal && p.status === "planned"
  );
  if (!next) return null;

  next.status = "active";
  next.updatedAt = new Date().toISOString();
  return next;
}

export function buildPhaseCompletionLedgerEntry(
  transition: PhaseTransition,
  projectId: string
) {
  return {
    projectId,
    view: "path",
    action: "complete-phase",
    artifactId: transition.completedPhaseId,
    actorId: "forge:auto",
    payload: {
      completedPhase: transition.completedPhaseName,
      promotedPhase: transition.promotedPhaseName,
    },
    entryId: `led_${Date.now()}_auto`,
    timestamp: transition.timestamp,
  };
}
