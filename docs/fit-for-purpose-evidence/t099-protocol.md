# T099 — Dynamic Response Validation: Formal Test Protocol

**Version:** 1.0
**Date:** 2026-03-10
**Status:** Protocol — ready for execution (physical hardware required)
**Owner:** MAP2 Audio Platform
**Evidence destination:** `docs/fit-for-purpose-evidence/<YYYYMMDD>/t099/`

---

## Purpose

This protocol defines a formal, reproducible A/B blind comparison of MAP2's NAM amp modeling dynamic response against:

- **Chain A** — the reference tube amp (real hardware)
- **Chain B** — MAP2 NAM model trained on the same amp
- **Chain C** — competitor modeler (Neural DSP Quad Cortex Neural Capture V2, or Kemper Profiling 2.0) loaded with a capture of the same amp

The goal is an honest, evidence-backed verdict on whether MAP2's NAM modeling is stage-competitive. A genuine result — even where MAP2 falls short — is more valuable than silence.

---

## 1. Required Hardware

| Item | Specification | Notes |
|---|---|---|
| Reference amp | Fender Deluxe Reverb (1×12", 22W) OR Marshall JCM800 2203 | Choose one; document exact serial/year if possible |
| Load box | Two Notes Torpedo Captor X OR similar passive/active load | For silent recording without mic |
| Cabinet IR | Same IR used in MAP2 chain (document filename and source) | Must be identical in all three chains |
| Recording interface | Any 24-bit/48kHz interface (NOT the UA-1000, which is under test for MAP2 chain) | Focusrite Scarlett 2i2 or equivalent |
| Test guitar | Electric guitar (recommended: Strat-style single coil + humbucker, both tested) | Document make, model, pickup position, tone/volume settings |
| MAP2 host | Standard MAP2 system (UA-1000, Fedora RT, isolated cores, buffer 64/48kHz) | |
| Competitor | Quad Cortex (firmware ≥ 3.0) OR Kemper Stage MK2 (OS 14.0) | Document firmware version |
| DAW | Any 48kHz/24-bit capable DAW (Ardour, Reaper, etc.) | |
| DI box (optional) | For direct comparison reference track | |

---

## 2. Signal Chain Specifications

### Chain A — Reference Tube Amp

```
Guitar
  → Amp input (Deluxe Reverb: Volume 5, Bass 5, Treble 5, Reverb 0; JCM800: Gain 5, Volume 5, Bass 5, Mid 6, Treble 5, Presence 5)
  → Load box (speaker output into load box, 8Ω or 16Ω as required)
  → Load box line output → cab IR plugin (same IR file as MAP2 chain, inserted in DAW)
  → Recording interface input 1 (line level, pad if needed)
  → DAW track — 48kHz / 24-bit / no processing
```

Document control positions in a photograph archived at `docs/fit-for-purpose-evidence/<YYYYMMDD>/t099/amp_controls.jpg`.

### Chain B — MAP2 NAM

```
Guitar (same instrument, same pickup, no cable change)
  → UA-1000 input 1
  → JUCE engine → NAM model file (document filename, training amp, training date)
  → Same cab IR (matching Chain A)
  → UA-1000 output 1 → recording interface input 2
  → DAW track — 48kHz / 24-bit / no processing
```

NAM model must be documented: filename, source (ToneHunt ID or local training), amp used for training, sample count if known.

RTL offset: apply a fixed delay equal to the measured RTL from T096 (`latency_baseline.json`) to align Chain B to Chain A in the DAW before export. Do not use plugin-based alignment — apply it as a track delay offset.

### Chain C — Competitor (optional but strongly recommended)

```
Guitar (same instrument)
  → Competitor input (instrument level)
  → Competitor amp model of same reference amp (closest available factory model or user capture)
  → Competitor output L (line level)
  → User IR loaded in competitor (same IR file as Chains A/B — convert to mono WAV if needed)
  → Recording interface input 3
  → DAW track — 48kHz / 24-bit / no processing
```

Document competitor: device model, firmware version, preset name, amp model or capture name used.

---

## 3. Test Phrases

Record all five phrases on all three chains in the same session without moving the guitar or changing amp settings between chains (change only the signal routing). Record each phrase at least 3 times; keep the best take.

### Phrase 1 — Single-Note Dynamics Sweep
Play a sustained single note (e.g., A4 on the B string, 14th fret) five consecutive times with increasing pick attack: **pp → p → mf → f → ff**. Use a clean picking motion (no muting). Tempo: free.

*Purpose: Measures onset slope and peak level fidelity across the dynamic range. This is the primary "feel" test.*

### Phrase 2 — Chord Swells with Natural Decay
Strum an open E major chord (all six strings) at **mf** attack. Allow the chord to ring for 4 seconds and decay naturally. Repeat 3×.

*Purpose: Measures compression/sag character and natural decay envelope. Tube amps have asymmetric sustain; modelers often flatten this.*

### Phrase 3 — Fast Alternate-Picked 16th Notes
At **120 BPM**, play a pentatonic pattern (8 notes) with tight alternate picking at **f** attack. Record 4 bars.

*Purpose: Measures articulation of fast transients. Under-modeled amps smear individual note onsets at speed.*

### Phrase 4 — Staccato Palm-Muted Chugs
At **120 BPM**, play a palm-muted open-E power chord on beats 1 and 3 at **ff** attack. 8 bars.

*Purpose: Measures low-end tightness and release character. Critical for distorted rhythm playing.*

### Phrase 5 — Fingerpicked Clean Arpeggios
At **80 BPM**, fingerpick a Gmaj7 arpeggio (G-B-D-F#) at **p** attack. 4 bars.

*Purpose: Measures clean headroom and pick-attack clarity. Many modelers over-compress the clean response.*

---

## 4. Blinding Procedure

1. After recording, export each phrase × chain as separate WAV files.
2. Label files with neutral identifiers only: `phrase1_X.wav`, `phrase1_Y.wav`, `phrase1_Z.wav` (X/Y/Z randomly assigned to A/B/C for each evaluator).
3. Record the assignment key (e.g., X=A, Y=C, Z=B) in a sealed document opened only after all evaluations are complete.
4. Distribute WAV files to evaluators as a zip with no metadata indicating chain identity.

---

## 5. Quantitative Analysis

After recording, run `scripts/analyze_envelope.py` on each phrase pair (A vs B, A vs C). The script:

1. Cross-correlates the two recordings to remove residual timing offset.
2. Extracts onset envelope using a 10ms Hann window RMS detector at each transient.
3. Computes per-transient: onset slope (dB/ms in first 20ms), peak level, 10%–90% rise time.
4. Summarizes: mean and std of Δ onset slope, Δ peak, Δ rise time across all transients.
5. Generates overlay PNG charts per phrase pair.

**Gate thresholds:**

| Metric | PASS | WARN | FAIL |
|---|---|---|---|
| Mean onset slope error (MAP2 vs. reference) | ≤ 1.5 dB/ms | 1.5–3.0 dB/ms | > 3.0 dB/ms |
| Mean peak level error | ≤ 1.0 dB | 1.0–2.0 dB | > 2.0 dB |
| Mean rise time error | ≤ 2 ms | 2–5 ms | > 5 ms |

A phrase earns PASS if all three metrics are within PASS range.

---

## 6. Subjective Evaluation

### Evaluator requirements
- Minimum 3 evaluators
- At least 1 must be a regular gigging guitarist with no prior MAP2 familiarity
- Preferred mix: guitarist + sound engineer + producer or recording engineer

### Rating form (per chain, per phrase set)

Rate on a 1–5 scale where 1 = far from a real amp, 5 = indistinguishable from a real amp:

| Criterion | 1 | 3 | 5 |
|---|---|---|---|
| **Dynamic feel** — does it respond like a real amp? | Flat / robotic | Noticeable but acceptable | Indistinguishable |
| **Pick attack clarity** — are fast notes articulate? | Smeared / blurred | Mostly clear | Crisp and defined |
| **Compression / sag** — does it breathe naturally? | Hard wall or none | Some sag | Natural tube compression |
| **Overall tone** — do you want to play through this? | No | Maybe | Absolutely |

Plus one free-text "notes" field per chain.

At the end: **rank the three chains 1–3 for stage usability** (best = 1, worst = 3). Chain identities are not revealed until after ranking is submitted.

Collate results into `docs/fit-for-purpose-evidence/<YYYYMMDD>/t099/subjective_eval.json`:
```json
{
  "evaluators": 3,
  "chains": {
    "A": { "identity": "Reference amp", "mean_feel": 4.8, "mean_attack": 4.9, "mean_sag": 4.7, "mean_tone": 4.8, "mean_rank": 1.0 },
    "B": { "identity": "MAP2 NAM",      "mean_feel": 0.0, "mean_attack": 0.0, "mean_sag": 0.0, "mean_tone": 0.0, "mean_rank": 0.0 },
    "C": { "identity": "Quad Cortex",   "mean_feel": 0.0, "mean_attack": 0.0, "mean_sag": 0.0, "mean_tone": 0.0, "mean_rank": 0.0 }
  }
}
```
Fill in actual values after evaluation.

---

## 7. Pass/Fail Verdict

After combining quantitative and subjective results, assign an overall verdict per phrase:

| Verdict | Criteria |
|---|---|
| **PASS** | Quantitative: all three metrics PASS; Subjective: MAP2 mean rank ≤ 2.0 AND mean feel ≥ 3.5 |
| **WARN** | Quantitative: any metric WARN (none FAIL); Subjective: mean rank ≤ 2.5 |
| **FAIL** | Quantitative: any metric FAIL; OR Subjective: mean rank > 2.5 OR mean feel < 3.0 |

A phrase earning FAIL triggers a specific improvement recommendation (see T099-sub04).

**Platform evaluation update:** If MAP2 earns PASS or WARN on ≥ 3 of 5 phrases, update the "Amp Modeling & Feel" rating in `docs/PLATFORM_EVALUATION_REPORT.md` from "Partial Match" to "Partial Match — validated" with a link to the evidence document.

---

## 8. Evidence Artifacts Required

All artifacts go in `docs/fit-for-purpose-evidence/<YYYYMMDD>/t099/`:

| File | Content |
|---|---|
| `amp_controls.jpg` | Photo of amp control positions |
| `nam_model_info.txt` | NAM model filename, source, training amp, training date |
| `competitor_info.txt` | Competitor device, firmware, amp model/capture used |
| `phrase1_A.wav` … `phrase5_C.wav` | Raw unlabelled recordings (15 files) |
| `blinding_key.txt` | X/Y/Z → A/B/C mapping (sealed, opened post-evaluation) |
| `envelope_analysis/phrase1_AB.png` … | PNG overlay charts from analyze_envelope.py |
| `envelope_analysis/summary.json` | Quantitative summary per phrase |
| `subjective_eval.json` | Collated evaluator ratings |
| `DYNAMIC_RESPONSE_EVIDENCE.md` | Final evidence document (T099-sub04) |

---

## 9. Prerequisites Before Execution

- [ ] T096-sub01 complete — latency_baseline.json exists (RTL measurement for chain offset)
- [ ] NAM model file available and loaded in MAP2 engine
- [ ] Reference amp available and tested operational
- [ ] Load box operational (correct impedance for reference amp)
- [ ] Competitor device available with matching amp model/capture loaded
- [ ] `scripts/analyze_envelope.py` written and tested on synthetic data
- [ ] At least 3 evaluators confirmed and available
- [ ] DAW session template created with three tracks and correct routing

---

*Protocol version 1.0 — do not modify during an active test run. Create a new version (1.1, 2.0) for any methodological change.*
