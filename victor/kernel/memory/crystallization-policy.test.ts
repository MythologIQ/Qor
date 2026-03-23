import { describe, it, expect } from "bun:test";
import {
  CrystallizationPolicyMode,
  ApprovalStatus,
  CrystallizationPolicy,
  CrystallizationApprovalRequest,
  CrystallizationApprovalRecord,
  DEFAULT_CRYSTALLIZATION_POLICY,
  createCrystallizationPolicy,
  checkCrystallizationPolicy,
  createApprovalRequest,
  initializeApprovalRecord,
  submitApprovalRequest,
  approveRequest,
  denyRequest,
  inspectCrystallizationPolicy,
  countPendingApprovals,
  filterRecordsByStatus,
} from "./crystallization-policy";

describe("Crystallization Policy - Default Configuration", () => {
  it("should default to approval-required mode", () => {
    expect(DEFAULT_CRYSTALLIZATION_POLICY.mode).toBe("approval-required");
  });

  it("should require approval in default mode", () => {
    expect(DEFAULT_CRYSTALLIZATION_POLICY.requiresApproval).toBe(true);
  });

  it("should not allow auto-promotion in default mode", () => {
    expect(DEFAULT_CRYSTALLIZATION_POLICY.allowsAutoPromotion).toBe(false);
  });

  it("should have createdAt timestamp", () => {
    expect(DEFAULT_CRYSTALLIZATION_POLICY.createdAt).toBeGreaterThan(0);
  });
});

describe("Crystallization Policy - Policy Creation", () => {
  it("should create approval-required policy by default", () => {
    const policy = createCrystallizationPolicy();
    expect(policy.mode).toBe("approval-required");
    expect(policy.requiresApproval).toBe(true);
    expect(policy.allowsAutoPromotion).toBe(false);
  });

  it("should create auto-approve policy when specified", () => {
    const policy = createCrystallizationPolicy("auto-approve");
    expect(policy.mode).toBe("auto-approve");
    expect(policy.requiresApproval).toBe(false);
    expect(policy.allowsAutoPromotion).toBe(true);
  });

  it("should create always-deny policy when specified", () => {
    const policy = createCrystallizationPolicy("always-deny");
    expect(policy.mode).toBe("always-deny");
    expect(policy.requiresApproval).toBe(false);
    expect(policy.allowsAutoPromotion).toBe(false);
  });
});

describe("Crystallization Policy - Approval-Required Mode", () => {
  const policy = createCrystallizationPolicy("approval-required");

  it("should deny crystallization when approval not requested", () => {
    const decision = checkCrystallizationPolicy(policy, "not-requested");
    expect(decision.allowed).toBe(false);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.approvalNeeded).toBe(true);
    expect(decision.reason).toContain("requires approval");
  });

  it("should deny crystallization when approval pending", () => {
    const decision = checkCrystallizationPolicy(policy, "pending");
    expect(decision.allowed).toBe(false);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.approvalNeeded).toBe(false);
    expect(decision.reason).toContain("pending approval");
  });

  it("should allow crystallization when approved", () => {
    const decision = checkCrystallizationPolicy(policy, "approved");
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.approvalNeeded).toBe(false);
    expect(decision.reason).toContain("approved");
  });

  it("should deny crystallization when denied", () => {
    const decision = checkCrystallizationPolicy(policy, "denied");
    expect(decision.allowed).toBe(false);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.approvalNeeded).toBe(false);
    expect(decision.reason).toContain("denied");
  });
});

describe("Crystallization Policy - Auto-Approve Mode", () => {
  const policy = createCrystallizationPolicy("auto-approve");

  it("should allow crystallization regardless of approval status", () => {
    const statuses: ApprovalStatus[] = ["not-requested", "pending", "approved", "denied"];

    for (const status of statuses) {
      const decision = checkCrystallizationPolicy(policy, status);
      expect(decision.allowed).toBe(true);
      expect(decision.requiresApproval).toBe(false);
      expect(decision.approvalNeeded).toBe(false);
      expect(decision.reason).toContain("Auto-approved");
    }
  });
});

describe("Crystallization Policy - Always-Deny Mode", () => {
  const policy = createCrystallizationPolicy("always-deny");

  it("should deny crystallization regardless of approval status", () => {
    const statuses: ApprovalStatus[] = ["not-requested", "pending", "approved", "denied"];

    for (const status of statuses) {
      const decision = checkCrystallizationPolicy(policy, status);
      expect(decision.allowed).toBe(false);
      expect(decision.requiresApproval).toBe(false);
      expect(decision.approvalNeeded).toBe(false);
      expect(decision.reason).toContain("always-deny");
    }
  });
});

