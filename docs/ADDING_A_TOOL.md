# Adding a Tool to Potatoo Tool

Potatoo Tool hosts multiple creative tools in one Next.js app. A tool is a feature, not a separate layout. This protects the common workflow while making the canvas and controls completely tool-specific.

## Required files

Create a folder at `features/<tool-id>/`:

```text
features/<tool-id>/
├── defaults.ts       # Typed initial state and option lists
├── <tool-id>-tool.tsx # Client component with canvas and inspector
└── export-image.ts   # Export/download behavior, if applicable
```

## Registration

Add an entry to `features/tool-registry.ts`:

```ts
{
  id: "my-tool",
  label: "My Tool",
  description: "One-line explanation of its job.",
  href: "/tools/my-tool",
}
```

Then add the matching `case` in `app/tools/[toolId]/page.tsx`. The left tool dropdown reads this registry, so no separate navigation change is necessary.

## Component contract

Your client component must use the shared `ToolShell`, `CanvasArea`, and `ControlsPanel`. Build settings from `Section` and the shared field components. Keep all tool-specific styles within the preview; do not modify the shared shell to accommodate a tool.

If the requested work affects a protected layout surface, follow the password gate in `LAYOUT_RESTRICTIONS.md` before changing anything.

## Before handoff

Run:

```bash
npm run check
```

Confirm the tool selector opens, the current tool is marked active, every visible control changes the canvas, reset restores all defaults, and export creates the expected file.
