# First Tool Layout — Style Guide

This is the first approved layout for the tool family. Use it as the visual baseline for every new tool unless a layout change is explicitly authorized.

## Principles

- Calm, utility-first, iOS-inspired control surfaces.
- Light depth only: use borders and contrast before shadows. Avoid harsh or elevated card shadows.
- Keep the workspace quiet so the tool's canvas stays the visual focus.
- Prefer compact, consistently sized controls over decorative styling.

## Color

| Token | Value | Use |
| --- | --- | --- |
| App background | `#F2F2F7` | Full viewport and muted control fills |
| Surface | `#FFFFFF` | Canvas and primary panels |
| Panel header | `#F9F9F9` | Controls-panel header and tool selector |
| Foreground | `#000000` | Primary text, fill state, primary action |
| Muted text | `#8E8E93` | Byline and secondary metadata |
| Border | `#E9EAEB` | Surface separation |
| Inactive switch | `#D1D1D6` | Toggle off state |

Use the CSS variables in `app/globals.css` (`--background`, `--card`, `--foreground`, `--muted`, and `--border`) instead of repeating token values when possible. The required page background is `#F2F2F7`.

## Typography

Use Geist Sans as the default UI family. Inter Tight is available for tool-specific expressive canvas content.

| Element | Size | Weight | Notes |
| --- | ---: | --- | --- |
| Panel title | 18px | 600 | Uppercase, tight tracking |
| Tool selector / export | 14px | 500 | Top bar controls |
| Section title / reset / dimensions | 12px | 500 | Standard utility label |
| Field values | 11px | 500 | Inputs and selects |
| Field labels / numeric readouts | 10px | 500 | Compact control metadata |
| Author/byline | 10px | 500 | Muted foreground |

Use tabular numerals for dimensions, percentages, and slider values. Keep tracking subtly tight (`-0.1px` to `-0.18px`) only where it is already used by the baseline components.

## Shape, borders, and depth

- Main panel: 10px radius, 1px border.
- Buttons: 8px radius.
- Compact input controls and sliders: 6px radius, 30px height.
- Use `border-border` for container boundaries and `#F2F2F3` for fine input boundaries where the component already establishes that token.
- Do not use `shadow-sm`, `shadow-md`, or visually strong custom shadows on persistent layout surfaces. The tiny toggle-thumb shadow is an intentional exception because it conveys its physical control state.

## Interaction

- Hover states use a small background or opacity change, never a jump in elevation.
- Keyboard focus uses a restrained ring (`ring-ring/40`).
- Sliders and toggles use the shared `useTick` sound; it is low-volume and respects reduced-motion preference.
- Preserve accessible labels, ARIA slider values, and visible keyboard focus.
