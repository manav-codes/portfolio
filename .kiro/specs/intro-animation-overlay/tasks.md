# Implementation Plan: Intro Animation Overlay

## Overview

Implement a self-contained cinematic intro overlay in two new files (`assets/js/intro.js` and `assets/css/intro.css`) with minimal, non-destructive integration into `index.html`. The overlay plays once per browser session using `sessionStorage`, detects device orientation to pick the right device image, runs a timed CSS-transition animation, then removes itself from the DOM entirely.

## Tasks

- [x] 1. Create `assets/css/intro.css` with all overlay styles
  - Define `#intro-overlay`: `position: fixed; inset: 0; z-index: 9999; background: #000; overflow: hidden`
  - Define `.intro-device-container`: centered via flexbox, `will-change: transform, opacity`
  - Define `.intro-device-img`: initial `opacity: 0`, transition to `opacity: 1` over 600ms
  - Define `.intro-screen-layer`: `position: absolute; overflow: hidden`, initial `opacity: 0`, transition to `opacity: 1` over 800msR
  - Define `.intro-bg-img`: `width: 100%; height: 100%; object-fit: cover`
  - Define phone screen calibration class: `top: 13.5%; left: 7%; width: 86%; height: 73%; border-radius: 6%`
  - Define laptop screen calibration class: `top: 6%; left: 12%; width: 76%; height: 72%; border-radius: 2%`
  - Define animation state classes: `.intro-device-visible`, `.intro-screen-visible`, `.intro-zoom-out`, `.intro-fade-out` — each adding the appropriate `transform`/`opacity` values and transitions
  - All animated properties MUST be `transform` and `opacity` only (GPU-composited, no layout/paint)
  - _Requirements: 2.2, 4.2, 4.3, 4.4, 4.5, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 6.2, 6.3_

- [x] 2. Create `assets/js/intro.js` with Session_Controller and Orientation_Detector
  - [x] 2.1 Implement Session_Controller
    - Wrap all `sessionStorage` access in `try/catch` to handle `SecurityError`
    - If `sessionStorage.getItem('introPlayed') === 'true'`, return immediately (no DOM injection)
    - Otherwise call `sessionStorage.setItem('introPlayed', 'true')` and continue
    - _Requirements: 1.1, 1.2, 1.3, 6.4_

  - [ ]* 2.2 Write property test for Session_Controller — Property 1: Session skip prevents overlay injection
    - Using `fast-check`, generate states where `introPlayed = 'true'`
    - Assert `document.body` never contains `#intro-overlay` after controller runs
    - **Property 1: Session skip prevents overlay injection**
    - **Validates: Requirements 1.1**

  - [ ]* 2.3 Write property test for Session_Controller — Property 2: First-visit sets session flag
    - Using `fast-check`, generate states where `introPlayed` is absent or any non-`'true'` value
    - Assert `sessionStorage.getItem('introPlayed') === 'true'` after controller runs
    - **Property 2: First-visit sets session flag**
    - **Validates: Requirements 1.2**

  - [ ]* 2.4 Write property test for Session_Controller — Property 6: sessionStorage failure falls back to first-visit behavior
    - Mock `sessionStorage` to throw `SecurityError` on any access
    - Assert overlay is injected and Animation_Timeline runs
    - **Property 6: sessionStorage failure falls back to first-visit behavior**
    - **Validates: Requirements 6.4**

  - [x] 2.5 Implement Orientation_Detector
    - Evaluate `window.innerWidth < window.innerHeight` once at script execution time
    - Return `'assets/images/phone.png'` for portrait, `'assets/images/laptop.png'` for landscape
    - Default to laptop image if `window.innerWidth`/`innerHeight` are unavailable
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 2.6 Write property test for Orientation_Detector — Property 3: Orientation detection selects correct device image
    - Using `fast-check`, generate random `(width, height)` integer pairs
    - Assert `phone.png` selected when `width < height`, `laptop.png` when `width >= height`
    - **Property 3: Orientation detection selects correct device image**
    - **Validates: Requirements 3.1, 3.2**

