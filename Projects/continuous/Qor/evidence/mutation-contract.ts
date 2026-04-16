export type MutationDomain = "memory" | "prompt" | "tool" | "policy";
export type MutationTargetKind = "file" | "graph-node" | "policy-rule" | "prompt-template" | "tool-binding";
export type MutationActorKind = "agent" | "operator" | "system";
export type MutationOperationType = "create" | "update" | "reclassify" | "merge" | "deprecate";
export type MutationContractStatus =
  | "proposed"
  | "validated"
  | "sandboxed"
  | "evaluated"
  | "approved"
  | "rejected"
  | "committed";
export type MetricOperator = ">" | ">=" | "<" | "<=" | "==" | "!=";

export interface MutationTarget {
  kind: MutationTargetKind;
  identifier: string;
  version?: string;
}

export interface MutationActor {
  id: string;
  kind: MutationActorKind;
  displayName?: string;
}

export interface MutationScope {
  domain: MutationDomain;
  targetPath: string;
}

export interface MutationOperation {
  type: MutationOperationType;
  payload: Record<string, unknown>;
}

export interface MutationJustification {
  hypothesis: string;
  objective?: string;
}

export interface MutationConstraintSet {
  mustNot?: {
    violatePolicy?: boolean;
    breakSchema?: boolean;
    expandAccessBoundary?: boolean;
  };
}

export interface MutationMetric {
  metric: string;
  operator: MetricOperator;
  threshold: number | string | boolean;
}

export interface MutationValidationPlan {
  objective: string;
  validators: string[];
  metrics: MutationMetric[];
}

export interface MutationLifecycle {
  status: MutationContractStatus;
  proposedAt: string;
  validatedAt?: string;
  sandboxedAt?: string;
  evaluatedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  committedAt?: string;
}

export interface MutationContract {
  mutationId: string;
  actor: MutationActor;
  target: MutationTarget;
  scope: MutationScope;
  operation: MutationOperation;
  justification: MutationJustification;
  constraints?: MutationConstraintSet;
  validation: MutationValidationPlan;
  lifecycle: MutationLifecycle;
  status: MutationContractStatus;
}

export interface MutationContractValidationResult {
  valid: boolean;
  errors: string[];
}

const DOMAIN_PREFIXES: Record<MutationDomain, string[]> = {
  memory: ["continuum://"],
  prompt: ["prompt://"],
  tool: ["tool://", "mcp://"],
  policy: ["policy://", "qor://policy/"],
};

const OPERATORS: MetricOperator[] = [">", ">=", "<", "<=", "==", "!="];
const OPERATION_TYPES: MutationOperationType[] = ["create", "update", "reclassify", "merge", "deprecate"];
const STATUSES: MutationContractStatus[] = ["proposed", "validated", "sandboxed", "evaluated", "approved", "rejected", "committed"];
const TARGET_KINDS: MutationTargetKind[] = ["file", "graph-node", "policy-rule", "prompt-template", "tool-binding"];
const ACTOR_KINDS: MutationActorKind[] = ["agent", "operator", "system"];
const STATUS_TIMESTAMPS: Record<MutationContractStatus, keyof MutationLifecycle> = {
  proposed: "proposedAt",
  validated: "validatedAt",
  sandboxed: "sandboxedAt",
  evaluated: "evaluatedAt",
  approved: "approvedAt",
  rejected: "rejectedAt",
  committed: "committedAt",
};

