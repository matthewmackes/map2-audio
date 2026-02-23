# MAP2 Audio Platform — Gemini Image Generation Brief
## Movie Poster / Audio Announcement Ad

**Prompt Author**: MAP2 Development Team, 2026-02-22
**Target Model**: Google Gemini (Imagen 3 or Gemini 2.0 Flash experimental image generation)
**Output Format**: Portrait poster (2:3 ratio, minimum 2048×3072 px, or landscape 16:9 for digital banner)

---

## What MAP2 Is (context for Gemini)

MAP2 is a professional open-source audio platform that connects musicians, producers, and audio engineers across a network using IEEE 802.1 Audio Video Bridging (AVB) — the same technology used in concert halls, broadcast studios, and live touring rigs. It runs LV2 audio plugins in real time, exposes a REST API, and operates entirely on open standards: no proprietary dongles, no vendor lock-in, just pure networked audio.

---

## Prompt A — Cinematic Movie Poster (Dark/Epic Style)

**Paste this prompt directly into Gemini:**

```
Create a cinematic movie poster for "MAP2" — a professional open-source networked audio platform. The poster should feel like a high-budget sci-fi/thriller or prestige tech documentary.

VISUAL CONCEPT:
- Background: A vast, dark concert hall or server room that dissolves into a glowing network of light streams — AVB (Audio Video Bridging) data packets visualized as luminous fiber-optic threads connecting nodes across a city skyline at night
- Center: A bold, professional musician or audio engineer at a mixing console, silhouetted against the glowing network, hands on faders, facing the viewer with confidence — the network literally emanates from the console outward
- Floating holographic HUD elements subtly integrated: waveform spectrum analyzer, routing matrix grid (rows × columns of glowing connection points), lock-free ring buffer visualized as spinning rings, and tiny IEEE standard badges (IEEE 1722, 1722.1, 802.1Q)
- Color palette: Deep electric blue (#0a1628), cyan (#00d4ff), warm amber for analogue warmth (#ff9500), pure white text, subtle red accents for metering peaks

TYPOGRAPHY (critical — exact text):
- Title (massive, bold, wide-spaced): "MAP2"
  - Subtitle directly below title (medium weight, tracked): "MULTI-AUDIO PLATFORM"
  - Below subtitle, a thin separator line, then in smaller caps: "OPEN STANDARDS. REAL-TIME. NETWORKED."

- Left vertical sidebar (small caps, glowing cyan, stacked vertically reading bottom-to-top):
  "IEEE 1722  ·  IEEE 1722.1  ·  IEEE 802.1Q  ·  LV2  ·  JACK  ·  FastAPI  ·  JUCE 8"

- Bottom third (announcement block, dark translucent background panel):
  Large headline: "PROFESSIONAL AVB AUDIO. NOW OPEN SOURCE."
  Sub-line: "AVB Stream Routing · AVDECC Discovery · SRP Reservation · LV2 Plugin Engine · REST API"
  Tagline (italicized, small): "Tier 2 Professional — 8.9/10 Standards Compliance"

- Very bottom, fine print row: "avtp · avdecc · acmp · srp · aes67-compatible · pipewire · ptp · jack · lv2 · rest"

MOOD & REFERENCES:
- Reference films: Blade Runner 2049 (color palette), Interstellar (scale and awe), The Social Network (precision and intelligence)
- NOT: gaming, cyberpunk graffiti, neon-on-black clichés — keep it elegant, professional, and trustworthy
- The overall feeling: This is serious professional audio infrastructure, as consequential as the internet itself

TECHNICAL SPECS:
- Portrait orientation, 2:3 aspect ratio
- Ultra-high detail, photorealistic lighting
- No watermarks, no company logos other than "MAP2"
```

---

## Prompt B — Audio Announcement Ad (Horizontal Banner / Social Media)

**Paste this prompt directly into Gemini:**

