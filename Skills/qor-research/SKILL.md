---
name: qor-research
description: |
  Investigation and learning protocol. Conducts deep-dive research on technologies,
  approaches, and solutions. Produces decision-ready findings.
user-invocable: true
compatibility: Created for Zo Computer
metadata:
  author: frostwulf.zo.computer
  source: QoreLogic governance suite
allowed-tools: Read, Web, WebResearch, Maps, XSearch
---

# /qor-research - Investigation Protocol

<skill>
  <trigger>/qor-research</trigger>
  <phase>PLAN / ALIGN</phase>
  <persona>Researcher</persona>
  <output>Research findings with recommendations</output>
</skill>

## Purpose

Conduct structured investigation on technologies, approaches, or solutions. Produces findings that enable informed decision-making.

## When to Use

- Evaluating new technology or framework
- Understanding domain constraints
- Comparing solution alternatives
- Learning from similar projects
- Preparing for architectural decisions

## Execution Protocol

### Step 1: Define Research Question

Clarify what needs investigation:
- What decision needs to be made?
- What information is currently missing?
- What would "good enough" research look like?
- What are the constraints (time, scope)?

### Step 2: Gather Sources

Collect relevant information:
- Official documentation
- Community best practices
- Case studies and examples
- Comparative analyses
- Expert opinions (blogs, talks)

### Step 3: Evaluate Options

Assess alternatives against criteria:
- Technical fit (does it solve the problem?)
- Maturity (production-ready? community support?)
- Integration (works with existing stack?)
- Team fit (learning curve? expertise available?)
- Longevity (actively maintained? vendor risk?)

### Step 4: Synthesize Findings

Structure the research:
- Executive summary (TL;DR recommendation)
- Option comparison matrix
- Trade-offs analysis
- Risk assessment
- Recommendation with rationale

### Step 5: Document for Decision

Package for stakeholders:
- Clear recommendation
- Confidence level (high/medium/low)
- Open questions or gaps
- Next steps

## Output Format

```
## Research: [Topic]

### Executive Summary
[One-paragraph recommendation with confidence level]

### Research Questions
1. [Question that drove research]
2. [Question that drove research]

### Options Evaluated

#### Option A: [Name]
- **Description**: [What it is]
- **Pros**: [List]
- **Cons**: [List]
- **Fit**: [High/Medium/Low]

#### Option B: [Name]
...

### Comparison Matrix
| Criterion | Option A | Option B | Option C |
|-----------|----------|----------|----------|
| [Criterion] | [score] | [score] | [score] |

### Trade-offs
- [Trade-off with explanation]

### Risks
- [Risk with mitigation]

### Recommendation
[Specific recommendation with rationale]

### Next Steps
1. [Immediate action if approved]
2. [Follow-up research if needed]

### Sources
- [Source with URL or reference]
- [Source with URL or reference]
```

## Constraints

- **NEVER** recommend without considering at least 2 alternatives
- **ALWAYS** disclose confidence level and research gaps
- **ALWAYS** distinguish facts from opinions
- **NEVER** let perfect research block good decisions
- **ALWAYS** consider team expertise and context

## Success Criteria

Research succeeds when:

- [ ] Clear question defined
- [ ] Multiple alternatives evaluated
- [ ] Trade-offs understood and documented
- [ ] Decision-maker can proceed confidently
- [ ] Sources cited for verification

---

**Remember**: Research enables decisions; it doesn't replace them.