export function validateMutationContractShape(contract: unknown): MutationContractValidationResult {
  const errors: string[] = [];
  if (!contract || typeof contract !== "object") {
    return { valid: false, errors: ["contract must be an object"] };
  }

  const candidate = contract as Partial<MutationContract>;
  if (!candidate.mutationId?.trim()) errors.push("mutationId is required");
  if (!candidate.actor) {
    errors.push("actor is required");
  } else {
    if (!candidate.actor.id?.trim()) errors.push("actor.id is required");
    if (!candidate.actor.kind) errors.push("actor.kind is required");
  }
  if (!candidate.target) {
    errors.push("target is required");
  } else {
    if (!candidate.target.kind) errors.push("target.kind is required");
    if (!candidate.target.identifier?.trim()) errors.push("target.identifier is required");
  }
  if (!candidate.scope) {
    errors.push("scope is required");
  } else {
    if (!candidate.scope.domain) errors.push("scope.domain is required");
    if (!candidate.scope.targetPath?.trim()) errors.push("scope.targetPath is required");
  }

  if (!candidate.operation) {
    errors.push("operation is required");
  } else {
    if (!candidate.operation.type) errors.push("operation.type is required");
    if (!candidate.operation.payload || typeof candidate.operation.payload !== "object" || Array.isArray(candidate.operation.payload)) {
      errors.push("operation.payload must be an object");
    }
  }

  if (!candidate.justification) {
    errors.push("justification is required");
  } else if (!candidate.justification.hypothesis?.trim()) {
    errors.push("justification.hypothesis is required");
  }

  if (!candidate.validation) {
    errors.push("validation is required");
  } else {
    if (!candidate.validation.objective?.trim()) errors.push("validation.objective is required");
    if (!Array.isArray(candidate.validation.validators) || candidate.validation.validators.length === 0) {
      errors.push("validation.validators must contain at least one validator");
    }
    if (!Array.isArray(candidate.validation.metrics) || candidate.validation.metrics.length === 0) {
      errors.push("validation.metrics must contain at least one metric");
    }
  }

  if (!candidate.lifecycle) {
    errors.push("lifecycle is required");
  } else if (!candidate.lifecycle.proposedAt?.trim()) {
    errors.push("lifecycle.proposedAt is required");
  }

  if (!candidate.status) {
    errors.push("status is required");
  }

  return { valid: errors.length === 0, errors };
}

export function validateMutationContractSemantics(contract: MutationContract): MutationContractValidationResult {
  const errors: string[] = [];

  if (!TARGET_KINDS.includes(contract.target.kind)) {
    errors.push(`unsupported target.kind '${contract.target.kind}'`);
  }

  if (!ACTOR_KINDS.includes(contract.actor.kind)) {
    errors.push(`unsupported actor.kind '${contract.actor.kind}'`);
  }

  if (!DOMAIN_PREFIXES[contract.scope.domain]) {
    errors.push(`unsupported scope.domain '${contract.scope.domain}'`);
  } else if (!DOMAIN_PREFIXES[contract.scope.domain].some(prefix => contract.scope.targetPath.startsWith(prefix))) {
    errors.push(`scope.targetPath must start with an allowed prefix for domain '${contract.scope.domain}'`);
  }

  if (!OPERATION_TYPES.includes(contract.operation.type)) {
    errors.push(`unsupported operation.type '${contract.operation.type}'`);
  }

  if (!STATUSES.includes(contract.status)) {
    errors.push(`unsupported status '${contract.status}'`);
  }

  if (contract.lifecycle.status !== contract.status) {
    errors.push("lifecycle.status must match status");
  }

  const requiredTimestamp = STATUS_TIMESTAMPS[contract.status];
  if (!contract.lifecycle[requiredTimestamp]) {
    errors.push(`lifecycle.${requiredTimestamp} is required when status='${contract.status}'`);
  }

  if (contract.target.version?.trim() === "") {
    errors.push("target.version cannot be empty when provided");
  }

  if (!contract.validation.objective.trim()) {
    errors.push("validation.objective must be non-empty");
  }

  const uniqueValidators = new Set(contract.validation.validators);
  if (uniqueValidators.size !== contract.validation.validators.length) {
    errors.push("validation.validators must be unique");
  }

  for (const metric of contract.validation.metrics) {
    if (!metric.metric.trim()) errors.push("validation metric name is required");
    if (!OPERATORS.includes(metric.operator)) errors.push(`unsupported metric operator '${metric.operator}'`);
    if (metric.threshold === undefined) errors.push(`threshold is required for metric '${metric.metric || "unknown"}'`);
  }

  if (contract.constraints?.mustNot?.expandAccessBoundary && contract.scope.domain !== "policy") {
    errors.push("expandAccessBoundary constraint is only valid for policy-domain mutations");
  }

  return { valid: errors.length === 0, errors };
}

export function validateMutationContract(contract: unknown): MutationContractValidationResult {
  const shape = validateMutationContractShape(contract);
  if (!shape.valid) return shape;
  return validateMutationContractSemantics(contract as MutationContract);
}
