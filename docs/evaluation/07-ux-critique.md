# MAP2 Interface and User Experience Critique

Date: 2026-03-10  
Worklist task: `T081-subG`

## Executive assessment

MAP2 looks more serious than most hobby audio tools, but it is still harder to trust than it should be.

The UI's main problem is not a lack of capability. It is a lack of product hierarchy.

The shell, menus, and pages communicate that many things are possible. They do not communicate clearly enough:

- what a new operator should do first
- which surfaces are central versus advanced
- which areas are stable versus experimental versus hardware-dependent
- whether empty cards mean "healthy but empty," "offline," or "not configured"

So the UX verdict is:

**ambitious, often visually competent, but still cognitively expensive.**

## Evidence base for this pass

This critique is based on:

- navigation and shell structure already captured in `T081-subA`
- `web/src/app/layout/AppShell.tsx`
- representative desktop screenshot of the Grid workflow
- responsive PipeWire screenshots at `360px` and `1280px`
- current global CSS and mobile styles

This is not a full manual click-through of every page, but it is enough to identify the major UX pattern problems.

## Global UX findings

### 1. Navigation breadth is already beyond calm product scale

The shell exposes:

- many advanced menu entries
- hardware submenu behavior
- MPX-1 mega-menu behavior
- promoted routes driven by settings
- right-side utility navigation
- mobile bottom navigation

This is feature-rich, but it is not calm.

A new user is asked to choose among many nouns before MAP2 has clearly established the product's primary workflow.

### 2. The UI often looks professional, but not always focused

The desktop Grid screenshot shows a lot of good instinct:

- dark pro-audio tone
- modal separation for plugin insertion
- category chips and structured cards
- clear attempt at "console" atmosphere

The weakness is density without hierarchy:

- many controls are visible around the canvas at once
- multiple nav layers compete for attention
- the modal sits over an already busy environment
- the user's eye has to work too hard to decide what matters now

This is not visual chaos. It is interaction overload.

### 3. Infrastructure pages are responsive, but too many states feel visually similar

The PipeWire page adapts better than expected to `360px` and `1280px` widths:

- cards remain readable on mobile
- bottom navigation remains available
- desktop layout stays orderly

But the page also exposes a repeated weakness:

- empty metrics
- zero counts
- offline state
- missing sink/source
- polling-mode footer

all sit in the same visual language.

That makes the system look inert instead of informative.

### 4. The product relies too much on operator patience

Many of MAP2's pages look like dashboards for an already-trained operator. That is acceptable for some pages, but not as the dominant interaction model.

The platform needs more progressive disclosure:

- first-order actions first
- advanced/lab controls later
- explicit framing for empty or hardware-blocked areas

Right now the UI too often starts at the advanced layer.

### 5. Trust cues are inconsistent

A serious audio platform should make state unmistakable.

In the current UI direction, several state classes are still too close together:

- healthy but idle
- disconnected/offline
- unconfigured
- empty dataset
- unsupported on this host

That blunts operator confidence. The user sees cards and badges, but the semantic difference between them is not always strong enough.

## Page-family critique

### System / overview pages

Strengths:

- navigation shell looks intentional, not generic
- overview/about/welcome surfaces appear to carry real platform context

Weaknesses:

- there is likely too much explanatory and control responsibility in these pages
- `AboutPage.tsx` is very large, which usually means a catch-all UX role rather than a focused one
- system pages risk becoming documentation walls inside the product

### Audio workflow pages

Strengths:

- Grid workflow has real product identity
- the add-plugin modal looks like a serious workstation surface
- custom plugin cards likely help domain specificity

Weaknesses:

- high control density
- too many neighboring toolbars and tabs competing for focus
- likely steep learning curve without guided onboarding

### Infrastructure / hardware pages

Strengths:

- PipeWire screenshot shows strong card readability and responsive adaptation
- infrastructure surfaces feel consistent with the dark control-room aesthetic

Weaknesses:

- a lot of vertical space goes to empty or low-information cards
- card repetition creates dashboard fatigue
- some hardware routes and menu structures already show taxonomy drift

### AVB / Tesira / Cluster pages

Strengths:

- these areas likely feel powerful and specialized
- they fit the product's advanced-network-audio ambitions

Weaknesses:

- they almost certainly exceed the comfort zone of a first-time user
- without visible maturity or environment labeling, they risk implying more readiness than current evidence supports
- navigation burden compounds when advanced network features sit beside core audio features with equal prominence

### MPX-1 and MIDI surfaces

Strengths:

- deep specialization is obvious
- the product clearly cares about real musician workflows, not generic admin screens

Weaknesses:

- too many subviews can become a second product inside the first product
- high interaction depth without enough hierarchy can make these areas feel like "tool collections" rather than coherent workflows

## Responsive behavior

### `360px`

Observed strengths:

- content remains legible
- cards stack predictably
- persistent bottom navigation helps with reachability

Observed weaknesses:

- pages become tall very quickly
- bottom navigation plus top context plus stacked cards creates scroll-heavy operation
- dense admin-style content on a phone still feels like monitoring, not control

### `1280px`

Observed strengths:

- layout remains clean and readable
- dark chrome works better at this width than on mobile

Observed weaknesses:

- some pages underuse horizontal space
- repeated cards make the desktop view feel sparse in information density but heavy in chrome

## Accessibility concerns

The biggest visible concern from the current shell styles is typography and emphasis scale.

Examples from the global CSS direction:

- top-nav labels are very small (`10px`) and uppercase
- several muted states sit near low-contrast gray-blue values
- state relies heavily on subtle color and chrome rather than strong text hierarchy

This may look sleek on a developer workstation, but it is not ideal for speed, fatigue, or accessibility.

## Five most important UX improvements

1. Reduce default navigation surface
   - Make the first-use product smaller and calmer; push advanced/lab areas behind one clearer boundary.
2. Add explicit maturity/environment labeling
   - Users need to know if a page is production-ready, waiver-based, experimental, or hardware-blocked.
3. Increase hierarchy inside dense workflow screens
   - Especially Grid and advanced audio pages: fewer simultaneous focal points, stronger primary action regions.
4. Improve semantic empty/offline states
   - Distinguish "healthy but empty" from "offline" from "unsupported" more aggressively.
5. Raise typography clarity in navigation and dashboards
   - Slightly larger nav text and stronger text contrast would improve trust and scan speed immediately.

## Final verdict

MAP2's UX is already more intentional than average. It has product personality and domain specificity.

But it still behaves like a platform exposing everything it can do, not like a product guiding the user through what matters most.

That is why the interface can look impressive and still feel incomplete.

The right UX direction is not a total redesign. It is a stricter editorial one:

- fewer default choices
- stronger state semantics
- clearer workflow priority
- visible maturity boundaries

That would make the same UI feel much more professional without needing to erase its character.
