# Snapshot Editor Flow Card Handoff

Date: 2026-03-30

Scope: desktop Snapshot Editor flow card cleanup in `web/src/app/pages/SnapshotEditorPageContent.tsx` and `web/src/app/pages/SnapshotEditorPage.css`.

Primary owner references:
- `web/src/app/pages/SnapshotEditorPageContent.tsx`
- `web/src/app/pages/SnapshotEditorPage.css`
- `web/src/app/components/Displays/SegmentedLedText.tsx`
- `web/src/app/components/Displays/SegmentedLedText.css`
- `web/src/app/theme/themes.ts`
- `web/src/app/theme/carbonPalette.ts`

## Intent

Reduce visual thickness, remove obsolete utility chrome, and promote the channel identity.

The card should read in this order:

1. Channel letter
2. Channel volume
3. Mute / Solo
4. Dense metadata strip
5. Assign-to-node action

## Decisions Locked

- Keep the channel letter tile treatment as-is.
- Keep LCD-style segmented numbers for volume only.
- Move the volume readout beside the channel letter.
- Make the card borderless and flatter.
- Remove the pencil icon.
- Replace the current node-assignment glyph with a Carbon node icon plus the label `Assign`.
- Use compact flat-text `M` and `S` controls.
- Show mute / solo state with both text color and an overlay on the channel tile.
- Keep the metadata on a single dense line.
- Make the card shorter than the current implementation.

## Icon Decision

Platform default node icon: `Network_3` from `@carbon/icons-react`.

Reason:
- It already exists in the product surface for Audio Nodes.
- It reads as a connected node cluster instead of a generic hyperlink.
- It is a better semantic fit than `Link`, which implies relationship/connection rather than destination node identity.

Rule:
- Anywhere the product refers to a cluster node, audio node, or node assignment action, default to `Network_3` unless the surface is explicitly about network topology.

## Remove From The Current Card

- The visible outer border on the card.
- The visible service-bar container and its dividers.
- The pencil/edit icon button.
- The speaker icon plus `Level` label next to the volume control.
- Boxed utility-button styling for mute, solo, and assignment actions.
- The separate routing-summary bar treatment as its own heavy block.

## Keep But Compress

Keep these details, but move them into one compact metadata strip:

- `loaded blocks`
- `Selected`
- `Live path`
- `100% blend`
- `I/O routing`
- `2 in / 2 out`
- `48K / 256`
- `MIX`
- `LOCAL ONLY`

## Desktop Layout Spec

Target card height:
- 52px overall visual height

Target internal structure:
- 2 rows
- Row 1: metadata strip
- Row 2: primary controls

Card padding:
- 4px top
- 10px right
- 6px bottom
- 10px left

Grid:
- Column 1: identity cluster
- Column 2: flexible spacer
- Column 3: `Assign` action

Row 1:
- Single-line metadata strip
- Height: 10px text on a 12px line box
- No wrap
- No ellipsis on desktop
- Tight separators: ` / `

Row 2:
- Min height: 30px
- Vertical alignment: centered

## Row 2 Order

Left-of-center identity cluster:

1. Channel tile
2. Volume readout
3. `M`
4. `S`

Far right:

5. `Network_3` icon + `Assign`

## Measurements

Channel tile:
- 32px x 32px
- Same fill treatment as the current card
- Same letter weight and contrast as the current card

Gap from channel tile to volume:
- 8px

Volume readout:
- Optical height: about 22px
- Use segmented LCD digits only
- No boxed window
- No surrounding dark field
- Show the numeric value with `%`

Mute / Solo text actions:
- Font size: 11px
- Weight: 600
- Letter spacing: 0.08em
- Gap from volume to `M`: 10px
- Gap between `M` and `S`: 8px
- Render as flat text, not pills and not boxed toggles

Assign action:
- Icon size: 16px
- Label size: 11px
- Gap between icon and label: 6px
- Hit area height: 28px minimum

## Metadata Strip Content Order

Exact order:

`loaded blocks / Selected / Live path / 100% blend / I/O routing / 2 in / 2 out / 48K / 256 / MIX / LOCAL ONLY`

Rules:
- Keep all text visible on desktop.
- Use separators instead of badges.
- Do not promote any metadata item to a boxed chip.
- Keep the strip visually subordinate to the channel tile and volume.

## Interaction Rules

Channel tile:
- Still selects the card/channel.

Volume:
- Remains the primary editable control.
- Interaction should stay on the volume readout area.
- Resting state should look flat.
- If a drag/track affordance is needed, reveal it only on hover/focus and keep it visually secondary.

