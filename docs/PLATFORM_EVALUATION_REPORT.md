# MAP2 Platform Evaluation Report

## 1. Executive assessment

MAP2 is an ambitious and technically serious audio-control platform with real implementation depth across engine control, MIDI, Tesira, AVB, cluster operations, plugin hosting, and diagnostics. It is not shallow. The platform's problem is not lack of code. The problem is that too much of the surface is only partially closed, weakly bounded, or presented as more production-ready than it really is.

The strongest short summary is this:

- completeness: substantial, but not finished end-to-end
- stability: promising, but still carrying failure-mode debt in core broadcast/recovery paths
- architecture: powerful, but too coupled and too route-driven
- bloat: materially higher than needed in both repository contents and product surface area
- latency/performance: plausible for purpose, but not governed by a disciplined measurement contract
- UX: functional, but overexposes advanced surfaces and maturity ambiguity
- theming: coherent identity, weak semantic communication
- API: broad, but not yet professional for external integrators
- gui professionalism: strong identity and serious intent, but still operator-hostile in hierarchy, density, and state communication
- market readiness: suitable for expert-led deployments with waivers, not yet excellent or broadly production-grade

## 2. Top strengths

### Strength 1. Real subsystem breadth

MAP2 has authentic platform breadth. The inventory documented `103` route modules, `227` service files, `38` frontend page modules, and `108` JUCE engine source files. That is not a toy stack. Major subsystems like Tesira, MIDI Hub, cluster management, AVB, snapshots, synth workflows, and DSP control have real implementation weight.

### Strength 2. Strong documentation and operational thinking in key areas

The repo already contains substantial qualification and operational material, including rollout/backout runbooks, AVB qualification guidance, runtime profile controls, and evidence documents. That raises MAP2 above many feature-rich but operationally immature systems.

### Strength 3. A coherent product identity exists

The UI is not visually random. The dark blue theme, dashboard language, and control-heavy interface establish a recognizable identity. The system feels like one product rather than a set of unrelated demos.

### Strength 4. The API and realtime surfaces are already broad enough to matter

MAP2 currently exposes `1106` OpenAPI paths, `1227` HTTP operations, `9` WebSocket routes, and `29` source-inferred event/message types. The platform is already far enough along that API discipline and contract governance now matter.

### Strength 5. The platform's core issue is closure, not imagination

This is valuable because closure problems are solvable. The evaluation did not find a hollow product pretending to have capabilities. It found a platform with too many partially-closed surfaces, too much coupling, and too little maturity signaling.

## 3. Top weaknesses

### Weakness 1. Readiness is overstated by the product surface

The completeness review found no major subsystem that clearly qualifies as fully complete. The UI and navigation still flatten production-grade and experimental workflows into the same visual tier, which overstates readiness.

### Weakness 2. Core reliability still depends on fragile recovery and broadcast loops

The stability review found three especially important risks:

- PipeWire recovery may self-destabilize the system under repeated fault conditions.
- MIDI broadcast uses an unbounded queue.
- WebSocket broadcast lacks slow-client isolation.

Those are not cosmetic issues. They sit near the heart of runtime resilience.

### Weakness 3. The control plane is over-coupled

Routes orchestrate too much directly, `juce_engine_service` has an overly wide import blast radius, and `AppShell` carries too much responsibility for navigation policy, taxonomy, and state. The result is a platform that can grow features faster than it can keep boundaries clean.

### Weakness 4. The repository and product surface both carry avoidable bloat

The audit found major bloat in tracked build artifacts, scraper families, oversized route/service hubs, and a frontend that exposes too many advanced or experimental surfaces by default.

### Weakness 5. Performance confidence is weaker than raw implementation capability

The platform likely can perform well enough for its intended role, but the evaluation found stronger implementation evidence than measurement discipline. Timing, jitter, xrun handling, and release-grade proof are not governed tightly enough.

### Weakness 6. The GUI does not yet meet professional audio control product standards

The interface has real identity and domain specificity, but falls short of the professionalism benchmark set by products in the same category. Blue is overloaded across too many semantic roles. Empty, offline, and fault states are visually indistinguishable at a glance. Navigation labels are sized for aesthetics rather than operator speed. Surface depth is too shallow for information-dense screens. Workflow screens lack clear primary action hierarchy. The net effect is an interface that requires more cognitive effort than it should.

### Weakness 7. The API is not external-platform grade

The API critique found a broad but weakly governed contract: mixed versioning, RPC-heavy naming, undocumented runtime error behavior, minimal example coverage, duplicate operation-ID warnings, and an event model that exists without a formal schema.

