# Requirements Document

## Introduction

A fullscreen intro animation overlay that plays once per browser session on the portfolio website (manav.win). The overlay renders a centered device image (phone or laptop depending on orientation) with a screen layer that zooms into the background image, creating a cinematic "enter the screen" effect before removing itself from the DOM. Session state is tracked via `sessionStorage` so the animation only plays once per tab session.

## Glossary

- **Overlay**: The `<div id="intro-overlay">` element — a fullscreen fixed container covering the entire viewport at `z-index: 9999`.
- **Device_Image**: The `<img>` element inside the Overlay showing either `assets/images/laptop.png` (landscape) or `assets/images/phone.png` (portrait).
- **Screen_Layer**: A `<div>` absolutely positioned over the Device_Image, aligned precisely to the screen area of the device image, containing the Background_Image.
- **Background_Image**: `assets/images/1.1.webp` displayed inside the Screen_Layer with `object-fit: cover`.
- **Device_Container**: The wrapper `<div>` that holds both the Device_Image and Screen_Layer, centered in the Overlay.
- **Session_Controller**: The JavaScript logic in `intro.js` that reads and writes `sessionStorage` to determine whether to play or skip the animation.
- **Animation_Timeline**: The sequence of timed CSS transitions and JavaScript `setTimeout` calls that drive the animation from start to DOM removal.
- **Orientation_Detector**: The logic that evaluates `window.innerWidth < window.innerHeight` to select the appropriate device image.

---

## Requirements

### Requirement 1: Session-Based Playback Control

**User Story:** As a returning visitor within the same browser tab session, I want the intro animation to play only once, so that it does not interrupt my browsing after the first load.

#### Acceptance Criteria

1. WHEN the page loads and `sessionStorage.getItem('introPlayed')` returns `'true'`, THE Session_Controller SHALL remove the Overlay from the DOM immediately without playing any animation.
2. WHEN the page loads and `sessionStorage.getItem('introPlayed')` does not return `'true'`, THE Session_Controller SHALL set `sessionStorage.setItem('introPlayed', 'true')` and proceed to run the Animation_Timeline.
3. THE Session_Controller SHALL execute its check synchronously before the first rendered frame to prevent any flash of the Overlay on repeat visits.

---

### Requirement 2: Overlay Structure and Isolation

**User Story:** As a developer, I want the overlay to be fully self-contained and non-destructive, so that it does not affect any existing page styles or layout after it is removed.

#### Acceptance Criteria

1. THE Overlay SHALL be inserted as the first child of `<body>` with `id="intro-overlay"`.
2. THE Overlay SHALL use `position: fixed; inset: 0; z-index: 9999; background: #000; overflow: hidden` so it covers the full viewport without affecting document flow.
3. WHEN the Animation_Timeline completes, THE Overlay SHALL be removed from the DOM entirely using `element.remove()`.
4. THE Overlay SHALL NOT modify any existing CSS classes, inline styles, or DOM nodes outside of itself.
5. THE Overlay SHALL NOT prevent scrolling or interaction with the page after it is removed.

---

### Requirement 3: Device Orientation Detection

**User Story:** As a mobile user in portrait mode, I want to see a phone device frame, and as a desktop or landscape user I want to see a laptop device frame, so that the animation feels native to my device.

#### Acceptance Criteria

1. WHEN `window.innerWidth < window.innerHeight` at script execution time, THE Orientation_Detector SHALL select `assets/images/phone.png` as the Device_Image source.
2. WHEN `window.innerWidth >= window.innerHeight` at script execution time, THE Orientation_Detector SHALL select `assets/images/laptop.png` as the Device_Image source.
3. THE Orientation_Detector SHALL evaluate orientation once at script start and SHALL NOT re-evaluate during the animation.

---

### Requirement 4: Animation Timeline

**User Story:** As a first-time visitor, I want to see a smooth cinematic intro animation, so that the portfolio makes a strong first impression.

