# ADR-003: Vanilla JavaScript for UI

## Status

**Accepted** (2024-01-20)

## Context

Zo-Qore needs a web-based user interface for interacting with the planning pipeline. We considered several options:

1. **Framework approach**: React, Vue, Svelte, or similar
2. **Vanilla JavaScript**: Plain DOM manipulation, no framework
3. **Web Components**: Custom elements with Shadow DOM
4. **Server-side rendering**: Templates rendered on the server

Key considerations:
1. **Bundle size**: How much JavaScript is shipped to the client?
2. **Learning curve**: How easy is it for contributors to understand?
3. **Longevity**: Will this be maintainable in 5+ years?
4. **Zo Computer constraints**: How does this fit the Zo deployment model?
5. **Performance**: Startup time, runtime performance

## Decision

We will use **vanilla JavaScript** with no framework dependencies. The UI is built using:

- Plain DOM manipulation (`document.createElement`, `querySelector`, etc.)
- CSS for styling (with custom properties for design tokens)
- Modular JavaScript files per view
- No build step for the UI (just TypeScript compilation)

## Rationale

### Advantages

1. **Zero Framework Lock-in**: No dependency on React's ecosystem, version upgrades, or deprecations
2. **Small Bundle Size**: No framework runtime. Only the code we write.
3. **Long-term Stability**: Vanilla JS APIs are stable. DOM APIs from 2010 still work.
4. **Simplicity**: No build configuration, no JSX transformation, no virtual DOM
5. **Direct Control**: Full control over rendering, no hidden framework behavior
6. **Zo Fit**: Lightweight, matches the minimal-dependency philosophy

### Disadvantages

1. **More Verbose**: DOM manipulation requires more code than JSX
2. **No Ecosystem**: No component libraries, routing solutions, state management
3. **Manual Optimization**: No automatic virtual DOM diffing
4. **Higher Barrier**: Contributors may be more familiar with frameworks

## Patterns

### Component Pattern

We use a simple factory function pattern for components:

```javascript
// components.js
export function createBadge(text, variant = 'default') {
  const badge = document.createElement('span');
  badge.className = `badge badge--${variant}`;
  badge.textContent = text;
  return badge;
}

export function createEmptyState(title, description, action) {
  const container = document.createElement('div');
  container.className = 'empty-state';
  container.innerHTML = `
    <h3 class="empty-state__title">${title}</h3>
    <p class="empty-state__description">${description}</p>
    ${action ? `<button class="btn btn--primary">${action}</button>` : ''}
  `;
  return container;
}
```

### View Pattern

Each view follows a consistent initialization pattern:

```javascript
// void.js
export async function initVoidView(container, projectId) {
  // Fetch data
  const thoughts = await fetch(`/api/projects/${projectId}/void/thoughts`);
  
  // Render initial state
  render(container, thoughts);
  
  // Set up event handlers
  container.addEventListener('click', handleClick);
}

function render(container, thoughts) {
  container.innerHTML = '';
  thoughts.forEach(thought => {
    container.appendChild(createThoughtCard(thought));
  });
}
```

### State Management

Simple state object with render function:

```javascript
let state = {
  thoughts: [],
  loading: true,
  error: null
};

function setState(newState) {
  state = { ...state, ...newState };
  render();
}
```

## Design System

We use CSS custom properties (design tokens) for consistency:

```css
/* tokens.css */
:root {
  --color-primary: #3b82f6;
  --color-success: #22c55e;
  --space-1: 4px;
  --space-2: 8px;
  --radius-md: 6px;
}
```

Components consume these tokens:

```css
/* components.css */
.btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  background-color: var(--color-primary);
}
```

## Alternatives Considered

### React

- **Pros**: Huge ecosystem, component model, familiar to many developers
- **Cons**: Bundle size (40KB+ minified), JSX build step, framework churn

### Preact

- **Pros**: React-compatible API, tiny bundle (3KB)
- **Cons**: Still requires JSX/build, less ecosystem than React

### Svelte

- **Pros**: Compile-time framework, no runtime, small bundles
- **Cons**: Build step required, smaller ecosystem

### Web Components

- **Pros**: Native browser support, framework-agnostic
- **Cons**: Verbose API, Shadow DOM complexity, limited styling options

## Consequences

- UI code is straightforward but more verbose
- No build step needed for UI development
- Bundle size is minimal (tens of KB, not hundreds)
- Long-term maintainability is improved
- Contributors need to understand DOM APIs, not framework patterns

## Exceptions

We may reconsider this decision for:
- **Constellation view**: Complex graph visualization may benefit from a library like D3 or Cytoscape
- **Rich text editing**: If needed, may use a dedicated editor library

## References

- `zo/ui-shell/void.js`
- `zo/ui-shell/components.js`
- `zo/ui-shell/tokens.css`
- `zo/ui-shell/components.css`
