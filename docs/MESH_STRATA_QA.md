# Mesh Strata QA — 25 September 2026

Scope: local editor, shared input behavior used by Mesh Strata, preset import, video export flow, and source review of renderer lifecycle. This is not a cross-device performance certification.

## Fixed

- Selects displayed raw IDs instead of readable option labels; added explicit accessible names as well.
- Slider keyboard arithmetic could accumulate floating-point digits. Keyboard changes now use the same snapping as pointer/input changes, and displayed values remove floating-point noise.
- Cancelled pointer gestures could leave a slider dragging. Pointer cancellation now ends the gesture.
- “Download again” and the success message could refer to an old clip after changing export options. Results are now keyed to the exact format/options.
- A completion racing with dialog closure could create a download after cancellation. Added a final abort check before creating the URL, plus a synchronous guard against duplicate jobs.
- Export cancellation could wait on a paused animation frame. Initialization frame waits now respond to aborts.
- A failed font request stayed cached as a rejected promise, and label effects could reject without handling the error. Failed requests can retry; preview labels use a fallback if loading fails.
- Preset imports accepted wrong types and excessive grid counts. Mesh Strata now validates known values, enum options, nullable overrides, array lengths, layer count, and the primary geometry-allocation settings before updating the scene. Older partial presets inherit defaults.

## Verified this audit

- Initial inspector sections are closed; opening Camera closes Stack.
- Final defaults include camera speed 21 and FOV 29; Reset uses the same default object.
- Keyboard increment of Plane Size from 12.8 displays 12.9.
- Custom ratio 100:1 is rejected; Cancel preserves the current ratio.
- Select triggers show readable labels and export dimensions.
- Cancel export returns to usable controls; the next WebM export succeeds.
- Changing duration after export removes the old Download again action and success message.
- Downloaded WebM: 1920×1858, 30 frames, one second, matching the Auto preview proportions.
- Preset checks: current defaults and supplied Final JSON match; partial presets and nullable overrides work; eight invalid payload cases reject.
- No browser console errors during the exercised flows.
- `npm run check` passes: lint, TypeScript, production build, and regenerated website-code template. `git diff --check` passes.

## Limits and remaining coverage

- MP4/4K and standalone ZIP builds were verified in earlier implementation passes; this audit reran WebM cancellation/retry, not every codec/resolution combination.
- Font outage/retry and the precise close/completion race were reviewed in code, not fault-injected in the browser.
- Safari, Firefox, mobile GPUs, and long-duration memory/performance soak tests remain untested. The detailed glass scene can still be expensive on weaker devices.
- Video exports start animation from its initial phase; they preserve camera framing but do not capture the exact elapsed simulation phase of the editor.
- These changes are local; no deployment was performed as part of this audit.