#### Acceptance Criteria

1. AT 0ms, THE Animation_Timeline SHALL display the Overlay as a black screen with the Device_Container centered and the Device_Image at `opacity: 0`.
2. WHEN the animation starts, THE Device_Image SHALL transition from `opacity: 0` to `opacity: 1` over 600ms using a CSS transition.
3. AT 800ms, THE Screen_Layer SHALL transition from `opacity: 0` to `opacity: 1` over a duration of 800ms using a CSS transition.
4. AT 1600ms, THE Device_Container SHALL apply `transform: scale(20)` and `opacity: 0` simultaneously, using `transition: transform 2s cubic-bezier(0.4, 0, 0.15, 1), opacity 2s ease`.
5. AT 2800ms, THE Overlay SHALL apply `opacity: 0` with `transition: opacity 1.1s ease`.
6. AT 4000ms, THE Animation_Timeline SHALL call `element.remove()` to remove the Overlay from the DOM.
7. THE Animation_Timeline SHALL use only `transform` and `opacity` CSS properties for all animated transitions to ensure GPU-composited rendering with no layout shifts.

---

### Requirement 5: Screen Layer Alignment

**User Story:** As a viewer, I want the background image to appear precisely inside the device screen area, so that the zoom effect looks realistic and polished.

#### Acceptance Criteria

1. THE Screen_Layer SHALL be positioned `absolute` within the Device_Container, with `top`, `left`, `width`, and `height` values that exactly match the visible screen area of the selected Device_Image.
2. THE Screen_Layer SHALL use `overflow: hidden` and a `border-radius` that matches the screen corner radius of the selected Device_Image.
3. THE Background_Image inside the Screen_Layer SHALL use `width: 100%; height: 100%; object-fit: cover` so it fills the screen area without distortion.
4. WHERE the phone device is selected, THE Screen_Layer SHALL use dimensions and offsets calibrated to `assets/images/phone.png`'s screen region.
5. WHERE the laptop device is selected, THE Screen_Layer SHALL use dimensions and offsets calibrated to `assets/images/laptop.png`'s screen region.

---

### Requirement 6: Performance and Rendering Constraints

**User Story:** As a user on any device, I want the intro animation to be smooth and not cause layout shifts or flashes of unstyled content, so that the experience feels professional.

#### Acceptance Criteria

1. THE Overlay SHALL be present in the DOM before the first paint by being injected via a `<script>` tag in `<head>` or as the first child of `<body>` in `index.html`, preventing any flash of unstyled content.
2. THE Animation_Timeline SHALL use only `transform` and `opacity` for animated properties, ensuring all transitions are handled by the GPU compositor without triggering layout or paint.
3. THE Overlay SHALL set `will-change: transform, opacity` on the Device_Container to hint the browser to promote it to its own compositor layer.
4. IF `sessionStorage` is unavailable (e.g., private browsing restrictions), THEN THE Session_Controller SHALL treat the session as a first visit and run the animation.
5. THE Overlay SHALL NOT load any external resources beyond the three local image assets already present in `assets/images/`.

---

### Requirement 7: File Integration

**User Story:** As a developer, I want the intro animation to be delivered as separate, self-contained files, so that it is easy to maintain or remove without touching existing code.

#### Acceptance Criteria

1. THE Animation_Timeline logic SHALL be implemented in a new file `assets/js/intro.js`.
2. THE Overlay styles SHALL be implemented in a new file `assets/css/intro.css`.
3. THE `index.html` file SHALL link `assets/css/intro.css` via a `<link>` tag in `<head>` before the existing `styles.css` link.
4. THE `index.html` file SHALL include `assets/js/intro.js` via a `<script>` tag placed before the closing `</body>` tag, before the existing `script.js` reference.
5. THE `assets/js/intro.js` file SHALL NOT import, require, or depend on any external libraries or the existing `script.js`.