describe("Crystallization Policy - Approval Request Creation", () => {
  it("should create approval request with correct fields", () => {
    const request = createApprovalRequest(
      "mem-001",
      0.97,
      "durable",
      "High saturation memory ready for crystallization"
    );

    expect(request.memoryId).toBe("mem-001");
    expect(request.saturation).toBe(0.97);
    expect(request.tier).toBe("durable");
    expect(request.reason).toBe("High saturation memory ready for crystallization");
    expect(request.requestedAt).toBeGreaterThan(0);
  });
});

describe("Crystallization Policy - Approval Record Lifecycle", () => {
  it("should initialize record with not-requested status", () => {
    const record = initializeApprovalRecord("mem-001");
    expect(record.memoryId).toBe("mem-001");
    expect(record.status).toBe("not-requested");
    expect(record.requestedAt).toBeNull();
    expect(record.decidedAt).toBeNull();
    expect(record.decidedBy).toBeNull();
    expect(record.reason).toContain("No approval request");
  });

  it("should transition from not-requested to pending on request submission", () => {
    const record = initializeApprovalRecord("mem-001");
    const request = createApprovalRequest("mem-001", 0.97, "durable", "Ready for L3");
    const updated = submitApprovalRequest(record, request);

    expect(updated.status).toBe("pending");
    expect(updated.requestedAt).toBe(request.requestedAt);
    expect(updated.reason).toBe("Ready for L3");
  });

  it("should not re-submit already-requested approval", () => {
    const record = initializeApprovalRecord("mem-001");
    const request = createApprovalRequest("mem-001", 0.97, "durable", "Ready for L3");
    const pending = submitApprovalRequest(record, request);
    const resubmitted = submitApprovalRequest(pending, request);

    expect(resubmitted).toEqual(pending); // No change
  });

  it("should approve pending request", () => {
    const record = initializeApprovalRecord("mem-001");
    const request = createApprovalRequest("mem-001", 0.97, "durable", "Ready for L3");
    const pending = submitApprovalRequest(record, request);
    const approved = approveRequest(pending, "victor-operator", "Approved for crystallization");

    expect(approved.status).toBe("approved");
    expect(approved.decidedBy).toBe("victor-operator");
    expect(approved.decidedAt).toBeGreaterThan(0);
    expect(approved.reason).toBe("Approved for crystallization");
  });

  it("should deny pending request", () => {
    const record = initializeApprovalRecord("mem-001");
    const request = createApprovalRequest("mem-001", 0.97, "durable", "Ready for L3");
    const pending = submitApprovalRequest(record, request);
    const denied = denyRequest(pending, "victor-operator", "Insufficient verification");

    expect(denied.status).toBe("denied");
    expect(denied.decidedBy).toBe("victor-operator");
    expect(denied.decidedAt).toBeGreaterThan(0);
    expect(denied.reason).toBe("Insufficient verification");
  });

  it("should not approve already-approved request", () => {
    const record = initializeApprovalRecord("mem-001");
    const request = createApprovalRequest("mem-001", 0.97, "durable", "Ready for L3");
    const pending = submitApprovalRequest(record, request);
    const approved = approveRequest(pending, "victor-operator");
    const reapproved = approveRequest(approved, "victor-operator");

    expect(reapproved).toEqual(approved); // No change
  });

  it("should not deny already-denied request", () => {
    const record = initializeApprovalRecord("mem-001");
    const request = createApprovalRequest("mem-001", 0.97, "durable", "Ready for L3");
    const pending = submitApprovalRequest(record, request);
    const denied = denyRequest(pending, "victor-operator", "Insufficient verification");
    const redenied = denyRequest(denied, "victor-operator", "Still insufficient");

    expect(redenied).toEqual(denied); // No change
  });
});

describe("Crystallization Policy - Governance Inspection", () => {
  it("should inspect approval-required policy as high safety", () => {
    const policy = createCrystallizationPolicy("approval-required");
    const inspection = inspectCrystallizationPolicy(policy);

    expect(inspection.mode).toBe("approval-required");
    expect(inspection.requiresApproval).toBe(true);
    expect(inspection.allowsAutoPromotion).toBe(false);
    expect(inspection.safetyLevel).toBe("high");
  });

  it("should inspect always-deny policy as high safety", () => {
    const policy = createCrystallizationPolicy("always-deny");
    const inspection = inspectCrystallizationPolicy(policy);

    expect(inspection.mode).toBe("always-deny");
    expect(inspection.requiresApproval).toBe(false);
    expect(inspection.allowsAutoPromotion).toBe(false);
    expect(inspection.safetyLevel).toBe("high");
  });

  it("should inspect auto-approve policy as low safety", () => {
    const policy = createCrystallizationPolicy("auto-approve");
    const inspection = inspectCrystallizationPolicy(policy);

    expect(inspection.mode).toBe("auto-approve");
    expect(inspection.requiresApproval).toBe(false);
    expect(inspection.allowsAutoPromotion).toBe(true);
    expect(inspection.safetyLevel).toBe("low");
  });
});

