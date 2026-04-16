---
name: qor-repo-release
description: |
  Release management protocol. Coordinates versioning, changelogs, artifacts,
  and deployment verification for production releases.
user-invocable: true
compatibility: Created for Zo Computer
metadata:
  author: frostwulf.zo.computer
  source: QoreLogic governance suite
allowed-tools: Read, Write, Bash, Edit
---

# /qor-repo-release - Release Management

<skill>
  <trigger>/qor-repo-release</trigger>
  <phase>GATE / SUBSTANTIATE</phase>
  <persona>Release Manager</persona>
  <output>Release artifacts, changelog, deployment verification</output>
</skill>

## Purpose

Coordinate production releases with proper versioning, documentation, and verification. Ensures releases are reproducible, traceable, and safe to deploy.

## When to Use

- Preparing production release
- Version bumping
- Changelog maintenance
- Release artifact generation
- Post-deployment verification

## Execution Protocol

### Step 1: Pre-Release Validation

Ensure release readiness:
- All tests passing
- Version bumped appropriately
- Changelog updated
- No uncommitted changes
- Documentation current

### Step 2: Version Selection

Determine version increment:
- **Major**: Breaking changes
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes only
- Follow semantic versioning

### Step 3: Changelog Generation

Document changes since last release:
- Categorized changes (Added, Changed, Fixed, Removed)
- Breaking changes clearly marked
- Migration notes if needed
- Contributors acknowledged

### Step 4: Release Artifacts

Prepare deliverables:
- Tagged commit
- Release notes
- Build artifacts
- Checksums/signatures
- Deployment packages

### Step 5: Deployment Verification

Post-release validation:
- Smoke tests pass
- Critical paths functional
- Monitoring shows health
- Rollback procedure tested

## Output Format

**CHANGELOG.md entry**:
```markdown
## [Version] - [Date]

### Added
- [Feature description with issue reference]

### Changed
- [Behavior change with migration notes]

### Fixed
- [Bug fix with issue reference]

### Removed
- [Deprecated feature removal]

### Security
- [Security fix with CVE if applicable]
```

**Release Checklist**:
```
## Release [Version]

### Pre-Release
- [ ] Tests passing
- [ ] Version bumped
- [ ] Changelog updated
- [ ] Documentation current
- [ ] Security scan clean

### Release
- [ ] Tag created: v[version]
- [ ] Release notes published
- [ ] Artifacts uploaded
- [ ] Registry updated (if applicable)

### Post-Release
- [ ] Smoke tests pass
- [ ] Monitoring green
- [ ] Rollback tested
- [ ] Announcement sent
```

## Constraints

- **NEVER** release without test verification
- **ALWAYS** follow semantic versioning
- **ALWAYS** document breaking changes prominently
- **NEVER** mix feature releases with hotfixes
- **ALWAYS** have rollback procedure ready
- **ALWAYS** verify post-deployment, not just pre-deployment

## Success Criteria

Release succeeds when:

- [ ] Version bumped and tagged
- [ ] Changelog complete and accurate
- [ ] All artifacts generated and verified
- [ ] Smoke tests pass in production
- [ ] Rollback procedure tested
- [ ] Team notified of release

---

**Remember**: A release is a promise. Keep your promises.