Mute / Solo:
- Click target is the text itself plus a small invisible hit-area buffer.
- `aria-pressed` remains required.

Assign:
- Opens the existing assign-to-node modal.
- Replace the current link-style icon with `Network_3`.

Metadata strip:
- Clicking the strip can continue to open routing details if needed, but it must no longer look like a separate bordered tool group.

## State Treatment

Default:
- Borderless card
- Flat surface
- Metadata quiet
- Volume prominent

Hover:
- Use only a subtle layer shift
- No border reveal
- No heavy glow

Selected / active:
- Indicate with a background-step or selected-layer tint
- Do not reintroduce a hard outline around the card

Solo active:
- `S` text uses warning color
- Add a subtle warning overlay on the channel tile

Mute active:
- `M` text uses danger color
- Add a stronger danger overlay on the channel tile

Mute + solo together:
- Mute overlay wins
- Preserve solo with a smaller secondary marker, such as a thin warning inset edge on the tile

## Theme And Color Rules

The redesigned card must stop using hard-coded accent colors inside the card UI.

Use Carbon theme tokens from the active theme layer:

- Card background: `var(--cds-layer-01)` or a token-equivalent layer step
- Hover background: `var(--cds-layer-hover)`
- Selected background: `var(--cds-layer-selected)` or a token-equivalent selected mix
- Primary text: `var(--cds-text-primary)`
- Secondary text: `var(--cds-text-secondary)`
- Tiny metadata text: `var(--cds-text-helper)`
- Focus ring: `var(--cds-focus)`
- Solo state: `var(--cds-support-warning)`
- Mute state: `var(--cds-support-error)`
- Assign icon accent: `var(--cds-link-primary)`
- Assign label: `var(--cds-text-primary)`
- Channel tile text: `var(--cds-text-on-color)`

Volume LCD color:
- Replace the hard-coded `FLOW_CARD_LED_COLOR = '#59a8ff'`
- Derive the segmented readout color from the active theme
- Recommended default: `var(--cds-link-primary)`

LCD off-segment color:
- Use a token-derived mix
- Recommended default: `color-mix(in srgb, var(--cds-link-primary) 12%, transparent)`

## Theme Cleanup Required In The Current Owner

Current card-adjacent hard-coded color sources that should not survive the redesign:

- `FLOW_CARD_LED_COLOR = '#59a8ff'` in `SnapshotEditorPageContent.tsx`
- `SLOT_COLORS` literal hex palette in `SnapshotEditorPageContent.tsx`
- Flow-card border and service-bar emphasis that currently depend on literal or mixed non-token styling in `SnapshotEditorPage.css`

Required rule:
- The card must consume theme tokens or theme-derived values only.
- Channel-specific color is allowed only as the slot identity color.
- Slot identity colors should also move to a theme-aware palette instead of fixed hex values.

## Visual Hierarchy Rules

- The channel letter must be the first thing the eye lands on.
- The volume must be the second.
- Metadata must read as context, not as primary controls.
- `Assign` must be visible and clear, but it must not outrank the channel tile or the volume.
- The card should feel like one integrated strip, not three adjacent toolbars.

## Acceptance Criteria

- The card is visibly shorter than the current version.
- No visible outer border remains on the card.
- The pencil icon is gone.
- The channel tile remains unchanged in concept.
- The volume sits directly beside the channel tile.
- The volume is still the dominant editable control.
- `M` and `S` are flat text controls to the right of the volume.
- The metadata is a single dense line and stays fully visible on desktop.
- The far-right action reads `Assign` with the `Network_3` icon.
- Mute and solo each change text color and apply an overlay treatment to the channel tile.
- The card no longer relies on hard-coded card-level accent hex values.

## Implementation Notes For Engineering

Current implementation areas most likely to change:

- Replace the current header + service-bar composition in `SnapshotEditorPageContent.tsx`.
- Remove the boxed `FlowLevelControl` presentation and reuse only its edit behavior.
- Flatten or remove `juce-grid-page__flow-card-service-bar`, its dividers, and boxed action affordances in `SnapshotEditorPage.css`.
- Introduce a theme-derived flow-card LCD variable instead of `FLOW_CARD_LED_COLOR`.
- Replace node assignment usage of `Link` in the card with `Network_3`.

## Non-Goals

- Do not redesign the channel tile itself beyond the state overlays.
- Do not change the actual mute / solo behavior.
- Do not add new metadata beyond the listed details.
- Do not use decorative gradients, glows, or bevel effects on this card.