describe("Crystallization Policy - Approval Monitoring", () => {
  it("should count pending approvals", () => {
    const records: CrystallizationApprovalRecord[] = [
      { ...initializeApprovalRecord("mem-001"), status: "pending" },
      { ...initializeApprovalRecord("mem-002"), status: "approved" },
      { ...initializeApprovalRecord("mem-003"), status: "pending" },
      { ...initializeApprovalRecord("mem-004"), status: "denied" },
      { ...initializeApprovalRecord("mem-005"), status: "pending" },
    ];

    const count = countPendingApprovals(records);
    expect(count).toBe(3);
  });

  it("should filter records by status", () => {
    const records: CrystallizationApprovalRecord[] = [
      { ...initializeApprovalRecord("mem-001"), status: "pending" },
      { ...initializeApprovalRecord("mem-002"), status: "approved" },
      { ...initializeApprovalRecord("mem-003"), status: "pending" },
      { ...initializeApprovalRecord("mem-004"), status: "denied" },
    ];

    const pending = filterRecordsByStatus(records, "pending");
    expect(pending).toHaveLength(2);
    expect(pending[0].memoryId).toBe("mem-001");
    expect(pending[1].memoryId).toBe("mem-003");

    const approved = filterRecordsByStatus(records, "approved");
    expect(approved).toHaveLength(1);
    expect(approved[0].memoryId).toBe("mem-002");

    const denied = filterRecordsByStatus(records, "denied");
    expect(denied).toHaveLength(1);
    expect(denied[0].memoryId).toBe("mem-004");
  });
});

describe("Crystallization Policy - Acceptance Criteria", () => {
  it("AC1: Default policy requires approval before promoting to L3", () => {
    // Default policy is approval-required
    const policy = DEFAULT_CRYSTALLIZATION_POLICY;
    expect(policy.mode).toBe("approval-required");
    expect(policy.requiresApproval).toBe(true);

    // Without approval, crystallization is denied
    const decisionNoRequest = checkCrystallizationPolicy(policy, "not-requested");
    expect(decisionNoRequest.allowed).toBe(false);
    expect(decisionNoRequest.requiresApproval).toBe(true);

    const decisionPending = checkCrystallizationPolicy(policy, "pending");
    expect(decisionPending.allowed).toBe(false);

    // With approval, crystallization is allowed
    const decisionApproved = checkCrystallizationPolicy(policy, "approved");
    expect(decisionApproved.allowed).toBe(true);
  });

  it("AC2: Policy is explicit and inspectable", () => {
    const policy = DEFAULT_CRYSTALLIZATION_POLICY;
    const inspection = inspectCrystallizationPolicy(policy);

    // All fields are explicit and queryable
    expect(inspection.mode).toBe("approval-required");
    expect(inspection.requiresApproval).toBe(true);
    expect(inspection.allowsAutoPromotion).toBe(false);
    expect(inspection.safetyLevel).toBe("high");
  });

  it("AC3: Approval workflow is testable and deterministic", () => {
    // Initialize record
    const record1 = initializeApprovalRecord("mem-001");
    expect(record1.status).toBe("not-requested");

    // Submit request
    const request = createApprovalRequest("mem-001", 0.97, "durable", "Ready");
    const pending = submitApprovalRequest(record1, request);
    expect(pending.status).toBe("pending");

    // Approve request
    const approved = approveRequest(pending, "operator", "Approved");
    expect(approved.status).toBe("approved");
    expect(approved.decidedBy).toBe("operator");

    // Re-running the same operations produces identical results (deterministic)
    const record2 = initializeApprovalRecord("mem-001");
    const pending2 = submitApprovalRequest(record2, request);
    const approved2 = approveRequest(pending2, "operator", "Approved");

    expect(pending2.status).toBe(pending.status);
    expect(approved2.status).toBe(approved.status);
    expect(approved2.decidedBy).toBe(approved.decidedBy);
  });

  it("AC4: Policy prevents auto-promotion to permanent storage by default", () => {
    const policy = DEFAULT_CRYSTALLIZATION_POLICY;

    // Auto-promotion is explicitly disabled
    expect(policy.allowsAutoPromotion).toBe(false);

    // Even approved memories require explicit approval step
    const decision = checkCrystallizationPolicy(policy, "not-requested");
    expect(decision.allowed).toBe(false);
    expect(decision.approvalNeeded).toBe(true);
  });
});
