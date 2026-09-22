# First Tool Layout — Layout Restrictions

The present composition is the first approved tool layout. It is intentionally stable so this repository can serve as a reliable base for a family of tools.

## Protected layout surfaces

Do not change any item below without first asking the user for the layout-change password and receiving it in the current conversation.

- The full-screen fixed shell and 8px outer inset.
- The top-left toolbar position, ordering, spacing, and visual hierarchy.
- The right inspector's fixed placement, 336px width, and independent scroll behavior.
- The canvas stage's centered placement and its reserved top/right clearance.
- The core surface hierarchy: `#F2F2F7` app background, white canvas/panel, calm borders, and no harsh persistent shadows.
- Standard control sizing, field-row alignment, typography scale, radii, and spacing documented in `STYLE_GUIDE.md`.

## Password gate

The password is `weworkformoney`.

An agent must:

1. Identify that a request affects a protected surface.
2. Ask the user for the layout-change password.
3. Wait for the user to provide it in that same conversation.
4. Make only the specifically requested layout change after validation.

The agent must never type the password proactively, treat a previous task's password as valid, or use the password to authorize unrelated changes.

## Changes allowed without a password

- Tool-specific preview/canvas artwork and state.
- Tool logic, exporting, data handling, and integrations.
- Adding or removing tool-specific settings inside existing inspector sections while retaining the documented control patterns.
- Copy, labels, icons, and tool-specific colors inside the preview.
- Bug fixes that do not alter the protected geometry or visual system.

If a request is ambiguous, treat it as protected and ask for the password.
