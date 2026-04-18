# Stage Notification Surface Design Brief

Date: 2026-04-17

Status: Design brief only. This handoff does not implement product changes.

Primary intent:

- Recast MAP2 notifications as a live-audio alert surface with broadcast-style urgency, Carbon discipline, and snapshot-first operator context.
- Replace the current feeling of scattered toast cards with a unified banner-and-rail system that reads clearly on stage.

Primary source files:

- `web/src/app/components/Toasts.tsx`
- `web/src/app/App.tsx`
- `web/src/app/components/NodeAlerts/NodeAlertToast.tsx`
- `web/src/app/hooks/useAlertNotifications.tsx`
- `web/src/app/pages/SnapshotEditorPageContent.tsx`
- `web/src/app/components/snapshots/SnapshotModalContent.tsx`
- `web/src/app/components/snapshots/SnapshotDeployModal.tsx`
- `web/src/app/pages/SnapshotPublishPage.tsx`
- `web/src/app/utils/snapshotActivationToast.ts`

## Product Read

The current notification language is product-generic. It behaves like a collection of temporary web messages.

The requested surface is different:

- It should feel operational.
- It should feel staged.
- It should be understandable under pressure.
- It should privilege one obvious message over many competing small boxes.

This is not a request for "nicer toasts." It is a request for a new alert grammar.

## Emotional Target

The operator should feel:

- immediately oriented
- never surprised about where to look
- confident that the most dangerous condition is the most visible one
- reassured by calm persistence after the initial warning burst

The operator should not feel:

- buried in chatter
- forced to read developer wording
- unsure whether a live snapshot is active
- interrupted by trivial success spam

## Design Direction

### Carbon as baseline, not cage

Carbon should guide spacing, information discipline, icon clarity, and accessibility.

The notification surface may stretch beyond stock Carbon component shapes when needed to achieve:

- a full-width lower-screen banner
- a floating right collapsed rail
- ticker-like secondary motion
- adaptive layout templates for different alert classes

This should still look like MAP2, not a pasted-in TV graphic and not a stock enterprise dashboard.

### Broadcast grammar, restrained use

The reference mood is a broadcast alert chyron:

- dominant alert zone
- strong palette ownership by severity
- left-anchored icon and headline
- temporary takeover for the first moment of danger

The mistake to avoid is visual cosplay. Borrow the grammar, not the branding.

## Layout Model

### Expanded state

The expanded state owns the lower full width of the viewport and should read as the system's main alert stage.

It should include:

- one dominant primary alert region
- optional subordinate secondary strip
- optional ticker lane for accumulating urgent but non-primary events

The expanded state must push the rest of the UI upward. It should not feel like a popup obscuring content at random.

### Collapsed state

The collapsed state becomes a floating right rail roughly one quarter of the screen width.

It is not a summary badge. It is a compact alert surface.

Rules:

- icon-forward
- color-forward
- very few words
- still unmistakably tied to the expanded system

An item in the rail should feel like a compressed version of the main alert, not a different widget family.

### Live snapshot presence

When a snapshot is live and the operator is not in the Snapshot Editor, the surface should present a persistent live snapshot banner.

That banner should be:

- pinned
- hidable
- read-only
- informative at a glance

It should communicate:

- what is live
- what scope it covers
- what the last meaningful state is

It should not become a button farm.

## Information Hierarchy

### Primary

Primary content should answer:

1. What demands attention now?
2. Is audio continuity at risk?
3. What live snapshot state matters right now?

Examples:

- output disconnected
- engine failed
- live snapshot recovered
- deploy failed on target node

### Secondary

Secondary content may include:

- follow-on workflow results
- related node failures
- progress milestones
- queued or merged sub-events

Secondary content should never compete with the main headline.

### Tertiary

Ticker-level or compact rail content can carry:

- accumulating lower-priority alerts
- repeated degraded confirmations
- supportive context while the main alert remains stable

## Visual Language

### Critical

- background: red
- foreground: white
- icon: left anchored
- motion: strongest during initial takeover, calmer after downgrade

### Warning

- background: yellow
- foreground: black
- icon: black
- motion: assertive but less severe than critical

### Recovery

- visually calmer than warning and critical
- still visible long enough to confirm that the situation improved

### Live snapshot

- authoritative and steady
- not alarm-colored unless the live state itself is degraded
- should read like "current live condition" rather than "toast"

## Snapshot-Specific Brief

Snapshot notifications deserve bespoke templates.

High-value content includes:

- snapshot name
- operation: publish, activation, deactivation, deploy, recover
- target node or scope
- channels or paths affected
- result summary

Expandable or richer detail is appropriate for:

- affected channels
- affected blocks
- destinations
- failure causes

These should feel like compact mission summaries, not sentence-only snackbars.

## Motion

Motion rules:

- initial critical/warning alerts may rise in from below into full-width takeover
- the persistent state after takeover should calm down quickly
- merges should feel fluid, not like destroying one card and replacing it with another
- layout reflow when expanding/collapsing should feel intentional and premium

Avoid:

- constant shimmer
- multiple competing transitions
- playful motion during severe states

## Copy Tone

Use:

- operator language
- direct source labels
- concise remediation

Avoid:

- stack traces
- backend jargon as the first line
- low-value congratulations for routine background actions

Preferred structure:

- headline
- scope/source
- next relevant detail

## Anti-Goals

Do not build:

- a notification inbox
- a generic dashboard feed
- a dense debugging console disguised as alerts
- a second persistent control surface inside the live banner

Do not normalize everything into identical rectangles. The whole point is to let severity and context change the composition.

## Stage-Use Heuristics

Make industry-standard live-audio choices:

- signal-path continuity outranks snapshot state
- disconnected outputs outrank convenience workflow notices
- live snapshot identity stays visible when conditions are normal
- the operator should not have to read a paragraph to understand severity

If a designer is forced to choose between density and clarity in the primary zone, choose clarity.

## Deliverable For Implementation

The implementation should produce:

- one reusable notification surface language
- custom templates for critical, warning, recovery, live snapshot, and major snapshot workflow states
- a bottom full-width expanded banner
- a floating right compact rail
- adaptive in-place merging behavior

The end result should feel like MAP2 finally has an alert surface worthy of a live guitar system instead of an app-wide pile of miscellaneous toasts.
