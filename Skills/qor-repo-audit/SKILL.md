---
name: qor-repo-audit
description: |
  Deep repository health analysis. Detects technical debt, security issues,
  maintenance gaps, and architectural drift. Produces actionable remediation roadmap.
user-invocable: true
compatibility: Created for Zo Computer
metadata:
  author: frostwulf.zo.computer
  source: QoreLogic governance suite
allowed-tools: Read, Grep, Bash, Glob
---

# /qor-repo-audit - Repository Health Assessment

<skill>
  <trigger>/qor-repo-audit</trigger>
  <phase>AUDIT / GATE</phase>
  <persona>Auditor</persona>
  <output>Audit report with risk matrix and remediation plan</output>
</skill>

## Purpose

Comprehensive repository health analysis. Detects technical debt, security issues, maintenance gaps, and architectural drift before they become critical blockers.

## When to Use

- Before major refactoring or migration
- When inheriting a codebase
- Periodic health checks (quarterly recommended)
- Pre-acquisition or due diligence
- When complexity seems to be outpacing productivity

## Execution Protocol

### Step 1: Structure Analysis

Map the repository:
- Directory structure and organization
- File counts by type
- Module/component boundaries
- Dependency graph

### Step 2: Code Health Check

Analyze code quality:
- Dead code detection
- Duplicate code blocks
- Complex functions (cyclomatic complexity)
- Missing error handling
- Deprecated API usage

### Step 3: Dependency Audit

Review dependencies:
- Outdated packages
- Known security vulnerabilities
- Unused dependencies
- License compatibility
- Supply chain risks

### Step 4: Test Coverage

Assess testing:
- Coverage percentages
- Critical path gaps
- Test quality (assertions, isolation)
- Flaky tests
- Missing test categories

### Step 5: Documentation Review

Check knowledge capture:
- README completeness
- API documentation
- Architecture decisions
- Runbooks and procedures
- Changelog maintenance

## Risk Matrix

Classify findings by severity:
- **Critical**: Security issues, data loss risk, legal exposure
- **High**: Blockers to major changes, significant tech debt
- **Medium**: Maintenance burden, developer friction
- **Low**: Cleanup opportunities, nice-to-have improvements

## Output Format

```
## Repository Audit: [Name]

### Executive Summary
- Files: [count]
- Risk Level: [Critical/High/Medium/Low]
- Top Issues: [count Critical, count High]

### Findings by Category

#### Structure
- [Finding with file:line reference]
- [Finding with file:line reference]

#### Code Health
- [Finding with evidence]

#### Dependencies
- [Outdated/vulnerable package with current -> recommended version]

#### Test Coverage
- [Coverage gap with impact assessment]

#### Documentation
- [Missing or outdated doc with business impact]

### Risk Matrix
| Issue | Severity | Effort | Impact | Priority |
|-------|----------|--------|--------|----------|
| [brief] | [C/H/M/L] | [S/M/L] | [business] | [P0-P4] |

### Remediation Roadmap
**Immediate (This Sprint)**:
- [ ] [Critical item]

**Near-term (Next Quarter)**:
- [ ] [High priority item]

**Backlog**:
- [ ] [Medium/Low priority items]

### Handoff Recommendations
- To `/qor-plan`: [architecture decisions needed]
- To `/qor-implement`: [specific refactors]
- To `/qor-debug`: [investigation needed]
```

## Constraints

- **NEVER** report findings without evidence (file paths, line numbers)
- **ALWAYS** prioritize by business impact, not just technical elegance
- **ALWAYS** distinguish "must fix" from "should fix" from "could fix"
- **NEVER** conduct audit without defined scope (full repo vs specific component)
- **ALWAYS** include concrete remediation steps, not just problems

## Success Criteria

Audit succeeds when:

- [ ] All significant issues identified with evidence
- [ ] Risk matrix complete with prioritization
- [ ] Remediation roadmap actionable and scoped
- [ ] No surprise findings during implementation
- [ ] Handoff to appropriate skills documented

---

**Remember**: An audit without remediation is just complaining.
