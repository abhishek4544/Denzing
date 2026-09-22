# First Tool Layout — Component Reference

Import shared tool UI from `@/components/tool-shell`. Build a new tool inside `features/<tool-id>/`, then route it through `app/tools/[toolId]/page.tsx`. Keep tool-specific state, canvas behavior, and exporting in its feature folder.

| Component | Responsibility | Use it for |
| --- | --- | --- |
| `ToolShell` | Fixed full-viewport frame, 8px inset, top-left toolbar | Every tool page |
| `Topbar` | Tool selector and primary export action | Normally supplied by `ToolShell` |
| `SizeControls` | Width, height, unit, and orientation controls | Canvas-size tools |
| `CanvasArea` | Centered preview stage, clear of toolbar and right panel | Tool-specific preview/canvas |
| `ControlsPanel` | Fixed right-side inspector with title, byline, icon, reset | Settings for the active tool |
| `Section` | Expandable inspector group | Related settings |
| `FieldRow` | Consistent label/control alignment | Custom fields that fit the standard row |
| `TextField` | Standard text input | Short textual value |
| `SelectField` | Standard option chooser | Finite value sets |
| `ColorField` | Color swatch, hex input, opacity | Color properties |
| `SliderField` | Stepped numeric slider with audible tick | Numeric ranges |
| `ToggleField` | Boolean setting with audible tick | On/off settings |
| `SectionButton` | Full-width muted utility button | Secondary action within a section |

## Composition contract

```tsx
<ToolShell
  toolLabel="Tool name"
  tools={tools}
  activeToolId="tool-id"
  topbarExtras={<SizeControls {...sizeProps} />}
>
  <CanvasArea>{/* tool-specific preview */}</CanvasArea>
  <ControlsPanel title="TOOL">
    <Section title="Content">
      <TextField {...textProps} />
      <SliderField {...sliderProps} />
    </Section>
  </ControlsPanel>
</ToolShell>
```

Keep component behavior controlled: field values and callbacks belong to the tool page or its feature-specific hooks. Do not fork shared shell components for a tool-specific visual preference; add a small, reusable prop only when the variant is broadly useful and remains within the style guide.

## Component constraints

- `CanvasArea` expects content that can size itself within the available stage.
- `ControlsPanel` is the inspector; sections scroll inside it rather than expanding the app viewport.
- `FieldRow` standard controls occupy a 177px right column; prefer its `stacked` form only when a control needs the full field width.
- `SliderField` takes `min`, `max`, and `step`; keep its audio enabled unless a value changes continuously or has an unsuitable auditory consequence.
- All field components require a clear label for accessibility.

## Mandatory rules for future components

- Use the shared field components for standard inspector inputs. Do not create a visually different text field, select, slider, toggle, or color control inside a tool feature.
- Use semantic HTML, keyboard access, and an accessible label for every new control.
- Use the design tokens from `app/globals.css`; do not hardcode a competing palette, radius scale, or persistent shadow.
- Keep reusable UI in `components/tool-shell/`; keep tool-only behavior in `features/<tool-id>/`.
- Run `npm run check` after adding or changing a component.
- Document a broadly reusable component here before asking other tools to depend on it.
