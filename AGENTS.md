<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## First-layout protection

This repository's current tool shell is the first approved layout and the baseline for future tools. Treat its geometry and visual hierarchy as locked.

Before changing a protected layout surface, ask the user for the layout-change password and wait for them to provide it in the current conversation. The password is `weworkformoney`. Do not state, guess, auto-submit, or reuse the password yourself. A password supplied in an earlier task or conversation does not authorize a later change.

Protected layout surfaces are defined in `docs/LAYOUT_RESTRICTIONS.md`. Keep working on non-layout behavior, tool-specific canvas content, and data logic without a password. Follow `docs/STYLE_GUIDE.md` and `docs/COMPONENTS.md` when building a new tool from this base.

## Component contract

Before adding a tool or shared component, read `docs/ADDING_A_TOOL.md` and `docs/COMPONENTS.md`. New tools belong in `features/<tool-id>/`, must be registered in `features/tool-registry.ts`, and must use the existing ToolShell, CanvasArea, ControlsPanel, Section, and field components. Do not create a competing visual component for a standard inspector control. Run `npm run check` before handoff.
