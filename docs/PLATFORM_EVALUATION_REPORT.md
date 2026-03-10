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

### Weakness 6. The API is not external-platform grade

The API critique found a broad but weakly governed contract: mixed versioning, RPC-heavy naming, undocumented runtime error behavior, minimal example coverage, duplicate operation-ID warnings, and an event model that exists without a formal schema.

### Weakness 7. Authentication and authorization are not adequate for the control plane

The reviewed API surface does not show a credible platform-wide auth model. The visible auth flow exposes `/api/auth/special-backdoor` and falls back to a default `backdoor` password when the environment is unset.

### Weakness 8. Visual hierarchy is too semantically flat

The theme is coherent, but too much of the product occupies the same cool-blue tonal range. The UI communicates atmosphere better than urgency, state, readiness, or workflow priority.

### Weakness 9. Navigation and information architecture do not protect operators from unfinished complexity

Advanced pages are too discoverable relative to their maturity, while higher-value operator workflows are not surfaced with enough task-first structure.

### Weakness 10. The platform still lacks a strong canonical environment/setup contract

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

## 6. UX critique summary

The UI is capable, but it currently behaves more like an engineer's control warehouse than a disciplined operator product.

The five most important UX improvements are:

1. separate default operator flows from advanced or experimental control surfaces
2. make subsystem maturity explicit everywhere users choose workflows
3. compress navigation around high-value tasks instead of subsystem sprawl
4. improve state semantics so warning, degraded, experimental, offline, and healthy states are visually unmistakable
5. reduce page-level density where the interface currently asks users to understand too much product structure at once

## 7. Theming critique summary

MAP2's theme has a real identity, but it needs a better semantic token system.

The most important theming directives are:

- keep the dark blue identity, but widen the semantic palette for health, warnings, destructive actions, and experimental states
- introduce stronger tonal contrast between navigation chrome and task-critical content
- use typography and spacing to create clearer operator hierarchy
- stop using the same color register for everything important
- tie maturity labels to consistent visual tokens so readiness is legible without reading surrounding prose

## 8. API critique summary

The API is broad enough to matter and weak enough to limit adoption.

The five most important API gaps are:

1. no credible platform-wide authentication and authorization model
2. documented responses do not describe actual failure behavior
3. versioning is inconsistent and mostly absent outside `/api/v2/midi/*`
4. the event model lacks a first-class schema and examples
5. route design is too RPC-heavy and too thin on bulk automation support for a `1227`-operation surface

## 9. Prioritized improvement plan

### Immediate fixes

- `T086`: establish platform-wide control-plane authentication/authorization and remove default backdoor behavior
- `T088`: harden realtime reliability by fixing PipeWire recovery, bounded fan-out, and slow-client isolation
- `T087`: standardize the external API contract, especially errors, versioning, event schema, examples, and duplicate operation IDs
- `T083`: create the canonical backend dependency manifest and environment contract
- `T085`: add subsystem maturity labeling so MAP2 stops overstating readiness

### Medium-term improvements

- `T089`: decompose oversized route/service hubs and narrow boundary crossings
- `T090`: rebuild navigation and workflow tiers around operator tasks and maturity states
- `T091`: create an enforceable latency/performance evidence program with automated checks where practical
- `T082-subD`: remove tracked build bloat and clean repository hygiene after release-pipeline coordination is safe

### Strategic redesigns

- define a smaller canonical product story for MAP2 and quarantine or modularize opportunistic feature sprawl
- separate public integration contracts from internal UI convenience routes
- evolve toward subsystem-specific maturity gates, qualification checklists, and release criteria instead of feature presence alone

## 10. Final verdict

MAP2 is not a fake platform. It is a real one with real engineering depth. That matters.

It is also not yet excellent.

As of March 10, 2026, the platform is best described as fit for expert-led, carefully managed deployments with explicit waivers, not as a fully polished, broadly production-ready appliance. What prevents excellence is not lack of ambition or missing subsystems. It is the combination of incomplete closure, weak control-plane security, shaky failure-mode discipline, oversized surface area, and insufficient maturity signaling.

The changes that would most improve MAP2 are straightforward to name:

- secure the control plane
- harden the realtime failure paths
- govern the API like an external contract
- reduce coupling and surface sprawl
- tell operators the truth about subsystem maturity

If MAP2 does those things, the existing technical depth gives it a real chance to become a credible professional platform.