```
Create a professional horizontal advertisement banner (16:9) for MAP2, an open-source professional audio platform.

LAYOUT (left to right, three panels):
LEFT PANEL (dark background, 35% width):
- Large bold monogram "M2" in geometric sans-serif
- Below: "MAP2" full name in slightly smaller weight
- Below: "Multi-Audio Platform" in light weight
- Glowing ring around the "M2" monogram — the ring is made of tiny data packets flowing in a circuit, representing AVB network streams

CENTER PANEL (gradient from dark to lighter dark, 40% width):
- Feature list with glowing checkmarks (use ✓ or a circular dot):
  ✓ AVB Networked Audio — IEEE 1722 AVTP
  ✓ AVDECC Device Discovery — IEEE 1722.1
  ✓ SRP Stream Reservation — fail-closed safety
  ✓ LV2 Plugin Engine — NAM, WDF Amp, Convolution IR
  ✓ REST API — FastAPI + Python + JUCE C++ Engine
  ✓ PipeWire / JACK — real-time low latency
  ✓ Open Standards — no proprietary lock-in
- Below feature list, a small horizontal rating bar: "Standards Score: 8.9 / 10 ████████░░"
- Rating classification: "Tier 2 Professional / Production-Ready"

RIGHT PANEL (lighter accent background, 25% width):
- Call to action text:
  "NOW AVAILABLE"
  "github.com/matthewmackes/map2-audio"
  Below: "Free. Open Source. Production Ready."
- Small icon strip at bottom: waveform icon, network node icon, plugin icon, API brackets icon — arranged in a neat row
- Background texture: subtle circuit-board trace pattern at low opacity

COLOR PALETTE:
- Background: #0a1628 (deep navy) fading to #0d2137
- Accent: #00d4ff (electric cyan) for checkmarks, highlights, and outlines
- Secondary accent: #ff9500 (amber) for "NOW AVAILABLE" and key values
- White: #ffffff for primary text
- Muted: #6b8fa8 for secondary/fine print text

TYPOGRAPHY:
- Headings: Bold geometric sans-serif (like Inter, Neue Haas Grotesk, or Helvetica Neue Bold)
- Body: Regular weight, high legibility at banner scale
- NO script fonts, NO decorative fonts — this is a professional B2B product

MOOD:
- Professional audio equipment catalog meets modern developer tool landing page
- Think: Focusrite, Universal Audio, or Cloudflare branding — clean, trustworthy, premium
- NOT: stock photo microphone, NOT generic music notes background
```

---

## Prompt C — Minimalist Announcement Card (Square, Social Post)

**Paste this prompt directly into Gemini:**

```
Create a square (1:1) minimalist announcement graphic for MAP2, a professional open-source AVB audio platform. Inspired by Apple keynote slides and Dieter Rams product design — maximum simplicity, maximum impact.

DESIGN:
- Background: Pure deep navy #0a1628
- Center: The text "MAP2" in massive, ultra-bold, white geometric typeface — taking up 60% of the width
- Below title: A single thin horizontal line in #00d4ff (electric cyan)
- Below line, centered small caps:
  "AVB · LV2 · JACK · REST API"
  "OPEN STANDARDS AUDIO PLATFORM"

- Bottom quarter: Three short columns of tiny text (very small, muted color #6b8fa8):
  Column 1: "IEEE 1722 AVTP / IEEE 1722.1 AVDECC / IEEE 802.1Q Priority"
  Column 2: "SRP Stream Reservation / ACMP Connection Control / AEM Device Model"
  Column 3: "JUCE 8 C++ Engine / FastAPI REST / PipeWire JACK / LV2 Plugins"

- Top right corner: A tiny glowing network topology diagram (just 5–6 nodes connected by lines, like a simplified mesh) — about 80px in size — in cyan, very subtle

- Optional: A very faint radial gradient from center (slightly lighter) to edges — no other visual elements

STYLE: Bauhaus / International Typographic Style. Zero decoration. Zero gradients beyond the subtle center glow. Zero photography. Pure type and geometry.
```

---

## Additional Guidance for Best Results

### Image Generation Tips
- If Gemini adds unwanted visual noise, add: **"ultra-clean, no visual clutter, no lens flares, no bokeh"**
- For typography precision, add: **"exact text placement, typographically precise, no text errors"**
- For the dark aesthetic, add: **"shot on ARRI ALEXA, cinematic color grade, deep shadows"**
- To avoid generic stock imagery, add: **"not a stock photo, not a generic music background, original graphic design"**

### Iteration Suggestions
1. Generate Prompt A first — it gives the most dramatic result for announcements
2. Use Prompt B for LinkedIn / developer community posts
3. Use Prompt C for social media (Twitter/X, Mastodon) square format
4. Ask Gemini to vary: **"Generate 4 variations of this with different color temperatures"**
5. For a lighter "day" version: replace `#0a1628` with `#f0f4f8` and cyan with `#0066cc`

### Text to Emphasize in Any Variant
These phrases best capture MAP2's differentiation — include at least 2 in any ad:
- **"Professional AVB. Fully Open Source."**
- **"IEEE 1722 · 1722.1 · 802.1Q — Not Proprietary."**
- **"8.9/10 Standards Compliance. Tier 2 Professional."**
- **"NAM · LV2 · AVDECC · SRP · REST — All in One."**
- **"Real-Time Networked Audio. Zero Vendor Lock-In."**

---

*Brief prepared from MAP2 AVB Standards Rating Report (docs/AVB_STANDARDS_RATING_REPORT.md)*
*Platform: github.com/matthewmackes/map2-audio*