### Weakness 7. Visual hierarchy is too semantically flat

The theme is coherent, but too much of the product occupies the same cool-blue tonal range. The UI communicates atmosphere better than urgency, state, readiness, or workflow priority.

### Weakness 8. Navigation and information architecture do not protect operators from unfinished complexity

Advanced pages are too discoverable relative to their maturity, while higher-value operator workflows are not surfaced with enough task-first structure.

### Weakness 9. The platform still lacks a strong canonical environment/setup contract

`T081-subA` found that backend runtime dependency and environment truth are split across config code, direct `os.getenv()` reads, systemd units, and setup scripts. That weakens reproducibility and onboarding.

## 4. Bloat and removal candidates

The clearest bloat/removal candidates are:

- tracked build artifacts and local-build directories in the source repo
- accidental repository cargo such as `node_modules/` and large `build-*` trees
- scraper families that expand maintenance surface without strengthening MAP2's core appliance story
- oversized route and service hubs, especially where orchestration logic accumulates in one file
- UI entry points for unfinished or weakly qualified features that should be gated, relabeled, or quarantined
- frontend dependency layering that increases surface complexity without obvious operator value

The main recommendation is not blind deletion. It is discipline: make the product's core story smaller and more explicit, and move everything else behind maturity labels, advanced menus, or separate packages.

## 5. Latency and performance analysis

The performance story is mixed but fixable.

- The codebase contains serious low-latency engineering intent and evidence work.
- The evaluation's concern is not that MAP2 is obviously too slow.
- The concern is that the platform lacks a hard, living latency budget enforced by routine evidence collection.

Top bottlenecks or risks:

- recovery paths and background activity that can perturb audio stability
- insufficiently bounded broadcast/event fan-out behavior
- measurement and qualification gaps that let regressions hide until late

The platform needs fewer assumptions and more repeatable performance evidence.

### Latency Status (T096)

MAP2 now has a live callback-timing monitor contract (`/api/v2/latency/jitter-stats`, `timing_jitter` WebSocket stream) plus a gated evidence script (`scripts/measure_latency.sh`) that emits schema-validated artifacts. The latest baseline evidence is archived at `docs/fit-for-purpose-evidence/20260310/t096/latency_baseline.json` and currently shows a provisional `PASS` (`RTL p95=2.9667ms`, `jitter p95=0.0000ms`, `xruns=0`) from an `internal` method run; a physical loopback capture remains the required final publication-grade confirmation.

## 6. UX critique summary

The UI is capable, but it currently behaves more like an engineer's control warehouse than a disciplined operator product.

The five most important UX improvements are:

1. Separate default operator flows from advanced or experimental control surfaces
2. Make subsystem maturity explicit everywhere users choose workflows
3. Compress navigation around high-value tasks instead of subsystem sprawl
4. Improve state semantics so warning, degraded, experimental, offline, and healthy states are visually unmistakable
5. Reduce page-level density where the interface currently asks users to understand too much product structure at once

## 7. Theming critique summary

MAP2's theme has a real identity, but it needs a better semantic token system.

The most important theming directives are:

- keep the dark blue identity, but widen the semantic palette for health, warnings, destructive actions, and experimental states
- introduce stronger tonal contrast between navigation chrome and task-critical content
- use typography and spacing to create clearer operator hierarchy
- stop using the same color register for everything important
- tie maturity labels to consistent visual tokens so readiness is legible without reading surrounding prose

## 8. GUI professionalism analysis

This section synthesizes the UX and theming findings into a serious, specific assessment of what separates MAP2's current interface from a professional-grade audio control product, and what must change to close that gap.

### What "professional GUI" means for this product category

MAP2 occupies a space between a studio console, a broadcast control surface, and a live-event management platform. The reference class for "professional" in this space is not a generic SaaS dashboard. It is products like Biamp Tesira control panels, QSC Q-SYS Designer, Yamaha ProVisionaire, and to some extent Avid Pro Tools surfaces.

Those products share a set of visual and interaction properties that MAP2 does not yet fully exhibit:

