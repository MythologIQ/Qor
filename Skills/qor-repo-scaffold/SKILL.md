---
name: qor-repo-scaffold
description: |
  New project initialization protocol. Creates proper directory structure,
  tooling configuration, and starter templates following QoreLogic standards.
user-invocable: true
compatibility: Created for Zo Computer
metadata:
  author: frostwulf.zo.computer
  source: QoreLogic governance suite
allowed-tools: Read, Write, Bash
---

# /qor-repo-scaffold - Project Initialization

<skill>
  <trigger>/qor-repo-scaffold</trigger>
  <phase>PLAN / BOOTSTRAP</phase>
  <persona>Scaffolder</persona>
  <output>Complete project skeleton ready for development</output>
</skill>

## Purpose

Initialize new projects with proper structure, tooling, and templates. Ensures consistency, maintainability, and adherence to best practices from day one.

## When to Use

- Starting new project
- Creating new service/module
- Bootstrapping proof-of-concept
- Team onboarding template
- Extracting component from monolith

## Execution Protocol

### Step 1: Project Type Selection

Determine project characteristics:
- Language/framework (TypeScript, Rust, Python, etc.)
- Runtime (Node.js, Bun, Deno, etc.)
- Project type (API, CLI, Library, Web, etc.)
- Testing approach (unit, integration, e2e)

### Step 2: Directory Structure

Create standard directories:
```
project/
├── docs/               # Documentation
├── src/ or lib/        # Source code
├── tests/              # Test files
├── scripts/            # Build, deploy scripts
├── config/             # Configuration
├── .github/            # CI/CD workflows
└── README.md           # Project overview
```

### Step 3: Tooling Configuration

Initialize configuration files:
- `package.json` or equivalent
- `tsconfig.json` or equivalent
- Linting config (eslint, prettier, etc.)
- Testing config (jest, vitest, etc.)
- CI/CD workflows
- Git ignore

### Step 4: Starter Templates

Create initial files:
- Main entry point
- First test file
- Example usage
- CONTRIBUTING.md template
- LICENSE

### Step 5: Validation

Ensure scaffold is functional:
- Install dependencies
- Run initial tests (should pass trivially)
- Build succeeds
- Linting passes
- Git initialized

## Output Format

**Scaffold Report**:
```
## Project Scaffold: [Name]

### Structure Created
- [directory] - [purpose]
- [file] - [purpose]

### Tooling Configured
- [tool]: [config file] - [key settings]

### Starter Files
- [file]: [description]

### Validation
- [ ] Dependencies install
- [ ] Tests run
- [ ] Build succeeds
- [ ] Lint passes

### Next Steps
1. [Immediate action]
2. [Planning action]
```

## Templates by Type

**TypeScript Library**:
- `src/index.ts` with exports
- `tests/index.test.ts` with basic assertion
- `tsconfig.json` with strict settings
- `package.json` with scripts

**Web Service**:
- `src/server.ts` with basic route
- `tests/server.test.ts` with request assertion
- Health check endpoint
- Configuration loading

**CLI Tool**:
- `src/cli.ts` with argument parsing
- `tests/cli.test.ts` with invocation test
- Help text template
- Exit code handling

## Constraints

- **NEVER** scaffold without understanding project type
- **ALWAYS** use latest stable tooling versions
- **ALWAYS** include testing setup from day one
- **NEVER** scaffold with example code that doesn't compile
- **ALWAYS** document the "why" of structure choices
- **ALWAYS** include CONTRIBUTING.md and LICENSE

## Success Criteria

Scaffold succeeds when:

- [ ] Directory structure follows conventions
- [ ] All tooling configured and functional
- [ ] Initial tests pass
- [ ] Build/lint succeeds
- [ ] Git initialized with good .gitignore
- [ ] Documentation started
- [ ] Ready for first feature implementation

---

**Remember**: A good scaffold makes the first day productive, not confusing.
