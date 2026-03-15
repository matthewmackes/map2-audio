# T102 MIDI Hub External Operator Field Study Protocol

Date: 2026-03-14
Owner: Codex
Scope: `/midi-hub` guided-learning redesign from `T101`

## 1. Objective

Run a structured external-operator field study to verify that the redesigned `/midi-hub` workflows can be completed by real users without coaching. This protocol is the execution kit for `T102`; once live sessions occur, the remaining work should only be participant capture, issue triage, and worklist follow-through.

## 2. Required Participants

- Minimum `3` external operators.
- At least `1` participant must be a regular gigging guitarist who is not a MAP2 developer.
- Preferred mix:
  - `1` gigging guitarist
  - `1` sound engineer or technician
  - `1` producer, music director, or technically comfortable player

## 3. Session Constraints

- Use the current redesigned `/midi-hub` build with guided flows enabled.
- Moderator may introduce the page and explain the study format, but may not teach task steps in advance.
- Participant should think aloud during the session.
- All observations must be anonymized before archival.
- Session target: `20-30` minutes per participant.

## 4. Environment Checklist

Before each session, confirm all of the following:

- MAP2 build reference recorded (`git rev-parse --short HEAD` or release/version label).
- Browser and device type recorded.
- A reachable MIDI device or realistic demo port path is available for the "connect device" task.
- Routing workspace loads normally and guided flows are accessible.
- Traffic monitor is working so "signal verified" can be observed honestly.
- Starting state is reset:
  - no participant-specific presets or routes pre-created unless the task explicitly calls for them
  - onboarding can be replayed
  - prior participant artifacts are not visible

## 5. Moderator Script

Read this script verbatim before the first task:

> You are evaluating the MIDI Hub interface, not your own skill. Please think aloud as you work. I may remind you of the goal of a task, but I will not teach you the steps unless you are completely blocked and we need to record an assist. If something is confusing, say so immediately.

If the participant is silent for more than `15` seconds, prompt only with:

> Please keep talking through what you are looking for.

If the participant is blocked and cannot proceed, log one assist event and use the smallest possible intervention:

- `clarification`: restate the goal only
- `nudge`: point to a region, not a control sequence
- `intervention`: direct instruction required

## 6. Task Set

Use the exact guided-workflow goals introduced in `T101`.

### Task 1: Connect a device and verify signal

- Prompt: "Connect a MIDI source and verify that the page shows live signal."
- Success criteria:
  - participant finds a relevant setup/connectivity area
  - participant reaches a state where ports are visible
  - participant verifies incoming traffic or equivalent signal confirmation
- Failure conditions:
  - participant cannot locate where devices appear
  - participant cannot determine whether signal is active

### Task 2: Create a route

- Prompt: "Create a route from the detected source to an appropriate destination."
- Success criteria:
  - participant creates a route in matrix or patchbay
  - participant can explain what is source vs destination
  - participant can tell whether the route is active
- Failure conditions:
  - participant misidentifies source/destination roles
  - participant cannot confirm route state

### Task 3: Troubleshoot no-signal

- Prompt: "Assume the device is connected but you are not getting signal where you expect it. Use the page to diagnose the problem."
- Success criteria:
  - participant follows a plausible triage path
  - participant checks traffic, routes, and/or presets in a sensible order
  - participant reaches a likely root cause or next action
- Failure conditions:
  - participant gets lost between panels
  - participant cannot identify a troubleshooting path

## 7. Measurements To Capture

For each participant and each task, record:

- `success`
- `completed_without_coaching`
- `time_to_complete_seconds`
- assist events and type (`clarification`, `nudge`, `intervention`)
- confusion points with timestamp and page area
- moderator notes

Also record overall session measures:

- confidence after session (`1-5`)
- whether the participant says they could repeat the workflow without help
- strongest area
- largest confusion area

## 8. Artifact Layout

Store all study outputs in a dated folder:

`docs/fit-for-purpose-evidence/<YYYYMMDD>/t102/`

Minimum files:

- `participant-P01.json`
- `participant-P02.json`
- `participant-P03.json`
- `issue-log.json`
- `summary.json`
- `T102_FIELD_STUDY_SUMMARY.md`

Use the templates:

- `docs/fit-for-purpose-evidence/t102-participant.template.json`
- `docs/fit-for-purpose-evidence/t102-issue-log.template.json`

## 9. Anonymization Rules

- Use participant IDs only (`P01`, `P02`, `P03`, ...).
- Do not record full names, employer names, venue names, email addresses, or phone numbers.
- If a quote contains identifying details, redact them before archival.
- If screen recording is captured, store it outside the repo unless it is explicitly reviewed and redacted.

## 10. Issue Severity Rules

Use these severity levels consistently:

- `critical`: user cannot complete a core task without direct instruction
- `major`: user completes the task only with help or with high confusion/risk
- `moderate`: user completes the task, but friction is obvious and repeatability is doubtful
- `minor`: user completes the task with low-friction but mentions a meaningful improvement

## 11. Post-Session Collation

After live sessions are captured, run:

```bash
python3 scripts/summarize_midi_hub_field_study.py \
  --input-dir docs/fit-for-purpose-evidence/<YYYYMMDD>/t102 \
  --output-json docs/fit-for-purpose-evidence/<YYYYMMDD>/t102/summary.json \
  --output-markdown docs/fit-for-purpose-evidence/<YYYYMMDD>/t102/T102_FIELD_STUDY_SUMMARY.md
```

Then manually finalize `issue-log.json` using the grouped issue output and create follow-up worklist items for accepted remediations.

## 12. Completion Gate

`T102` can only move out of blocked state when:

- `3+` external participants are recorded
- one participant is a non-developer gigging guitarist
- all three tasks have timed results
- confusion points and assists are captured
- grouped issues have severity and remediation proposals
- follow-up worklist items are added for accepted findings