- **State is unmistakable at a glance** — a professional audio control surface never requires you to read secondary text to know whether a signal path is active, degraded, or offline. Color, icon, and scale work together so that critical state jumps out without effort.
- **Hierarchy is load-bearing** — the interface tells you what matters now. Primary actions are large and prominent. Secondary actions are accessible but not competing. Advanced configuration is in a second tier.
- **Chrome is invisible when it is not needed** — professional audio UIs use their visual budget carefully. Navigation, borders, and background surfaces do not announce themselves; they recede and let content lead.
- **Density is earnable** — complex screens are allowed to be dense, but only once the user has chosen to go deep. Default views are calm.
- **Typography conveys trust** — labels are legible at speed, even under cognitive load. Navigation text that requires squinting to read destroys confidence in the product.

### Where MAP2 falls short today

#### 1. Blue overload destroys semantic range

The current palette uses blue (`#2563eb`, `#1e40af`, `#60a5fa`) for primary actions, active nav, selected states, card borders, informational accents, and general chrome.

This means the user's eye cannot use color to quickly read state. Active and inactive, important and decorative, primary and secondary all live in the same register.

**Fix:** Reserve bright blue for one job only — interactive selection and the single most important action on a screen. Move everything else to neutral or semantic treatments.

#### 2. Empty, offline, and idle states look identical

Cards that are healthy but empty, offline/unreachable, or simply unconfigured currently sit in visually similar presentations. This is a serious professionalism problem for an audio control product.

If a broadcast engineer looks at a PipeWire sink card during a show and cannot immediately tell whether the device is healthy, disconnected, or just empty, the interface is failing at its core job.

**Fix:** Empty-state cards need a distinct visual grammar — flat, muted, no border emphasis, clear explanatory text. Offline/fault states need assertive treatment — warm amber or red fill, not just a badge. Healthy-but-idle is neutral and calm.

#### 3. Navigation label scale is styled for appearance, not speed

Top navigation labels at `10px` uppercase with high letter-spacing look like design portfolio work. They do not serve fast scan-reading under pressure.

Professional control products use readable label sizes because their users are working, not admiring the interface.

**Fix:** Increase nav label size to at least `12px`–`13px`. Reduce or eliminate the letter-spacing. Strengthen contrast against the dark background.

#### 4. Surface depth is insufficient for information-heavy screens

The three surface levels — `#111111`, `#1a1a1a`, `#222222` — are too close together. On a screen with many cards, the page reads as a uniform field of near-identical tiles.

Professional dashboards use stronger card elevation, sharper edge contrast between background and surface, and deliberate use of slightly lighter or darker surface tones to create reading hierarchy within a panel.

**Fix:** Widen the gap between page background and card surface. Add a visible but not harsh edge to elevated cards. Use a lighter surface tone for modals and drawers so layer depth is physically obvious.

#### 5. Action hierarchy is not enforced

On workflow-dense pages like Grid, the primary action competes with nearby toolbars, tab strips, category chips, modal triggers, and surrounding nav. The user's eye has too many candidates for "what to do next."

Professional audio products designate a primary action region on each view. Everything else is subordinate or hidden until needed.

**Fix:** On each major view, identify the one primary action and give it unambiguous visual priority — larger, higher contrast, distinct treatment. Demote surrounding tools to secondary and tertiary tiers with clearly reduced visual weight.

#### 6. Maturity and capability signaling is absent

MAP2 currently presents experimental subsystems and production-grade surfaces with identical visual prominence. A first-time operator has no way to know which areas are battle-hardened and which are still under development.

Professional products either hide unfinished surfaces entirely, or use explicit labeling — "beta," "preview," "hardware required" — that is visually distinct and impossible to miss.

**Fix:** Introduce a consistent maturity tag system: four levels (stable, preview, experimental, hardware-required) with a fixed color/badge treatment, applied to every menu entry and page header for non-stable surfaces.

#### 7. Typography system is incomplete

The current font combination (`Space Grotesk` for navigation, system UI for body) is a reasonable starting direction, but the implementation does not create a clear typographic scale.

Dashboard numbers, card titles, section headers, labels, body copy, and fine print all need distinct size and weight slots. Without a scale, cards look compositionally arbitrary and reduce perceived professionalism.

**Fix:** Define a 6-level type scale (display, heading, subheading, body, label, caption) and apply it consistently. Dashboard metric values should be larger and heavier than their label. Section headers should be visually stronger than card content.

#### 8. Interaction states are not fully realized

Focus rings, hover states, active press feedback, and loading indicators are inconsistently implemented across the product. Professional audio UIs have precise, consistent interaction feedback — it communicates that every element behaves intentionally.

**Fix:** Audit every interactive element for focus, hover, and active states. Ensure consistency across all surface types. Loading states should use a purposeful indicator (not the browser default), and long operations should show progress, not just spinner.

#### 9. The product does not have a strong "home screen moment"

