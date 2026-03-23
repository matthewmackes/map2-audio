# Tesira GUI Audit

Date: 2026-03-23  
Canonical tasks: `T350`, `T351`, `T352`, `T353`, `T354`

## Scope

This audit compares the dedicated MAP2 `/tesira` route against:

- official Biamp Tesira control and recovery guidance
- the existing MIDI Hub Tesira helper surface
- Carbon Design compliance expectations already being applied elsewhere in MAP2

## Feature Audit Summary

### What Biamp materials make clear

- Tesira control is not limited to Ethernet TTP alone; Biamp documents control access over serial `RS-232` and network transports such as Telnet and SSH.
- A used unit with unknown credentials may require a factory reset before control can begin.
- A factory reset clears the prior DSP configuration, so onboarding is incomplete until a compatible Tesira layout is back on the unit.
- TTP is a runtime control surface, not a full Tesira design compiler workflow.

### Where the dedicated MAP2 route was short before this work

- The operator-facing `/tesira` landing state did not expose a serial-first onboarding path for used hardware.
- Recovery/onboarding knowledge was fragmented across discovery dialogs, manual-add flows, and hidden route-local behavior.
- The dedicated route lacked the MIDI Hub Tesira helper's quick command workflow for ad hoc recovery and verification.
- The route did not make the "factory reset clears config, then MAP2-compatible layout must be restored" requirement explicit enough for used-device onboarding.

### What is now present

- A dedicated `TesiraOnboardingWizard` on `/tesira` that exposes:
  - serial recovery as the default method
  - network discovery
  - manual IP enrollment
  - mandatory configuration-load confirmation
  - runtime verification before onboarding is considered complete
- Operator documentation in `docs/tesira/TESIRA_ONBOARDING_WIZARD_PROCESS.md`.
- An offline reconnect banner on the real device route, not just the legacy unused control panel.
- A dedicated-route quick console on the device dashboard:
  - raw TTP command entry
  - quick-fill recovery commands
  - discovered instance-tag browser backed by the dedicated Tesira DSP inventory
  - direct use from `/tesira`, without falling back to MIDI Hub
- Carbon-first route chrome around the high-traffic operator path:
  - route shell loading/error framing
  - fleet navigation and device cards
  - device header/dashboard support surfaces
  - offline recovery banner
  - manual SageVue package-export dialog

### Remaining functional gaps

- MAP2 still does not provide a real browser-to-device serial console or Web Serial workflow.
- Direct SageVue deployment is intentionally disabled in the current backend; the shipped path remains manual package download plus manual SageVue upload/deploy.
- The dedicated route still does not expose the full MIDI-side subscription helper surface one-for-one.
- Native Tesira compile/deploy parity remains outside the scope of current shipped onboarding and is still covered by the broader Tesira parity roadmap.

## Onboarding Outcome

The current supported used-device onboarding process is now:

1. recover/reset the unit, with serial framed as the primary method
2. enroll it into the MAP2 Tesira fleet
3. load a MAP2-compatible layout through the manual package path
4. verify runtime control from MAP2

That is materially closer to Biamp’s documented recovery reality than the prior discovery-only landing flow.

## Carbon Compliance Audit

### Carbon-aligned now

- `TesiraOnboardingWizard.tsx`
- `TesiraApp.tsx`
- `TesiraTopBar.tsx`
- `TesiraFleetPanel.tsx`
- `TesiraDeviceCard.tsx`
- `TesiraDeviceHeader.tsx`
- `TesiraDeviceDashboard.tsx`
- `TesiraOfflineBanner.tsx`
- `TesiraQuickCommandPanel.tsx`
- `TesiraDeployDialog.tsx`
- route landing experience and step framing for onboarding
- route shell, fleet, dashboard, and recovery/package workflows added in this slice

### Still not Carbon-compliant

The dedicated `/tesira` route is no longer shell-level MUI-heavy, but it still remains mixed-system.

Primary non-compliant surfaces:

- `web/src/app/components/Tesira/components/DiscoveryDialog.tsx`
- `web/src/app/components/Tesira/components/ManualAddDialog.tsx`
- device tabs such as levels, presets, DSP explorer, mixer, AVB, faults, loop builder, EQ, firmware, and settings
- secondary detail panels such as `TesiraDspBlockPanel.tsx`, `TesiraDspProbeDialog.tsx`, `TesiraFleetHealth.tsx`, and `TesiraPtpTopology.tsx`

### Compliance assessment

- Route shell: materially Carbon-aligned
- Fleet navigation: materially Carbon-aligned
- Device dashboard: materially Carbon-aligned
- Dialog system: mixed, partial
- Device tabs: mostly MUI, not compliant
- Onboarding landing: Carbon-oriented
- Overall route: improved substantially, but not yet compliant end to end because the actual control tabs and enrollment dialogs still break the design-system boundary

## Recommended Next Tasks

1. Convert `DiscoveryDialog.tsx` and `ManualAddDialog.tsx` so enrollment and recovery stay Carbon-consistent from the first operator click.
2. Convert the high-traffic device tabs in this order:
   - levels
   - presets
   - DSP explorer
   - AVB / faults
3. Fold the secondary detail panels (`FleetHealth`, `PtpTopology`, probe dialogs, DSP block panels) onto the same Carbon token patterns.
4. Decide whether MAP2 will implement a true serial-console transport or keep serial as an operator-guided physical recovery step only.

## Bottom Line

The dedicated Tesira route is now materially better aligned with Tesira onboarding reality:

- serial-first used-device recovery is explicit
- configuration load is treated as mandatory
- the MIDI-side quick command helper is no longer stranded outside the Tesira route

Carbon compliance is still incomplete, but the route is no longer blocked on shell-level chrome. The remaining work is now concentrated in the actual control tabs and enrollment dialogs, which is a much narrower and more actionable Carbon migration target.
