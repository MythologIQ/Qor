# Contributing to Zo-Qore

Thank you for contributing to Zo-Qore! This guide covers the development workflow, coding standards, and contribution process.

---

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd zo-qore
npm install

# Run type checking
npm run typecheck

# Run tests
npm run test

# Run all checks
npm run verify:all
```

---

## Development Workflow

### 1. Before Starting

1. **Run the verification suite** to ensure a clean starting state:
   ```bash
   npm run verify:all
   ```

2. **Create a feature branch** from `develop`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

### 2. Making Changes

1. **Write code** following the coding standards below
2. **Write tests** for new functionality
3. **Run typecheck and tests** frequently:
   ```bash
   npm run typecheck && npm run test
   ```

### 3. Before Committing

Pre-commit hooks will automatically run typecheck and lint on staged files. If they fail, fix the issues before committing.

```bash
# Manual verification
npm run verify:all
```

### 4. Submitting Changes

1. Push to your branch
2. Create a Pull Request to `develop`
3. Ensure CI passes (quality, test, build)
4. Request review

---

## Coding Standards

### TypeScript

- **Strict mode**: All code must pass strict TypeScript checks
- **No `any`**: Use `unknown` with type guards or proper typing
- **Explicit return types**: Required for public functions
- **JSDoc**: Required for public APIs

```typescript
// Good
export async function getThought(
  thoughtId: string
): Promise<Thought | null> {
  // Implementation
}

// Bad
export async function getThought(thoughtId) {
  // Implementation
}
```

### File Naming

| Type | Convention | Example |
|------|------------|---------|
| Modules | `kebab-case.ts` | `void-store.ts` |
| Classes | `PascalCase.ts` | `VoidStore.ts` |
| Tests | `*.test.ts` | `void-store.test.ts` |
| Types | `types.ts` | `types.ts` |

### Interface Naming

- **PascalCase** for interface names
- **No `I` prefix** (e.g., `Thought`, not `IThought`)
- **Descriptive suffixes** for clarity: `Config`, `State`, `Result`

```typescript
// Good
interface VoidConfig { /* ... */ }
interface VoidState { /* ... */ }

// Bad
interface IVoidConfig { /* ... */ }
interface VoidData { /* ... */ }  // Too vague
```

### Error Handling

Use the standard `UserFacingError` shape:

```typescript
import { ErrorFactory } from '../ui-shell/errors';

// Good
throw ErrorFactory.notFound('Thought', thoughtId);

// Bad
throw new Error('Thought not found');
```

### Logging

Use structured logging via the audit logger:

```typescript
import { logger } from '../runtime/planning/Logger';

await logger.log({
  action: 'thought:created',
  projectId,
  outcome: 'SUCCESS',
  metadata: { thoughtId }
});
```

---

## Testing

### Test Organization

```
tests/
├── unit/           # Fast, isolated tests
├── integration/    # Filesystem/API tests
├── performance/    # Benchmarks
└── e2e/            # Full pipeline tests
```

### Test Naming

```typescript
// Pattern: describe('Unit', () => { it('should do X when Y', () => {}) })
describe('VoidStore', () => {
  describe('addThought', () => {
    it('should append thought to JSONL file', () => {
      // Test
    });

    it('should update index after append', () => {
      // Test
    });
  });
});
```

### Test Fixtures

Use test factories for consistent data:

```typescript
import { createTestThought } from '../fixtures/thought-factory';

const thought = createTestThought({ content: 'Test thought' });
```

### Running Tests

```bash
# All tests
npm run test

# Watch mode
npm run test:watch

# Performance benchmarks
npm run test:perf

# Specific file
npx vitest run tests/unit/void-store.test.ts
```

---

## Adding New Features

### Adding a View

1. **Create types** in `zo/{view}/types.ts`:

```typescript
export interface {View}State {
  // State shape
}

export interface {View}Config {
  // Configuration
}
```

2. **Create store** in `runtime/planning/{View}Store.ts`:

```typescript
export class {View}Store {
  async read(projectId: string): Promise<{View}State> { /* ... */ }
  async write(projectId: string, state: {View}State): Promise<void> { /* ... */ }
}
```

3. **Create UI** in `zo/ui-shell/{view}.js` and `{view}.css`:

```javascript
// {view}.js
export async function init{View}View(container, projectId) {
  // Initialize view
}
```

4. **Create API routes** in `runtime/service/planning-routes-{view}.ts`:

```typescript
// GET /api/projects/:projectId/{view}
router.get('/:projectId/{view}', async (c) => {
  // Handler
});
```

5. **Add tests**:

```typescript
// tests/planning/{view}-store.test.ts
describe('{View}Store', () => {
  // Tests
});
```

6. **Update policy** if needed in `policy/definitions/`

### Adding a Policy Rule

1. **Create definition** in `policy/definitions/planning-rules.yaml`:

```yaml
- id: plan-XXX
  name: "Rule Name"
  description: "What this rule enforces"
  condition:
    # When to apply
  action:
    type: block | warn | log
    message: "User-facing message"
```

2. **Add to policy engine** if custom logic needed

3. **Write tests**:

```typescript
describe('Policy plan-XXX', () => {
  it('should block when condition met', () => {
    // Test
  });
});
```

### Adding an API Endpoint

1. **Define types** (contracts or inline)

2. **Create handler**:

```typescript
router.post('/api/projects/:projectId/resource', async (c) => {
  const projectId = c.req.param('projectId');
  const body = await c.req.json();

  // Validate
  const validated = validateInput(body);

  // Check policy
  const allowed = await policyEngine.check('action', context);
  if (!allowed) {
    throw ErrorFactory.policyDenied('reason', 'resolution');
  }

  // Execute
  const result = await store.create(projectId, validated);

  // Log
  await logger.log({ action: 'resource:created', projectId, outcome: 'SUCCESS' });

  return c.json({ data: result }, 201);
});
```

3. **Add error handling** with `ErrorFactory`

4. **Write tests**

---

## Code Review Guidelines

### What Reviewers Check

1. **TypeScript strictness**: No `any`, proper typing
2. **Test coverage**: New code has tests
3. **Error handling**: Uses `UserFacingError` shape
4. **Logging**: Structured logging for mutations
5. **Policy compliance**: Policy checks where needed
6. **Razor compliance**: Functions <40 lines, nesting <3 levels

### PR Checklist

- [ ] Typecheck passes
- [ ] All tests pass
- [ ] New code has tests
- [ ] Documentation updated if needed
- [ ] CHANGELOG.md updated for user-facing changes
- [ ] No `console.log` (use logger)

---

## Release Process

### Version Bumping

1. Update `package.json` version
2. Update `CHANGELOG.md`
3. Create git tag: `v{version}`
4. Push tag to trigger release workflow

### Release Gate

Before release, run:

```bash
npm run release:gate
```

This verifies:
- TypeScript compilation
- Lint checks
- Test suite
- Build
- Planning integrity checks

---

## Getting Help

- **Documentation**: `docs/ARCHITECTURE.md`
- **Issues**: GitHub Issues
- **Questions**: Ask in PR comments or create a discussion

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
