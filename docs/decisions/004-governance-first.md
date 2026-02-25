# ADR-004: Governance-First Architecture

## Status

**Accepted** (2024-01-22)

## Context

Zo-Qore is designed to help users plan and execute projects with AI assistance. Given the autonomous nature of the system, we need to decide:

1. Where do policy checks happen in the request flow?
2. How do we ensure no action bypasses governance?
3. How do we balance security with developer experience?

## Decision

We adopt a **governance-first architecture** where every mutation passes through the policy engine before execution. The governance layer is not optional or bypassable.

```
Request → Policy Check → Integrity Check → Action → Audit Log
              │                │              │          │
              ▼                ▼              ▼          ▼
           Block/Allow    Verify State    Execute    Record
```

## Rationale

### Why Governance First?

1. **Autonomous Systems Need Guardrails**: AI making decisions without oversight is dangerous
2. **Consistency**: Centralized policy enforcement means no "backdoors"
3. **Auditability**: Every action has a policy evaluation record
4. **User Trust**: Users know their constraints are always respected

### The Governance Layer

The governance layer consists of four components:

1. **Policy Engine**: Evaluates rules against actions
2. **Integrity Checker**: Verifies data consistency
3. **Victor Kernel**: Provides strategic reasoning and stance
4. **Audit Logger**: Records all decisions

```
┌─────────────────────────────────────────────────────────────┐
│                     Governance Layer                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Policy     │  │  Integrity   │  │   Victor     │      │
│  │   Engine     │  │  Checker     │  │   Kernel     │      │
│  │              │  │              │  │              │      │
│  │ • Rules      │  │ • Checksums  │  │ • Stance     │      │
│  │ • Actions    │  │ • Constraints│  │ • Reasoning  │      │
│  │ • Context    │  │ • State      │  │ • Review     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│           │                │                │               │
│           └────────────────┼────────────────┘               │
│                            │                                │
│                            ▼                                │
│                   ┌──────────────┐                         │
│                   │    Audit     │                         │
│                   │    Logger    │                         │
│                   └──────────────┘                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Implementation

### Policy Rules

Rules are defined in YAML with conditions and actions:

```yaml
# policy/definitions/planning-rules.yaml
- id: plan-001
  name: "Void Required Before Reveal"
  description: "Cannot create clusters until thoughts exist"
  condition:
    stage: "reveal"
    operation: "create"
    requires: "void:has_thoughts"
  action:
    type: block
    message: "Capture at least one thought before clustering"
    resolution: "Go to Void and add a thought"
    link: "/void"
```

### Policy Evaluation

Every mutation goes through the policy engine:

```typescript
async function executeWithGovernance<T>(
  action: string,
  context: GovernanceContext,
  operation: () => Promise<T>
): Promise<T> {
  // 1. Policy check
  const policyResult = await policyEngine.evaluate(action, context);
  if (!policyResult.allowed) {
    throw ErrorFactory.policyDenied(
      policyResult.reason,
      policyResult.resolution,
      policyResult.link
    );
  }

  // 2. Integrity check
  const integrityResult = await integrityChecker.run(context.projectId);
  if (!integrityResult.passed) {
    throw ErrorFactory.integrityFailure(integrityResult.checkId);
  }

  // 3. Execute
  const result = await operation();

  // 4. Audit log
  await auditLogger.log({
    action,
    projectId: context.projectId,
    actorId: context.actorId,
    outcome: 'SUCCESS',
    policyRule: policyResult.ruleId
  });

  return result;
}
```

### Victor Integration

Victor provides strategic reasoning at key decision points:

```typescript
// Before critical actions
const victorStance = await victorKernel.evaluateStance({
  action: 'activateAutonomy',
  projectState,
  risks
});

if (victorStance.stance === 'red-flag') {
  throw ErrorFactory.victorRedFlag(
    victorStance.reasoning,
    victorStance.recommendation
  );
}
```

## Enforcement Points

| Layer | Check | Failure Mode |
|-------|-------|--------------|
| API | Policy evaluation | 403 Forbidden |
| Store | Integrity checksum | 409 Conflict |
| Victor | Stance evaluation | 422 Unprocessable |
| Audit | Logging failure | Alert + continue |

## Alternatives Considered

### Optional Governance

- **Pros**: Simpler for development, faster execution
- **Cons**: Easy to bypass, inconsistent enforcement, no audit trail

### Database-Level Constraints

- **Pros**: Enforced by database, hard to bypass
- **Cons**: Less flexible, tied to specific database, no reasoning layer

### AOP (Aspect-Oriented Programming)

- **Pros**: Clean separation of concerns
- **Cons**: Complex, harder to debug, requires framework support

## Consequences

- Every mutation has governance overhead (typically <5ms)
- Policy rules must be carefully designed to avoid false blocks
- Developers cannot bypass governance in production code
- Full audit trail of all actions and decisions
- Victor's reasoning is visible to users (transparency)

## Policy Modes

The system supports two modes:

1. **Strict** (default): Blocks on policy violation
2. **Permissive**: Logs violations but allows action (for development)

```typescript
const policyMode = process.env.ZO_QORE_POLICY_MODE || 'strict';
```

## References

- `policy/definitions/`
- `runtime/planning/PlanningGovernance.ts`
- `runtime/planning/IntegrityChecker.ts`
- `zo/victor/planning/planning-rules.ts`
