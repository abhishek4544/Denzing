# Potatoo Tool

Potatoo Tool is a Next.js platform for a collection of focused creative tools. It provides one stable canvas-and-controls layout, shared inspector components, and a tool switcher. The first included tool is **Thirdfactor Thumbnail**.

## Start the app

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js. The root route redirects to the default tool at `/tools/thirdfactor-thumbnail`.

## Quality checks

```bash
npm run check
```

This runs linting, type checking, and the production build. Run it before sharing or publishing the starter.

## Push updates to GitHub and Vercel

Commit your changes, then use the checked push command:

```bash
git add <files-you-changed>
git commit -m "Describe your change"
npm run push
```

`npm run push` runs all quality checks before pushing the current branch. If a
check fails, it stops before the push so you can fix the error locally. Only
committed changes are pushed. Vercel's GitHub integration deploys updates to
`main` automatically; other branches receive preview deployments when enabled
in the Vercel project.

## Add a tool

1. Add the tool definition to `features/tool-registry.ts`.
2. Create a feature folder in `features/<tool-id>/` containing the tool's settings defaults, client component, and export logic.
3. Add a case for the tool ID in `app/tools/[toolId]/page.tsx`.
4. Compose the feature with the shared `ToolShell`, `CanvasArea`, `ControlsPanel`, and field components.

The selector will automatically include any tool registered in the registry. Read [the component reference](docs/COMPONENTS.md) and [the adding-a-tool guide](docs/ADDING_A_TOOL.md) before creating one.

## Layout and styling rules

The layout is intentionally stable. Follow `docs/STYLE_GUIDE.md`, `docs/COMPONENTS.md`, and `docs/LAYOUT_RESTRICTIONS.md`. Agent-specific rules are in `AGENTS.md`.
# Denzing
