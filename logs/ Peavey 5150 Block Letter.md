# Peavey 5150 Block Letter — Digital Amp Simulator Plugin

## Complete Build Specification v2.0

**Target:** JUCE 7.x Standalone Application | Linux x86_64 | MIT License

---

## 1. Circuit Research & Reference Architecture

### 1.1 Historical Context

The original Peavey 5150 (block letter, 1992–2004) was designed by James Brown at Peavey Electronics as a signature model for Eddie Van Halen. The circuit is heavily derived from the Soldano SLO-100, which EVH was using at the time. Key differences from the SLO-100:

- An **additional gain stage** beyond the SLO's four preamp stages
- Different cathode bypass capacitor values that alter the frequency voicing
- **0.022µF coupling caps** throughout (identical to SLO — Soldano's signature, passing full guitar bandwidth rather than trimming lows with smaller caps)
- Cold-biased 6L6GC power section (runs colder than typical — this is a defining sonic characteristic)
- Tone stack placed **after the FX loop** (SLO places it after FX loop recovery as well — identical position)
- The tone stack itself is **identical to the Marshall JCM800 / SLO-100 topology** — a Fender-derived TMB stack with a 47kΩ slope resistor (SLO value; some sources report 39kΩ for the 5150)

### 1.2 Preamp Signal Chain (Lead Channel)

The 5150 uses **five 12AX7 dual-triode tubes** (10 triode halves total). The lead channel signal path, confirmed by Peavey service documentation and forum posts from Peavey's Roger Crimm:

| Stage | Tube | Function | Plate Load | Cathode R | Cathode Bypass | Notes |
|-------|------|----------|-----------|-----------|----------------|-------|
| 1 | V1a | Input gain stage | 220kΩ | 1.8kΩ | 1µF (partial bypass) | Shared rhythm/lead. 220k for higher gain than typical 100k. |
| 2 | V1b | 2nd gain stage | 100kΩ | 1.8kΩ | 1µF (partial bypass) | After gain pot + bright cap attenuator |
| 3 | V2a | 3rd gain stage | 100kΩ | 1.8kΩ | 1µF (partial bypass) | Additional cascaded gain |
| 4 | V2b | 4th gain stage | 100kΩ | 1.8kΩ | 1µF (partial bypass) | More gain cascade |
| 5 | V5a | Cold Clipper | 220kΩ | 39kΩ | Unbypassed | **Critical stage.** Very cold bias = early asymmetric cutoff clipping. Soldano's signature trick. The 39kΩ cathode R with no bypass cap means severe low-frequency attenuation and very early clipping on the negative lobe. |
| 6 | V5b | OD Preamp (primary distortion) | 220kΩ | 1.8kΩ | 1µF | First stage to go into overdrive. 220k plate load maximizes gain. |
| — | V3b | FX Send (cathode follower) | — | — | — | DC-coupled cathode follower buffers signal for FX loop. Interacts with stage 6 during overdrive. |
| — | V3a | FX Return recovery | 100kΩ | — | — | Recovers gain lost by FX loop attenuator |
| — | — | Tone Stack Buffer CF | — | — | — | Cathode follower drives tone stack |
| — | — | TMB Tone Stack | — | — | — | Passive Fender/Marshall-type |
| — | V4 | Phase Inverter (LTP) | — | — | — | Long-tail pair drives push-pull power amp |

**Key Insight from Research:** The SLO/5150 architecture uses **partially bypassed cathode resistors** (1µF caps) rather than small coupling caps to control low-frequency content. This is distinctive — the 0.022µF coupling caps pass the full guitar spectrum, while the 1µF cathode bypass caps severely cut frequencies below ~90Hz, keeping the overdrive tight and preventing blocking distortion.

### 1.3 Attenuating Voltage Dividers

Between every gain stage, the SLO/5150 uses **attenuating voltage dividers** that dump large percentages of signal to ground. This is counterintuitive for a "high gain" amp but is the key to smooth, musical overdrive versus harsh square-wave clipping:

| Position | Upper R | Lower R | Signal Dumped | Bright/Treble Peaker |
|----------|---------|---------|---------------|----------------------|
| After V1a → Gain Pot | 470kΩ | 500kΩ (gain pot) | 48% at max gain | 2nF (0.002µF) treble peaker cap |
| After V1b | 470kΩ | 1MΩ | 32% | None |
| After Cold Clipper | 470kΩ | 470kΩ | 50% | None |
| FX Loop attenuator | 100kΩ | 2.2kΩ | 99% (!) | None |

The 470kΩ upper resistors also serve as **grid stopper resistors**, forming low-pass filters with the next stage's Miller capacitance to prevent parasitic oscillation and ice-pick highs.

### 1.4 Tone Stack Component Values

The 5150 uses a standard Fender/Marshall TMB tone stack. Based on cross-referencing the SLO-100 schematic (confirmed identical tone stack per multiple sources), mod community values, and the Yeh/Smith analysis framework:

| Component | Value | Function |
|-----------|-------|----------|
| C1 (Treble cap) | 250pF (0.25nF) | High-pass: determines treble frequencies |
| C2 (Bass/Mid cap) | 22nF (0.022µF) | Low-pass for bass, mid interaction |
| C3 (Bass/Mid cap) | 22nF (0.022µF) | Bass control coupling |
| R1 (Treble pot) | 250kΩ (Linear) | Treble control |
| R2 (Bass pot) | 1MΩ (Log) | Bass control |
| R3 (Mid pot) | 25kΩ (Linear) | Mid control — cut only |
| R4 (Slope resistor) | 47kΩ | Slope/mixing resistor — SLO value. Some 5150s may use 39kΩ. **Use 39kΩ as default for original block letter accuracy, with a note that 47kΩ is the SLO value.** |

**Critical Implementation Note:** The Yeh/Smith paper ("Discretization of the '59 Fender Bassman Tone Stack", DAFx-06) provides the complete closed-form transfer function H(s) for this topology. The 5150 tone stack uses the **same topology** as the Bassman 5F6-A with different component values. Substitute the 5150 values into the Yeh/Smith equations to get exact digital filter coefficients.

The transfer function is a **3rd-order IIR filter** (3 poles, 3 zeros) that changes coefficients when any knob moves. Use bilinear transform for discretization. The treble control affects only the zeros (not the poles), while bass and mid affect both.

### 1.5 Power Amplifier

The 5150 power section uses **four 6L6GC tubes** in push-pull Class AB, producing approximately 120W RMS.

**Key characteristics:**
- **Cold-biased:** The 5150 is famous for running its power tubes cold. Per Wikipedia and multiple tech sources, the bias was intentionally set low for reliability and a more controllable gain range. This means less idle current, more crossover distortion, and a tighter feel.
- **Fixed bias** (not cathode-biased) — the bias voltage is set by a resistive divider (R14 and R108 per the 6505+ schematic, which is electrically identical)
- **Negative feedback loop** with presence control — the presence pot varies the amount of HF content fed back from the output transformer secondary to the phase inverter
- **Resonance control** — varies LF content in the feedback loop
- **Screen resistors:** 100Ω per tube (stock value)
- **Plate-to-plate impedance:** approximately 3.4kΩ through the output transformer

**Power Supply Sag Model:**
- The 5150 uses a **solid-state rectifier** (silicon diodes), which means less sag than tube-rectified amps
- However, the power transformer winding resistance still creates voltage sag under load
- Model using a Thevenin equivalent: ideal voltage source + series resistance
- Sag time constant determined by filter capacitor values and winding resistance
- Per the Amp Books methodology: track supply voltage as V[n+1] = V[n] + (Videal - V[n]) * Ts/τ where τ = R_supply × C_filter

---

## 2. DSP Implementation Specifications

### 2.1 Triode Waveshaping Model

Use a **per-stage waveshaping approach** as described by Amp Books and endorsed by Fractal Audio's MIMIC technology. Each gain stage is modeled as:

1. **Input scaling** — normalize input to the stage's expected voltage range
2. **Nonlinear transfer function** — waveshaper capturing 12AX7 behavior
3. **Output high-pass filter** — models coupling capacitor (bilinear transform of RC high-pass)
4. **Interstage attenuation** — voltage divider modeling

**12AX7 Transfer Function:**

The 12AX7 triode exhibits **asymmetric clipping**:
- **Positive grid swings:** Compressed by grid current effects (soft limiting)
- **Negative grid swings:** Free swing until cutoff at approximately -3.5V grid bias
- **Grid bias of -1V to -1.5V** is typical (warm bias = more 2nd harmonic, cold bias = more crossover distortion)

For the waveshaper, use a **piecewise polynomial or cubic spline** fitted to SPICE simulation data. The Amp Books approach recommends:

```
For a normalized input x ∈ [-1, 1]:

Region 1 (x < -0.98): f(x) = clamp_negative  (hard cutoff clipping)
Region 2 (-0.98 < x < 0.90): cubic spline interpolation of transfer curve
Region 3 (x > 0.90): f(x) = clamp_positive  (grid current saturation)
```

**Practical approximation** (from community DSP implementations):

```cpp
// Asymmetric soft-clipping approximation for 12AX7
// Grid bias shifts the center point
float triode_waveshaper(float x, float bias) {
    // Shift input by bias point
    float v = x - bias;

    // Asymmetric tanh-based approximation
    // Positive side: softer compression (grid current)
    // Negative side: harder clipping (cutoff)
    if (v >= 0.0f) {
        return tanh(v * 1.5f);  // Soft grid-current compression
    } else {
        // Harder cutoff clipping — sharper knee
        float k = 2.0f;  // Sharpness of cutoff
        return tanh(v * k) + (1.0f - 1.0f/k) * v * exp(-v*v);
    }
}
```

**However**, for maximum accuracy, derive the actual transfer curves per-stage from SPICE simulation or published 12AX7 plate curves. The key insight is that **each stage clips differently** based on its bias point and load:

- **Normal gain stages** (1.8kΩ cathode, ~-1.2V bias): Symmetric-ish, moderate 2nd harmonic
- **Cold clipper** (39kΩ cathode, very cold bias): Heavily asymmetric, dominant 2nd harmonic, early clipping on negative lobe
- **High-gain stages** (220kΩ plate load): More gain = harder clipping when driven

### 2.2 Cold Clipper Stage (Critical for 5150 Tone)

The cold clipper is **the most important stage to model accurately**. It is the primary source of the 5150's smooth, creamy overdrive character.

```
Cold Clipper characteristics:
- 39kΩ unbypassed cathode resistor
- DC bias point: very cold (near cutoff)
- Asymmetric clipping: negative signal lobe clips MUCH earlier than positive
- Produces dominant 2nd-harmonic distortion at relatively low volume
- The unbypassed cathode means local negative feedback for ALL frequencies
  (unlike bypassed stages where the cap removes NFB for AC signals)
- This NFB reduces gain but also keeps the distortion musical
```

Model this stage with a **shifted bias point** in the waveshaper that places the operating point much closer to cutoff.

### 2.3 Cathode Follower Interaction

The DC-coupled cathode follower (V3b in the 5150) after the primary distortion stage (V5b/OD Preamp 4) creates a unique interaction during overdrive. When the upstream plate swings low (during negative grid excursion), the cathode follower's grid is pulled below the cathode voltage, causing it to cut off. This creates **additional asymmetric clipping** that is distinct from the preamp stage clipping.

This interaction is described by Rob Robinette as one of the "secret" reasons Fender, Marshall, and Soldano amps sound good when pushed hard. **It has no solid-state equivalent.**

Model this as a separate nonlinear stage with:
- Unity voltage gain (it's a follower)
- Low output impedance
- Asymmetric cutoff when input goes below the cathode voltage

### 2.4 Tone Stack Digital Implementation

Use the **Yeh/Smith closed-form discretization** approach:

The TMB tone stack transfer function is:

```
        b1·s³ + b2·s² + b3·s + b4
H(s) = ────────────────────────────
        a0·s³ + a1·s² + a2·s + a3
```

Where the coefficients are functions of component values and control positions (t, m, l for treble, mid, bass ∈ [0,1]).

**For the 5150 tone stack** (substitute these into the Yeh/Smith general equations):

```
C1 = 250e-12    // 250pF
C2 = 22e-9      // 22nF
C3 = 22e-9      // 22nF
R1 = 250e3      // 250kΩ (treble pot)
R2 = 1e6        // 1MΩ (bass pot)
R3 = 25e3       // 25kΩ (mid pot)
R4 = 39e3       // 39kΩ (slope resistor)
```

Apply bilinear transform: `s = (2/T) × (z-1)/(z+1)` where T = 1/fs

This yields a **3rd-order IIR digital filter** with 7 coefficients that change when any knob moves. Recalculate coefficients on parameter change (not per-sample — too expensive and unnecessary since knob movements are slow).

**Pot taper modeling:**
- Treble (R1): Linear taper → t ∈ [0, 1] maps linearly
- Bass (R2): Logarithmic taper → l = map_log(knob_position) where map_log(0.5) ≈ 0.1 (10% resistance at noon)
- Mid (R3): Linear taper → m ∈ [0, 1] maps linearly

### 2.5 Power Amp Model

Model the push-pull 6L6GC power stage with these components:

#### 2.5.1 Phase Inverter
- Long-tail pair (LTP) using one 12AX7 — generates two anti-phase signals
- The LTP itself can generate distortion when overdriven (mainly odd harmonics due to differential operation)
- Model as a differential gain stage with soft clipping

#### 2.5.2 Push-Pull Output Stage
- Two pairs of 6L6GC in Class AB
- **Crossover distortion** when bias is cold (the 5150's default state)
- Transfer function for 6L6GC: use the pentode plate current equation

```
Ip = (K * (Vg + Vs/mu)^(3/2))  for Vg + Vs/mu > 0
Ip = 0                           for Vg + Vs/mu <= 0

Where:
  K ≈ 1.4e-6 (transconductance coefficient for 6L6GC)
  mu ≈ 8 (screen-to-grid amplification factor)
  Vg = grid voltage
  Vs = screen voltage
```

#### 2.5.3 Power Supply Sag

```cpp
// Discrete-time power supply model
// V_supply[n] = supply voltage at sample n
// I_load[n] = current draw (proportional to signal amplitude squared)

float R_supply = 150.0f;    // Effective transformer + rectifier resistance (Ω)
float C_filter = 200e-6f;   // Filter cap (F)
float V_idle = 480.0f;      // Idle plate supply voltage (V)

// Time constant
float tau = R_supply * C_filter;  // ~30ms

// Per-sample update
float V_supply = V_supply_prev + (V_idle - V_supply_prev - I_load * R_supply) * (Ts / tau);
```

The sag effect causes:
- **Compression** on transient attacks (supply voltage drops → less headroom → natural compression)
- **Bloom** on sustained notes (supply recovers as current demand stabilizes)
- **Dynamic feel** — harder picking = more sag = spongier response

#### 2.5.4 Output Transformer Saturation

At low frequencies, the output transformer core can saturate, causing:
- Increased even-harmonic distortion at bass frequencies
- Frequency-dependent compression (more at low frequencies)
- A "tightening" effect as the transformer limits low-frequency excursion

Model as a **frequency-dependent soft clipper**:

```cpp
// Low-frequency content drives transformer harder
float lf_content = lowpass_filter(abs(signal), 200.0f);  // ~200Hz and below
float saturation_amount = lf_content / transformer_headroom;
float transformer_out = tanh(signal * (1.0f + saturation_amount * 0.5f));
```

#### 2.5.5 Negative Feedback (Presence & Resonance)

The 5150's presence and resonance controls operate on the **negative feedback loop** from the output transformer secondary back to the phase inverter:

```
Presence: Varies HF content in the feedback signal
  - More presence = less HF negative feedback = more highs in output
  - Model as a variable shelving filter on the feedback path

Resonance: Varies LF content in the feedback signal
  - More resonance = less LF negative feedback = more bass in output
  - Model as a variable shelving filter on the feedback path

Combined feedback model:
  feedback_signal = output × NFB_gain × shelving_filter(presence, resonance)
  phase_inverter_input = input_signal - feedback_signal
```

### 2.6 Bright Cap Switch

When the bright switch is engaged, a small capacitor (typically 120pF–150pF) is placed **across the gain control potentiometer**. This creates a treble bypass that allows high frequencies to pass around the volume pot's attenuation.

The effect is most pronounced at **low gain settings** (where the pot's resistance is high and the cap's reactance is relatively low). At full gain, the pot's resistance approaches zero and the cap has negligible effect.

```cpp
// Bright cap model
// At the gain pot, the effective impedance for HF is:
// Z_parallel = R_pot || (1 / (2π·f·C_bright))
// This creates a first-order high-shelf boost at low gain settings

float C_bright = 120e-12f;  // 120pF
float f_bright = 1.0f / (2.0f * M_PI * R_gain_pot * C_bright);
// At R_gain = 500kΩ: f_bright ≈ 2.65kHz
// Boost amount depends on pot position (more boost at lower gain)
```

### 2.7 Oversampling

**8× minimum oversampling** with polyphase FIR anti-aliasing filters.

Use a **half-band filter cascade** for efficiency:
- 3 stages of 2× upsampling = 8× total
- Each half-band filter needs only ~11–15 taps (every other coefficient is zero)
- Total computation: ~20 multiplies per sample per stage = ~60 multiplies for 8× upsampling

The anti-aliasing filter should have:
- **Passband:** 0 to 20kHz (at base sample rate)
- **Stopband attenuation:** ≥ 80dB (aliasing from high-gain distortion must be inaudible)
- **Transition band:** 20kHz to fs/2 (at base sample rate)

At 48kHz base rate, the oversampled rate is 384kHz, giving ample room for the anti-aliasing filter transition band.

**Process ONLY the nonlinear stages at the oversampled rate.** Linear filters (tone stack, coupling cap filters) can run at the base rate if their coefficients are computed for the base rate.

---

## 3. Signal Chain Implementation Order

```
Input Buffer (unity gain, high-Z)
    │
    ▼
[8× UPSAMPLE]
    │
    ▼
Stage 1: V1a Input Gain
    │ → Waveshaper (12AX7, warm bias)
    │ → HP filter (0.022µF coupling cap, 220kΩ || load)
    │
    ▼
Attenuator (470kΩ/500kΩ gain pot)
    │ → Bright cap (120pF across pot, when switch ON)
    │
    ▼
Stage 2: V1b Second Gain
    │ → Waveshaper (12AX7, warm bias)
    │ → HP filter (0.022µF coupling cap)
    │
    ▼
Attenuator (470kΩ/1MΩ)
    │
    ▼
Stage 3: V2a Third Gain
    │ → Waveshaper (12AX7, warm bias)
    │ → HP filter (0.022µF coupling cap)
    │
    ▼
Stage 4: V2b Fourth Gain
    │ → Waveshaper (12AX7, warm bias)
    │ → HP filter (0.022µF coupling cap)
    │
    ▼
Stage 5: V5a COLD CLIPPER
    │ → Waveshaper (12AX7, very cold bias, asymmetric)
    │ → NO coupling cap HP needed (signal level already limited)
    │ → 0.001µF plate bypass cap (LP filter ~720Hz to kill highs)
    │
    ▼
Attenuator (470kΩ/470kΩ)
    │
    ▼
Stage 6: V5b Primary Distortion Stage
    │ → Waveshaper (12AX7, warm bias, 220k plate load)
    │
    ▼
Cathode Follower (V3b)
    │ → Waveshaper (CF interaction model)
    │
    ▼
FX Loop Attenuator (dumps 99% of signal)
    │
    ▼
FX Recovery Stage (V3a)
    │ → Waveshaper (12AX7, does NOT normally overdrive)
    │
    ▼
[8× DOWNSAMPLE with anti-alias filter]
    │
    ▼
Tone Stack Buffer (cathode follower — model as unity gain buffer)
    │
    ▼
TMB Tone Stack (3rd-order IIR, Yeh/Smith discretization)
    │
    ▼
Master Volume (Post Gain)
    │
    ▼
[8× UPSAMPLE]
    │
    ▼
Phase Inverter (LTP)
    │
    ▼
Push-Pull 6L6GC Power Stage
    │ → Waveshaper (6L6GC pentode curves)
    │ → Power supply sag model
    │ → Crossover distortion (bias-dependent)
    │
    ▼
Output Transformer Model
    │ → Frequency-dependent saturation
    │ → Negative feedback loop (presence/resonance)
    │
    ▼
[8× DOWNSAMPLE with anti-alias filter]
    │
    ▼
Output Level
```

**Optimization note:** The preamp and power amp oversampling can share the same upsample/downsample infrastructure. Consider running the entire nonlinear path at 8× and only the tone stack at base rate (downsample → tone stack → upsample). This requires two oversampler instances but keeps the tone stack computation cheap.

---

## 4. Controls & Parameters

| Control | ID | Type | Range | Default | Taper | Description |
|---------|-----|------|-------|---------|-------|-------------|
| Pre Gain | `preGain` | Float | 0.0–10.0 | 5.0 | Log | Preamp drive level — controls attenuator between V1a and V1b |
| Post Gain | `postGain` | Float | 0.0–10.0 | 3.0 | Log | Master volume — controls level into phase inverter |
| Low | `low` | Float | 0.0–10.0 | 5.0 | Log | Tone stack bass control (1MΩ log pot) |
| Mid | `mid` | Float | 0.0–10.0 | 5.0 | Linear | Tone stack mid control (25kΩ linear pot) |
| High | `high` | Float | 0.0–10.0 | 5.0 | Linear | Tone stack treble control (250kΩ linear pot) |
| Presence | `presence` | Float | 0.0–10.0 | 5.0 | Linear | Power amp NFB high-frequency control |
| Resonance | `resonance` | Float | 0.0–10.0 | 5.0 | Linear | Power amp NFB low-frequency control |
| Bright | `bright` | Bool | On/Off | Off | — | Bright cap across gain pot (~120pF treble bleed) |
| Bias | `bias` | Float | 0.0–10.0 | 3.0 | Linear | Power tube bias. 0=very cold/tight, 10=hot/saggy. Default 3.0 reflects the stock cold-biased 5150. |

**Parameter mapping notes:**
- Pot tapers must be modeled correctly. Audio/log taper: `value = (10^(knob * 2) - 1) / 99` maps [0,10] to [0,1] with log curve
- Linear pots: direct linear mapping `value = knob / 10.0`
- The Pre Gain control should map to the attenuation ratio of the first voltage divider, NOT simply multiply the signal

---

## 5. Factory Presets

| Preset | Pre Gain | Post Gain | Low | Mid | High | Presence | Resonance | Bright | Bias |
|--------|----------|-----------|-----|-----|------|----------|-----------|--------|------|
| **Brown Sound** | 6.0 | 4.0 | 5.5 | 6.0 | 6.0 | 5.0 | 5.0 | Off | 4.0 |
| **Pantera Scoop** | 8.5 | 3.5 | 7.0 | 2.0 | 7.5 | 6.5 | 4.0 | Off | 2.5 |
| **Modern Metal** | 9.0 | 3.0 | 5.0 | 5.0 | 6.5 | 7.5 | 3.5 | Off | 2.0 |
| **Hard Rock** | 5.5 | 5.0 | 5.0 | 6.5 | 5.5 | 4.5 | 5.5 | Off | 5.0 |
| **Crunch** | 3.5 | 5.5 | 5.5 | 7.0 | 5.0 | 4.0 | 5.0 | On | 5.5 |

**Preset design rationale:**
- **Brown Sound:** Mid-gain, balanced EQ with slight mid-push. Warm bias (4.0) for more even-order harmonics and sag. This approximates the classic Van Halen studio tone.
- **Pantera Scoop:** Heavily scooped mids (2.0), high gain (8.5), very cold bias (2.5) for tightness. The low resonance (4.0) keeps the bottom tight. Presence cranked for cutting highs.
- **Modern Metal:** Maximum gain, cold bias for tight palm mutes, high presence for mix cut-through. Mids at noon for balanced chunky rhythm.
- **Hard Rock:** Medium gain, bumped mids for body, moderate bias for warm power section feel. Good dynamics for lead work.
- **Crunch:** Low gain setting where picking dynamics really matter. Bright switch on for clarity at low gain. Hot bias (5.5) for touch sensitivity and sag.

---

## 6. GUI Specification

### 6.1 Visual Design Language

Target aesthetic: **Professional hardware rack unit** (AxeFX / Eventide H9000 inspired). Black chassis, blue LED accents, high-contrast knobs.

**Color palette:**
- Background: `#0A0A0A` (near-black)
- Panel surface: `#1A1A1E` (dark charcoal)
- Accent/LED: `#00A0FF` (5150 blue LED)
- Accent secondary: `#0066AA` (darker blue for inactive/dimmed)
- Knob body: `#2A2A2E` (dark gray)
- Knob pointer: `#FFFFFF` (white indicator line)
- Text primary: `#E0E0E0` (light gray)
- Text secondary: `#808090` (muted)
- Bezel/border: `#333340` (subtle panel borders)

### 6.2 Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   ██████  ██████  █████  ██    ██ ██████ ██    ██                  │
│   ██   ██ ██     ██   ██ ██    ██ ██      ██  ██                   │
│   ██████  █████  ███████ ██    ██ █████    ████                    │
│   ██      ██     ██   ██  ██  ██  ██        ██                     │
│   ██      ██████ ██   ██   ████   ██████    ██                     │
│                                                                     │
│                    BLOCK LETTER 5150                                 │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  Preset: [▼ Brown Sound                                   ] │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌──── PREAMP ────┐  ┌───── TONE ─────┐  ┌──── POWER ────┐      │
│   │                 │  │                 │  │                │      │
│   │  (PRE)  (POST)  │  │ (LOW)(MID)(HI) │  │ (PRES)(RES)   │      │
│   │   ◎      ◎     │  │  ◎    ◎    ◎   │  │   ◎     ◎     │      │
│   │                 │  │                 │  │                │      │
│   │ [BRIGHT]        │  │                 │  │  (BIAS)        │      │
│   │   ○ LED         │  │                 │  │    ◎           │      │
│   └─────────────────┘  └─────────────────┘  └────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3 PEAVEY Block Letter Logo

Render the "PEAVEY" text in the distinctive **block letter** style — bold, uppercase, wide-spaced sans-serif. The original logo uses a heavy slab/block font.

Implementation: Custom-paint the logo text using JUCE `Graphics::drawText()` with:
- Font: Heavy/Black weight sans-serif (Bebas Neue, Oswald Bold, or custom drawn)
- Size: Scaled to ~15% of window width
- Color: White (`#FFFFFF`) or light gray with subtle drop shadow
- "BLOCK LETTER 5150" subtitle in smaller text below, in the blue accent color

### 6.4 Knob Rendering

Custom `LookAndFeel` painted knobs:
- **Dark body** with metallic edge gradient
- **White pointer line** from center to edge
- **Blue LED ring** around base showing current value (0–270° arc)
- **Value readout** appears on hover/drag
- Knob size: scales with window, minimum 40px diameter

### 6.5 Responsive Layout

- Default window: 800×500
- Minimum: 640×400
- Use `juce::AffineTransform` for global scaling based on window size
- HiDPI: Use `getDesktopScaleFactor()` and render at native resolution
- All custom painting should use relative coordinates (percentages of panel size)

---

## 7. Technical Specifications Summary

| Parameter | Value |
|-----------|-------|
| Modeling approach | Per-stage waveshaping + component-modeled tone stack + power supply sag |
| Oversampling | 8× (polyphase half-band FIR cascade) |
| Anti-alias stopband attenuation | ≥ 80dB |
| Processing | Sample-by-sample, zero additional latency |
| Supported sample rates | 44.1kHz, 48kHz, 88.2kHz, 96kHz |
| Signal routing | Mono in / mono out |
| CPU target | < 15% single core at 48kHz on modern x86_64 |
| Buffer size | 256 samples or higher |
| Build system | CMake with FetchContent for JUCE 7.x |
| Compiler | GCC 12+ or Clang 15+ |
| Target platform | Linux x86_64 (Fedora / Ubuntu) |
| Audio backend | ALSA (via JUCE) |
| Plugin format | Standalone application only (future: VST3/LV2) |

---

## 8. Project Structure

```
peavey-5150-sim/
├── CMakeLists.txt
├── README.md
├── LICENSE                          (MIT)
├── Source/
│   ├── PluginProcessor.h/.cpp       Main audio processor — manages parameter tree, signal chain
│   ├── PluginEditor.h/.cpp          GUI — custom LookAndFeel, knob layout, preset selector
│   ├── DSP/
│   │   ├── PreampStage.h/.cpp       All 6 preamp gain stages + cold clipper + CF interaction
│   │   ├── ToneStack.h/.cpp         Yeh/Smith 3rd-order IIR with 5150 component values
│   │   ├── PowerAmp.h/.cpp          Phase inverter + push-pull 6L6GC + sag + transformer + NFB
│   │   ├── Oversampler.h/.cpp       8× polyphase FIR up/downsampling
│   │   └── TubeModels.h/.cpp        12AX7 and 6L6GC waveshaping transfer functions
│   ├── Presets/
│   │   └── FactoryPresets.h         5 named preset parameter snapshots
│   └── Utils/
│       └── Profiler.h/.cpp          Per-buffer timing, CPU% estimate, console output
└── Resources/
    └── (fonts or SVG assets if needed)
```

---

## 9. Build Instructions (for README.md)

### Prerequisites

**Fedora:**
```bash
sudo dnf install gcc-c++ cmake make alsa-lib-devel freetype-devel \
    libX11-devel libXrandr-devel libXinerama-devel libXcursor-devel \
    mesa-libGL-devel libcurl-devel webkit2gtk4.1-devel
```

**Ubuntu:**
```bash
sudo apt install build-essential cmake libasound2-dev libfreetype6-dev \
    libx11-dev libxrandr-dev libxinerama-dev libxcursor-dev \
    libgl1-mesa-dev libcurl4-openssl-dev libwebkit2gtk-4.1-dev
```

### Build

```bash
git clone https://github.com/YOUR_USERNAME/peavey-5150-sim.git
cd peavey-5150-sim
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j$(nproc)
```

### Run

```bash
./build/Peavey5150Sim_artefacts/Release/Standalone/Peavey5150Sim
```

---

## 10. Key Academic & Community References

1. **Yeh & Smith**, "Discretization of the '59 Fender Bassman Tone Stack", DAFx-06 (2006) — Closed-form tone stack digital filter coefficients. Direct application to 5150 with substitute component values.
2. **Yeh**, "Digital Implementation of Musical Distortion Circuits by Analysis and Simulation", PhD Thesis, Stanford CCRMA (2009) — Comprehensive treatment of waveshaping, tone stacks, and circuit simulation for guitar amps.
3. **Amp Books** (ampbooks.com) — Richard Kuehnel's preamp distortion DSP tutorial, power supply sag model, and tone stack analysis. Most directly applicable methodology.
4. **Rob Robinette** (robrobinette.com) — Annotated SLO-100 schematic with signal path analysis. The 5150 lead channel is architecturally derived from this circuit.
5. **Fractal Audio MIMIC whitepaper** (2013) — Endorses per-stage triode simulation over single-waveshaper approaches.
6. **Peavey EVH 5150 Schematic** — Available from thetubestore.com and el34world.com/Hoffman.
7. **Soldano SLO-100 Schematic** — Available from schematicheaven.net. The 5150 lead channel shares nearly identical gain stage topology and component values (per multiple sources including JCFonline comparisons).
8. **Peavey Forums** (forums.peavey.com) — Confirmed tube layout and signal path by Peavey Service Manager Roger Crimm. Key threads: t=23290, t=43922.
9. **Audun Melbye** (audunmelbye.no) — Comprehensive 5150/6505 mod guide with component value comparisons between original 5150 and 5150II.
10. **Freestompboxes.org "BAJA EVH" project** — Community-built 5150 preamp pedal with SPICE-verified frequency response matching the original amp schematic.
11. **SwankyAmp** (github.com/resonantdsp/SwankyAmp) — Open-source JUCE tube amp sim using SPICE-derived empirical models. Reference for FAUST/C++ DSP architecture.
12. **Pakarinen & Yeh**, "A Review of Digital Techniques for Modeling Vacuum-Tube Guitar Amplifiers", Computer Music Journal 33(2), 2009 — Survey of waveshaping, WDF, and state-space methods.

---

## 11. Known Limitations & Future Work

### What This Model Approximates

- **Waveshaping vs. circuit simulation:** We use static waveshaping transfer functions rather than full SPICE-level circuit simulation. This captures the steady-state nonlinear behavior but may miss some dynamic interactions between stages (e.g., bias shifts from signal-dependent DC currents).
- **Tone stack:** The Yeh/Smith discretization is mathematically exact for the linear tone stack circuit, but in the real amp, the driving impedance of the cathode follower and the loading of the master volume pot subtly affect the response. We assume ideal buffered input (1kΩ source) and 1MΩ load.
- **Power supply sag:** Modeled as a first-order system. Real power supply dynamics involve multiple filter stages with different time constants. The model captures the primary sag effect but may not perfectly replicate the recovery envelope.
- **Output transformer:** Simplified saturation model. Real transformer behavior involves hysteresis, frequency-dependent core losses, and leakage inductance. A full WDF transformer model (per Pakarinen et al.) would be more accurate but much more expensive.

### Future Improvements

1. **Antiderivative Anti-Aliasing (ADAA):** Apply ADAA to the waveshaping functions for better aliasing suppression, potentially allowing reduced oversampling factor.
2. **State-space DK method:** Replace individual waveshapers with a nodal analysis solver for more accurate stage-to-stage interaction.
3. **Guitar pickup impedance interaction:** Model the input impedance loading effect on different pickup types.
4. **VST3/LV2 plugin formats:** Currently standalone only.
5. **Stereo processing** for wet/dry or dual-amp configurations.
6. **IR loader integration** (as a separate companion plugin).

---

## 12. Licensing & Legal Notice

This project is released under the **MIT License**.

This is an independently developed digital signal processing model inspired by publicly available circuit analysis, academic research, and community knowledge about the Peavey 5150 amplifier architecture. It is not affiliated with, endorsed by, or sponsored by Peavey Electronics, EVH, Fender Musical Instruments, or Soldano Custom Amplification. "Peavey", "5150", "6505", "Soldano", and "SLO" are trademarks of their respective owners. This software does not contain any proprietary code, firmware, or intellectual property from any amplifier manufacturer.

The circuit topology modeled here (cascaded triode gain stages with TMB tone stack and push-pull power amplifier) is a standard vacuum tube amplifier architecture that has been in the public domain since the 1950s. Component values are derived from publicly available schematics, community measurements, and published academic analysis.