- [x] 3. Implement DOM Builder in `assets/js/intro.js`
  - Build the full overlay DOM tree in JS (no HTML template in `index.html`):
    - `#intro-overlay` → `.intro-device-container` → `img.intro-device-img` + `.intro-screen-layer` → `img.intro-bg-img`
  - Apply the correct screen calibration class (phone or laptop) to `.intro-screen-layer` based on Orientation_Detector result
  - Insert overlay as `document.body.firstChild` (first child of `<body>`)
  - _Requirements: 2.1, 2.4, 5.1, 5.4, 5.5_

- [x] 4. Implement Animation_Timeline in `assets/js/intro.js`
  - Wrap execution in a `DOMContentLoaded` listener
  - At 0ms: overlay injected, device at `opacity: 0` (initial CSS state)
  - At 16ms: add `.intro-device-visible` class to trigger device fade-in (0→1, 600ms)
  - At 800ms: add `.intro-screen-visible` class to trigger screen layer fade-in (0→1, 800ms)
  - At 1600ms: add `.intro-zoom-out` class to container — `transform: scale(20)` + `opacity: 0` (2s cubic-bezier(0.4, 0, 0.15, 1))
  - At 2800ms: add `.intro-fade-out` class to overlay — `opacity: 0` (1.1s ease)
  - At 4000ms: call `overlay.remove()` to remove overlay from DOM entirely
  - JS only adds CSS classes — never sets inline `transition` properties
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 2.3_

  - [ ]* 4.1 Write property test for Animation_Timeline — Property 4: Completed timeline removes overlay from DOM
    - Simulate full timeline with fake timers, advance to 4000ms
    - Assert `document.getElementById('intro-overlay') === null`
    - **Property 4: Completed timeline removes overlay from DOM**
    - **Validates: Requirements 2.3, 4.6**

  - [ ]* 4.2 Write property test for Animation_Timeline — Property 5: Overlay does not mutate external DOM
    - Snapshot all DOM nodes outside `#intro-overlay` before animation
    - Run full timeline
    - Assert snapshot is unchanged after `overlay.remove()`
    - **Property 5: Overlay does not mutate external DOM**
    - **Validates: Requirements 2.4**

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Integrate into `index.html`
  - Add `<link rel="stylesheet" href="./assets/css/intro.css">` in `<head>` before the existing `styles.css` link
  - Add `<script src="./assets/js/intro.js"></script>` before the closing `</body>` tag, before the existing `script.js` reference
  - Do NOT modify any other existing HTML, CSS classes, or DOM nodes
  - _Requirements: 2.4, 6.1, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 7. Visual verification and screen layer calibration
  - [x] 7.1 Verify phone screen layer alignment
    - Load page in a portrait viewport with cleared `sessionStorage`
    - Visually confirm `.intro-screen-layer` aligns with the screen area of `phone.png`
    - Adjust `top`, `left`, `width`, `height`, `border-radius` values in `intro.css` until pixel-perfect
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 7.2 Verify laptop screen layer alignment
    - Load page in a landscape viewport with cleared `sessionStorage`
    - Visually confirm `.intro-screen-layer` aligns with the screen area of `laptop.png`
    - Adjust calibration values in `intro.css` until pixel-perfect
    - _Requirements: 5.1, 5.2, 5.5_

  - [x] 7.3 Verify session skip behavior
    - Reload page without clearing `sessionStorage` — confirm no overlay flash and no DOM injection
    - _Requirements: 1.1, 1.3, 6.1_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations each
- JS only ever adds CSS classes to trigger transitions — no inline `transition` or `style` manipulation
- Screen layer calibration values in `intro.css` are approximate and require visual verification against the actual PNG assets (Task 7)