Opening MAP2 for the first time presents the user with the full breadth of everything the platform can do, with no guided entry point. Professional products have a "first screen" that establishes what the product is, what its primary workflow is, and what the user should do next.

**Fix:** Create an intentional landing view that establishes the primary workflow, shows system health at a glance, and directs the operator toward the most valuable next action. Advanced surfaces should require deliberate navigation to reach.

#### 10. The product visual identity is not yet fully resolved between "audio console" and "web dashboard"

MAP2 exists in a tension between pro-audio console aesthetics (dark, dense, hardware-referencing) and modern web dashboard conventions (cards, modals, responsive layout). Currently both vocabularies are present without a clear editorial decision about which wins when they conflict.

This creates micro-inconsistencies throughout the UI: sometimes controls look like hardware, sometimes like enterprise software, sometimes like developer tooling.

**Fix:** Make an explicit design decision about the primary aesthetic register and enforce it. The dark control-room direction is the correct choice for this product category. That means: prefer data density over white space, prefer state color over decorative color, prefer precision typography over expressive typography, and design every screen as if it will be used under time pressure by someone who already knows the platform.

### Summary: the five highest-ROI GUI improvements

| Priority | Change | Expected impact |
|----------|--------|-----------------|
| 1 | Constrain blue to one semantic job; assign distinct colors to empty/offline/fault states | Immediate professionalism lift — state becomes readable at a glance |
| 2 | Raise navigation label legibility (size, contrast, spacing) | Reduces cognitive cost; strongest impact for returning operators |
| 3 | Widen surface depth contrast (background vs card vs elevated) | Makes dense screens readable without reducing information density |
| 4 | Enforce primary action hierarchy on every workflow screen | Reduces decision cost and makes the product feel guided rather than exhausting |
| 5 | Add maturity labeling system with consistent visual treatment | Stops the product from overstating readiness; builds operator trust |

## 9. API critique summary

The API is broad enough to matter and weak enough to limit adoption.

The five most important API gaps are:

1. no credible platform-wide authentication and authorization model
2. documented responses do not describe actual failure behavior
3. versioning is inconsistent and mostly absent outside `/api/v2/midi/*`
4. the event model lacks a first-class schema and examples
5. route design is too RPC-heavy and too thin on bulk automation support for a `1227`-operation surface

## 10. Prioritized improvement plan

### Immediate fixes

- `T088`: harden realtime reliability by fixing PipeWire recovery, bounded fan-out, and slow-client isolation
- `T087`: standardize the external API contract, especially errors, versioning, event schema, examples, and duplicate operation IDs
- `T083`: create the canonical backend dependency manifest and environment contract
- `T085`: add subsystem maturity labeling so MAP2 stops overstating readiness — visual badge system across all menu entries and page headers

### Medium-term improvements

- `T092`: GUI professionalism overhaul — implement the five high-ROI changes identified in section 8: semantic color discipline (blue constrained to one job, distinct empty/offline/fault treatment), navigation legibility (label size and contrast), surface depth (card vs background separation), primary action hierarchy per workflow screen, and maturity labeling visual tokens
- `T089`: decompose oversized route/service hubs and narrow boundary crossings
- `T090`: rebuild navigation and workflow tiers around operator tasks and maturity states
- `T091`: create an enforceable latency/performance evidence program with automated checks where practical
- `T082-subD`: remove tracked build bloat and clean repository hygiene after release-pipeline coordination is safe

### Strategic redesigns

- define a smaller canonical product story for MAP2 and quarantine or modularize opportunistic feature sprawl
- separate public integration contracts from internal UI convenience routes
- evolve toward subsystem-specific maturity gates, qualification checklists, and release criteria instead of feature presence alone

## 11. Final verdict

MAP2 is not a fake platform. It is a real one with real engineering depth. That matters.

It is also not yet excellent.

As of March 10, 2026, the platform is best described as fit for expert-led, carefully managed deployments with explicit waivers, not as a fully polished, broadly production-ready appliance. What prevents excellence is not lack of ambition or missing subsystems. It is the combination of incomplete closure, weak control-plane security, shaky failure-mode discipline, oversized surface area, and insufficient maturity signaling.

The changes that would most improve MAP2 are straightforward to name:

- harden the realtime failure paths
- govern the API like an external contract
- raise the GUI to professional audio control product standards
- reduce coupling and surface sprawl
- tell operators the truth about subsystem maturity

If MAP2 does those things, the existing technical depth gives it a real chance to become a credible professional platform.
