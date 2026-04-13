# Design Document: Intro Animation Overlay

## Overview

A fullscreen cinematic intro overlay that plays once per browser session on manav.win. The overlay renders a centered device image (phone or laptop based on orientation) with a screen layer containing the portfolio background image. The animation zooms the device into the screen, creating an "enter the screen" effect, then removes itself from the DOM entirely.

The feature is delivered as two new self-contained files — `assets/js/intro.js` and `assets/css/intro.css` — with minimal, non-destructive integration into `index.html`. No external dependencies. No modifications to existing code.

---

## Architecture

The overlay is a pure vanilla JS + CSS feature with no framework dependencies. It follows a linear, fire-and-forget execution model:

1. `intro.css` is loaded in `<head>` before `styles.css`
2. `intro.js` is loaded at the end of `<body>` before `script.js`
3. On DOMContentLoaded, `intro.js` checks `sessionStorage`
4. If first visit: builds the overlay DOM, injects it, runs the Animation_Timeline
5. If repeat visit: exits immediately (no DOM injection, no flash)

```mermaid
flowchart TD
    A[Page Load] --> B{sessionStorage\n'introPlayed' === 'true'?}
    B -- Yes --> C[Skip — do nothing]
    B -- No --> D[Set 'introPlayed' = 'true']
    D --> E[Detect orientation]
    E --> F[Build overlay DOM]
    F --> G[Inject as first child of body]
    G --> H[Start Animation_Timeline]
    H --> I[t=0ms: Device fades in]
    I --> J[t=800ms: Screen layer fades in]
    J --> K[t=1600ms: Scale 20x + fade out]
    K --> L[t=2800ms: Overlay fades out]
    L --> M[t=4000ms: overlay.remove()]
```

---

## Components and Interfaces

### Session_Controller

Reads `sessionStorage.getItem('introPlayed')` synchronously at script start. If `'true'`, exits. Otherwise sets the key and proceeds. Wrapped in a `try/catch` to handle `SecurityError` in restricted private browsing environments — falls back to treating the session as a first visit.

```js
// Pseudocode
try {
  if (sessionStorage.getItem('introPlayed') === 'true') return;
  sessionStorage.setItem('introPlayed', 'true');
} catch (e) {
  // sessionStorage unavailable — treat as first visit, continue
}
```

### Orientation_Detector

Evaluates `window.innerWidth < window.innerHeight` once at script execution time. Returns the appropriate image path. Does not re-evaluate during the animation.

```js
const isPortrait = window.innerWidth < window.innerHeight;
const deviceSrc  = isPortrait ? 'assets/images/phone.png' : 'assets/images/laptop.png';
```

### DOM Builder

Constructs the overlay structure entirely in JS — no HTML template in `index.html`. This keeps the overlay invisible on repeat visits without any CSS tricks.

```
#intro-overlay (position:fixed, inset:0, z-index:9999, background:#000)
  └── .intro-device-container (centered, will-change: transform opacity)
        ├── img.intro-device-img (phone.png or laptop.png)
        └── .intro-screen-layer (absolute, overflow:hidden)
              └── img.intro-bg-img (1.1.webp, object-fit:cover)
```

### Animation_Timeline

A sequence of `setTimeout` calls that apply CSS class changes to trigger pre-defined transitions. All animated properties are `transform` and `opacity` only — GPU-composited, no layout or paint.

| Time  | Action |
|-------|--------|
| 0ms   | Overlay injected; device at `opacity:0` |
| 16ms  | Add class to trigger device fade-in (0→1, 600ms) |
| 800ms | Add class to trigger screen layer fade-in (0→1, 800ms) |
| 1600ms | Add class: `transform: scale(20)` + `opacity:0` on container (2s cubic-bezier) |
| 2800ms | Add class: `opacity:0` on overlay (1.1s ease) |
| 4000ms | `overlay.remove()` |

### CSS Transitions

All transitions are defined in `intro.css` as class-based state changes. The JS only adds/removes classes — it never sets inline `transition` properties.

---

## Data Models

No persistent data models. The only state is:

| Key | Storage | Type | Values |
|-----|---------|------|--------|
| `introPlayed` | `sessionStorage` | string | `'true'` or absent |

### Screen Layer Calibration Values

The Screen_Layer position and size must be pixel-perfect against the device images. These are the calibration constants baked into `intro.css`:

**Phone (`assets/images/phone.png`)**
- The screen region sits roughly centered in the phone frame
- Approximate values (to be verified against actual image dimensions):
  - `top: 13.5%`, `left: 7%`, `width: 86%`, `height: 73%`
  - `border-radius: 6%`

**Laptop (`assets/images/laptop.png`)**
- The screen region is the display area of the laptop
- Approximate values:
  - `top: 6%`, `left: 12%`, `width: 76%`, `height: 72%`
  - `border-radius: 2%`

