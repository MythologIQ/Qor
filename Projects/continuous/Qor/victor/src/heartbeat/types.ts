export type HeartbeatBranch =
  | "observed"
  | "claimed"
  | "executed"
  | "blocked"
  | "failed"
  | "quarantined"
  | "persisted";

export type HeartbeatRecordStatus =
  | "completed"
  | "blocked"
  | "failed"
  | "quarantined"
  | "no-op";

export interface HeartbeatEvidenceRef {
  kind:
    | "service-check"
    | "space-error-check"
    | "project-scan"
    | "task-writeback"
    | "memory-write";
  target: string;
  status: "success" | "failure" | "missing";
  artifact: string | null;
}

export interface HeartbeatRecord {
  tickId: string;
  sessionId: string;
  startedAt: string;
  finishedAt: string | null;
  status: HeartbeatRecordStatus;
  branchHistory: HeartbeatBranch[];
  claimedTaskId: string | null;
  summary: string;
  evidence: HeartbeatEvidenceRef[];
}
