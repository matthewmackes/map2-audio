# Tesira GUI Audit

Date: 2026-03-23  
Canonical tasks: `T350`, `T351`, `T352`

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
- route landing experience and step framing for onboarding
- parts of the compact quick-start/operator messaging added in this slice

### Still not Carbon-compliant

The dedicated `/tesira` route remains mixed-system and is still predominantly MUI-based.

Primary non-compliant surfaces:

- `web/src/app/components/Tesira/TesiraApp.tsx`
- `web/src/app/components/Tesira/components/TesiraTopBar.tsx`
- `web/src/app/components/Tesira/components/TesiraFleetPanel.tsx`
- `web/src/app/components/Tesira/components/TesiraDeviceHeader.tsx`
- `web/src/app/components/Tesira/components/TesiraDeviceDashboard.tsx`
- `web/src/app/components/Tesira/components/TesiraDeployDialog.tsx`
- most device tabs such as levels, presets, DSP explorer, mixer, AVB, faults, loop builder, and settings

### Compliance assessment

- Route shell: mixed, not compliant
- Fleet navigation: mixed, not compliant
- Device dashboard: mixed, not compliant
- Dialog system: mixed, not compliant
- Device tabs: mostly MUI, not compliant
- Onboarding landing: materially improved and Carbon-oriented, but not enough to declare the whole route compliant

## Recommended Next Tasks

1. Convert the `/tesira` shell, top bar, fleet panel, and dashboard framing to Carbon-first structure and tokens.
2. Convert the deploy dialog and device header/status surfaces away from MUI chips/papers/buttons.
3. Convert the high-traffic device tabs in this order:
   - levels
   - presets
   - DSP explorer
   - AVB / faults
4. Decide whether MAP2 will implement a true serial-console transport or keep serial as an operator-guided physical recovery step only.

## Bottom Line

The dedicated Tesira route is now materially better aligned with Tesira onboarding reality:

- serial-first used-device recovery is explicit
- configuration load is treated as mandatory
- the MIDI-side quick command helper is no longer stranded outside the Tesira route

Carbon compliance is still incomplete. The route now has a Carbon-style onboarding front door, but the rest of the Tesira experience remains a mixed MUI/Carbon surface and needs a dedicated migration pass.