> These values are intentionally approximate in the design. The implementation task requires visual verification against the actual PNG assets and adjustment to pixel-perfect values.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Session skip prevents overlay injection

*For any* page load where `sessionStorage` contains `introPlayed = 'true'`, the overlay element SHALL NOT be present in `document.body` at any point during or after the Session_Controller runs.

**Validates: Requirements 1.1**

### Property 2: First-visit sets session flag

*For any* page load where `sessionStorage` does not contain `introPlayed = 'true'`, after the Session_Controller runs, `sessionStorage.getItem('introPlayed')` SHALL equal `'true'`.

**Validates: Requirements 1.2**

### Property 3: Orientation detection selects correct device image

*For any* pair of viewport dimensions `(width, height)`, the Orientation_Detector SHALL select `phone.png` when `width < height` and `laptop.png` when `width >= height`.

**Validates: Requirements 3.1, 3.2**

### Property 4: Completed timeline removes overlay from DOM

*For any* Animation_Timeline execution, after the final `setTimeout` fires at `t = 4000ms`, no element with `id="intro-overlay"` SHALL exist anywhere in the document.

**Validates: Requirements 2.3, 4.6**

### Property 5: Overlay does not mutate external DOM

*For any* Animation_Timeline execution, no CSS classes, inline styles, or attributes SHALL be added, removed, or modified on any DOM node that is not a descendant of `#intro-overlay`.

**Validates: Requirements 2.4**

### Property 6: sessionStorage failure falls back to first-visit behavior

*For any* environment where accessing `sessionStorage` throws a `SecurityError`, the Session_Controller SHALL proceed to inject the overlay and run the Animation_Timeline as if it were a first visit.

**Validates: Requirements 6.4**

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| `sessionStorage` unavailable (`SecurityError`) | `try/catch` around all sessionStorage calls; treat as first visit |
| Image assets fail to load | Overlay still runs; broken image is invisible against black background; timeline completes and removes overlay normally |
| `window.innerWidth`/`innerHeight` unavailable | Defaults to laptop image (landscape fallback) |
| Script executes before DOM ready | Wrapped in `DOMContentLoaded` listener |

---

## Testing Strategy

This feature is primarily UI rendering and DOM manipulation — a sequence of timed class additions that trigger CSS transitions. Property-based testing is applicable for the pure logic components (session control, orientation detection), while the visual animation timeline is best covered by example-based and integration tests.

### Unit Tests (example-based)

- Session_Controller skips when `introPlayed = 'true'` in sessionStorage
- Session_Controller runs and sets flag when key is absent
- Session_Controller runs when sessionStorage throws (SecurityError simulation)
- Orientation_Detector returns `phone.png` when `innerWidth < innerHeight`
- Orientation_Detector returns `laptop.png` when `innerWidth >= innerHeight`
- DOM Builder injects overlay as first child of `<body>`
- DOM Builder does not inject overlay on repeat visit
- Overlay is removed from DOM after Animation_Timeline completes

### Property-Based Tests

Using `fast-check` for JavaScript. Each test runs a minimum of 100 iterations.

**Feature: intro-animation-overlay, Property 1: Session skip prevents overlay injection**
- Generate random sessionStorage states where `introPlayed = 'true'`
- Assert overlay element is never present in DOM after controller runs

**Feature: intro-animation-overlay, Property 2: First-visit sets session flag**
- Generate random sessionStorage states without `introPlayed = 'true'`
- Assert `sessionStorage.getItem('introPlayed') === 'true'` after controller runs

**Feature: intro-animation-overlay, Property 3: Orientation detection selects correct device image**
- Generate random `(width, height)` integer pairs
- Assert `phone.png` selected when `width < height`, `laptop.png` when `width >= height`

**Feature: intro-animation-overlay, Property 4: Completed timeline removes overlay from DOM**
- Simulate full timeline with fake timers, advance to 4000ms
- Assert `document.getElementById('intro-overlay') === null`

**Feature: intro-animation-overlay, Property 5: Overlay does not mutate external DOM**
- Snapshot all DOM nodes outside overlay before animation
- Run full timeline
- Assert snapshot is unchanged

**Feature: intro-animation-overlay, Property 6: sessionStorage failure falls back to first-visit behavior**
- Mock `sessionStorage` to throw `SecurityError` on any access
- Assert overlay is injected and animation timeline runs

Each property test runs a minimum of 100 iterations.

### Integration / Visual Verification

- Load page in browser with cleared sessionStorage — verify animation plays
- Reload page — verify animation is skipped (no flash)
- Test on portrait mobile viewport — verify phone image is used
- Test on landscape desktop viewport — verify laptop image is used
- Verify screen layer aligns with device screen area visually
- Verify overlay is fully removed from DOM after ~4 seconds (DevTools Elements panel)
