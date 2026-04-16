# Plan: Frontier Models Card Viewer

**OPEN QUESTIONS**
- None identified

---

## Task Checklist

### Phase 1: HTML Structure & Data Embedding
☐ Parse Excel data and embed as JSON
☐ Create main container with TOC sidebar and card display area
☐ Implement card layout with profile fields
☐ Add prompt generation section below profile
☐ Add navigation controls (arrows, TOC links)

### Phase 2: Styling (Dark Mode)
☐ Define dark theme CSS variables
☐ Style TOC sidebar with hover states
☐ Style card layout (profile sections, prompt box)
☐ Style navigation buttons
☐ Add swipe gesture support for mobile

### Phase 3: JavaScript Logic
☐ Initialize data and current index
☐ Implement card render function
☐ Implement navigation (prev/next, TOC click, swipe)
☐ Generate custom prompt from Best Practice Strategy + System Prompt Magic Words
☐ Implement clipboard copy functionality
☐ Add keyboard navigation (arrow keys)

---

## Phase 1: HTML Structure & Data Embedding

### Affected Files
- `frontier-models-viewer.html` (new file)

### Changes
- Parse `Frontier Models.xlsx` data and embed as JSON array
- Create main layout:
  - Left sidebar: Table of contents (list of model names as links)
  - Right content: Card display area
  - Card structure:
    - Header: Model name, Role, Provider
    - Profile sections (key fields from data)
    - Prompt generation section:
      - Generated prompt text box (readonly)
      - "Copy to Clipboard" button
- Navigation:
  - Left/right arrow buttons at bottom of card
  - Keyboard arrow key listeners

---

## Phase 2: Styling (Dark Mode)

### Affected Files
- `frontier-models-viewer.html`

### Changes
- CSS variables for dark theme:
  - Background: `#0d1117`
  - Card background: `#161b22`
  - Text: `#c9d1d9`
  - Accent: `#58a6ff`
  - Border: `#30363d`
- Layout: Flexbox for sidebar + main content
- TOC styling:
  - Hover state with accent color
  - Active state indicator
- Card styling:
  - Clean sectioned layout
  - Readable typography with hierarchy
- Prompt box:
  - Monospace font
  - Distinct background color
- Responsive:
  - Collapse TOC on mobile (hamburger menu)
  - Touch-friendly button sizes

---

## Phase 3: JavaScript Logic

### Affected Files
- `frontier-models-viewer.html`

### Changes
- Data structure: Array of model objects with all fields from Excel
- State: `currentIndex`
- Functions:
  - `renderCard(index)`: Update DOM with current model data
  - `renderTOC()`: Generate TOC links
  - `generatePrompt(model)`: Combine `Best Practice Strategy` + `System Prompt Magic Words` into Zo-ready prompt text
  - `copyToClipboard()`: Write prompt to clipboard using navigator.clipboard
  - `navigate(direction)`: Update index with bounds checking
  - `goToIndex(index)`: Jump from TOC
- Event listeners:
  - Click on TOC links
  - Click on navigation buttons
  - Keyboard: ArrowLeft, ArrowRight
  - Touch: Swipe left/right (touchstart, touchend)
- Initialization: Render first model on load

### Prompt Generation Logic
The generated prompt will combine these fields:
```
You are using [Model Name] ([Role]).

Context Guidelines:
[Best Practice Strategy]

System Instructions:
[System Prompt Magic Words]

Temperature: [Temperature Tuning]
```

This format provides the model's own best practices formatted for Zo chat consumption.
