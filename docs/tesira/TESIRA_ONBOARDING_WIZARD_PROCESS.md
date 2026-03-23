# Tesira Onboarding Wizard Process

Date: 2026-03-23  
Canonical tasks: `T350`, `T351`

## Goal

Provide one Tesira onboarding flow in MAP2 that:

- makes all supported onboarding methods visible in one place
- defaults to a serial-first recovery path for used devices
- assumes used devices may require a factory reset before onboarding starts
- ends only when the unit carries a MAP2-compatible control configuration
- verifies that MAP2 can control the signal chain and supported unit features afterward

## Product Decision

The dedicated `/tesira` route is the operator-facing home for Tesira onboarding.

The wizard must treat discovery-only onboarding as incomplete. A unit is not onboarded merely because MAP2 can see it on the network. The process is complete only after:

1. the used device has been recovered
2. the unit is enrolled into the MAP2 Tesira fleet
3. a MAP2-compatible Tesira layout has been deployed
4. MAP2 verifies runtime control readiness

## Supported Methods

### 1. Serial Recovery

Primary method.

Use when:

- the device is used hardware
- admin credentials are unknown
- the prior site configuration cannot be trusted
- the operator needs a deterministic recovery path with physical access

Outcome:

- physical recovery and factory reset happen first
- the device is then handed off to MAP2 for fleet enrollment, configuration loading, and verification

### 2. Network Discovery

Fast path.

Use when:

- the device is already factory-reset or otherwise reachable on the control network
- MAP2 can discover the unit through mDNS or Biamp discovery visibility

Outcome:

- the unit is adopted into the MAP2 fleet
- the operator still must complete configuration loading and runtime verification

### 3. Manual IP Enrollment

Fallback path.

Use when:

- discovery cannot see the unit
- the control IP is already known
- the device is on a restricted or isolated management segment

Outcome:

- the unit is added to the MAP2 fleet without waiting for TTP readiness
- the operator still must load the MAP2-compatible layout and verify runtime control

## Canonical Used-Device Flow

### Step 1. Choose Method

Default to `Serial Recovery`.

The operator may switch to network discovery or manual IP enrollment, but the wizard should visually frame serial recovery as the recommended path for used hardware.

### Step 2. Recover the Device

For used devices:

- obtain physical access
- perform factory reset
- accept that the previous DSP configuration is cleared
- prepare the device for a control-network handoff back to MAP2

Why this is required:

- Biamp documents that recovering a lost admin password requires a factory reset and that this clears the DSP configuration

### Step 3. Enroll the Unit into MAP2

After recovery:

- try MAP2 Tesira discovery first
- if discovery finds the unit and TTP is reachable, adopt it directly
- if discovery finds the unit but TTP is still unavailable, add it to the fleet so MAP2 tracks it while control is finished
- if discovery fails, add the device by known control IP

Required result:

- the unit appears in the MAP2 Tesira fleet

### Step 4. Load a MAP2-Compatible Tesira Configuration

This is mandatory.

MAP2 runtime control depends on the Tesira carrying a compatible layout with the expected signal-chain objects and control tags.

Current product-supported path:

1. choose a precompiled layout from the MAP2 Tesira catalog
2. download the manual SageVue package from MAP2
3. upload the TMF in SageVue
4. deploy the layout to the target Tesira unit

Why this step exists:

- TTP is a runtime control interface, not a full Tesira compiler or authoring surface
- MAP2 therefore uses precompiled layout artifacts plus post-deploy runtime control

### Step 5. Verify MAP2 Runtime Control

After deployment:

- reconnect the unit from MAP2 if needed
- confirm MAP2 sees the device online
- confirm the deployed layout exposes the expected signal-chain controls
- confirm MAP2 can operate the supported unit features needed for the installation

Suggested verification targets:

- connection state
- preset visibility
- DSP/control tag availability
- AVB stream visibility
- PTP state
- fault baseline

## Acceptance Criteria

The onboarding run is complete only when:

- the used device recovery path is explicitly acknowledged
- the unit is present in the Tesira fleet
- the MAP2-compatible Tesira layout is confirmed as deployed
- MAP2 can reconnect to the device and verify runtime control readiness

## Current Product Limits

- MAP2 does not use TTP as a full Tesira DSP compiler
- the current supported configuration-load path is manual package deployment through SageVue
- runtime control readiness depends on a compatible layout being present on the device

## Vendor References

- Tesira security best practices:
  - https://support.biamp.com/Tesira/Control/Tesira_security_best_practices
- Tesira Text Protocol overview:
  - https://tesira-help.biamp.com/System_Control/Tesira_Text_Protocol/Overview.htm
- Tesira direct deployment plan in MAP2:
  - [docs/tesira/TESIRA_DIRECT_DEPLOY_PLAN.md](/home/mm/map2-audio/docs/tesira/TESIRA_DIRECT_DEPLOY_PLAN.md)
