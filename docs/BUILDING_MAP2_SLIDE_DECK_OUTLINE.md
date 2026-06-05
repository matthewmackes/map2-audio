# Building MAP2 — Slide-by-Slide Deck Outline (for Microsoft Copilot 365 / PowerPoint)

> **This document is a build specification for an AI slide generator (Microsoft Copilot in PowerPoint 365).**
> It is the companion to `BUILDING_MAP2_A_CHRONOLOGICAL_GUIDE.md`. Where the guide is prose, this is a slide blueprint: one block per slide, with on-screen text, speaker notes, layout, and art direction.

---

## ★ INSTRUCTIONS TO THE AI (READ BEFORE GENERATING)

**Copilot, follow these rules for the entire deck:**

1. **Make every slide visually creative.** Do not produce plain bullet-on-white slides. Use full-bleed background images, color overlays, large numerals, timeline ribbons, icon rows, two-column splits, and bold section dividers. Vary the layout from slide to slide so no two consecutive slides look the same.
2. **Pull artwork ONLY from free / open-source / public-domain sources**, and prefer images that are royalty-free for presentations. Recommended sources, in order of preference:
   - **Unsplash** (unsplash.com) — free, high-resolution photography
   - **Pexels** (pexels.com) — free stock photos and video
   - **Wikimedia Commons** (commons.wikimedia.org) — public-domain and Creative Commons imagery, great for diagrams and hardware
   - **Openverse** (openverse.org) — searches many CC-licensed libraries at once
   - **unDraw** (undraw.co) — free, recolorable vector illustrations (set accent to the deck's blue)
   - **The Noun Project** / **Tabler Icons** / **Material Symbols** — free icons
   - **Pixabay** (pixabay.com) — free photos and vectors
   Each slide below includes **suggested search terms** in *italics*. Use those terms on the sources above.
3. **Attribute Creative Commons images** in a small footer credit line where the license requires it. Public-domain and Unsplash/Pexels images do not require attribution but a small credit is courteous.
4. **Apply a consistent visual theme** (defined in the "Design System" block below) across every slide: same fonts, same accent colors, same footer.
5. **Use the speaker notes** provided under each slide as the PowerPoint "Notes" for that slide, word for word or lightly trimmed.
6. **Keep on-slide text short.** The bullet text shown is the maximum — shorten further if it looks crowded. The detail belongs in the speaker notes, not on the slide.
7. **Add subtle motion**: gentle fade or "Morph" transitions between slides, and a one-step build (appear) for bullet lists so points reveal as the speaker talks.

---

## ★ DESIGN SYSTEM (apply to all slides)

- **Mood:** confident, modern, engineering-meets-music. Think "pro audio product launch."
- **Primary accent:** electric blue `#0F62FE` (this is the real MAP2/Carbon interface blue).
- **Secondary accents:** cyan `#00D9FF`, magenta `#FF006E` (these are the real signal-slot colors used in the app).
- **Neutrals:** near-black `#161616` backgrounds, white `#FFFFFF` text, warm gray `#8D8D8D` for secondary text.
- **Fonts:** Headings in a strong geometric sans (e.g., *Montserrat*, *Poppins*, or PowerPoint's *Segoe UI Semibold*). Body in *Segoe UI* or *Inter*.
- **Recurring motif:** a thin horizontal "signal chain" line with small node dots — use it as a divider or footer element to tie slides together (it echoes the app's actual signal-chain view).
- **Footer (every slide except title):** small text left — "Building MAP2: From Pedalboard to Platform" · small text right — slide number.
- **Tone of imagery:** dark studio photography, circuit/network close-ups, live-music silhouettes, clean dashboard UI. Avoid clip-art and cheesy stock business handshakes.

---

# THE SLIDES

---

## SLIDE 1 — TITLE

- **Layout:** Full-bleed dark background image with a large centered title and a thin glowing signal-chain line beneath it.
- **On-slide text:**
  - Title: **Building MAP2**
  - Subtitle: *From a Pedalboard Idea to a 4,800-Commit Audio Platform*
  - Small line: One person · heavy AI assistance · 4 months · built in the open
- **Art direction:** *dark recording studio*, *guitar pedalboard glowing*, *audio mixing console low light*. Apply a dark navy-to-black gradient overlay so white text pops.
- **Creative touch:** animate the thin signal-chain line drawing itself left-to-right on entry.
- **Speaker notes:** "This is the story of how a simple idea — putting a guitar pedalboard inside a computer — grew over four months into a full real-time audio platform of nearly 4,800 commits. I built it solo, with a lot of help from AI tools. I want to walk you through not just *what* it became, but what the experience of building it taught me."

---

## SLIDE 2 — THE BIG PICTURE (One Paragraph)

- **Layout:** Left third = a striking vertical image; right two-thirds = one bold pull-quote, no bullets.
- **On-slide text (pull-quote):**
  > "What if a guitar pedalboard lived inside a computer instead of on the floor? That one question kept growing — until it became a platform that can process an entire band, link many machines over a network, and be run from a web browser."
- **Art direction:** *electric guitar plugged into laptop*, *home studio setup night*. Use a duotone (blue/black) treatment.
- **Speaker notes:** "Before the timeline, here's the whole story in one breath. MAP2 turns a cheap Linux computer into a professional-grade audio processor. It started tiny and kept expanding in every direction — more effects, more machines, more ways to control it. Keep that arc in mind as we go through the months."

---

## SLIDE 3 — THE PROBLEM IT SOLVES

- **Layout:** Split comparison. Left = "Today" (messy). Right = "MAP2" (clean). A bold arrow or "vs" between them.
- **On-slide text:**
  - Left header: **Today** — Every device has its own chip · Sound converts back and forth · Delay + quality loss · A bundle of cables to the soundboard
  - Right header: **MAP2** — One shared digital backbone · Stays digital, input to recording · One network cable for the whole band · Runs like an appliance
- **Art direction:** Left: *tangled audio cables backstage*. Right: *single ethernet cable clean*, *modern server appliance*. Use red-ish tint on the left, blue tint on the right.
- **Speaker notes:** "Modern bands are already digital. But every device converts the sound separately, adding delay and losing a little quality each time. MAP2's idea is one shared digital backbone the whole band plugs into — the sound stays clean from the moment it enters until it's recorded. And instead of an expensive, fragile PC in every room, you use one small cheap machine that just works, like an appliance."

---

## SLIDE 4 — THE THREE BUILDING BLOCKS

- **Layout:** Three tall cards side by side, each with a big icon, a title, and one line. Connect them with the thin signal-chain motif.
- **On-slide text:**
  - Card 1 — **Audio Engine** · The "brain" that processes sound in real time · *C++ / JUCE*
  - Card 2 — **Backend** · The "manager" for settings, saving, coordination · *Python / FastAPI*
  - Card 3 — **Web Dashboard** · The screens you click to control it · *React*
- **Art direction:** icons from Tabler/Material — a CPU/waveform for the engine, a gear/server for the backend, a browser window for the dashboard. Subtle blue glow behind each card.
- **Speaker notes:** "The whole project is really three layers working together. The Audio Engine, written in C++, is the brain that processes sound. The Backend, in Python, is the manager that handles settings and coordination. And the Web Dashboard, in React, is what you actually click on. The central challenge of the entire build was keeping these three in sync — and fast enough for live music."

---

## SLIDE 5 — SECTION DIVIDER: "The Timeline"

- **Layout:** Full-bleed bold section divider. Huge word, minimal else.
- **On-slide text:** **THE TIMELINE** — *4 months · ~4,800 commits · 6 phases*
- **Art direction:** *long exposure light trails*, *time-lapse motion*. Heavy black overlay, accent-blue text.
- **Speaker notes:** "Let's walk through it month by month. The shape of the project's output tells its own story."

---

## SLIDE 6 — TIMELINE AT A GLANCE (The Hero Data Slide)

- **Layout:** A horizontal bar chart or timeline ribbon showing commits per month. This is the single most important data visual in the deck — make it large and beautiful.
- **On-slide data (commits per month, 2026):**
  - January — 15 — *The idea*
  - February — 341 — *A real engine*
  - March — 770 — *A control hub*
  - April — **2,145** — *Peak month*
  - May — 1,432 — *Cleanup*
  - June — 91 — *Polish*
- **Art direction:** Animated bars that grow on entry. Make April's bar the tallest and accent-colored so it visually dominates. Thin signal-chain line as the baseline axis.
- **Speaker notes:** "This chart is the story in one picture. A slow, careful start in January and February. Then acceleration once the foundations were solid. April was the peak — more commits than the first three months combined. Then a deliberate slowdown to clean up and polish. The big lesson hiding here: the quiet early months are what *earned* the explosive output later."

---

## SLIDE 7 — PHASE 0: THE IDEA & THE NAME (Late January)

- **Layout:** Left = big "01 / JAN" numeral block; right = 3 short points + a tiny quote.
- **On-slide text:**
  - **Phase 0 — The Idea** (Jan 28–31)
  - First commit literally named *"Initial commit"*
  - A README written like a manifesto — the "why" before the "what"
  - Day 3: first working signal chain + first MIDI control
  - Quote: *"A fun project, maintained by one person."*
- **Art direction:** *blank notebook with pen and coffee*, *first sketch on whiteboard*. Warm, early-morning tone.
- **Speaker notes:** "It began on January 28th. The very first thing wasn't code — it was a README that read like a manifesto, explaining *why* this should exist. Starting with the 'why' instead of the 'what' guided thousands of later decisions. Within three days the first real feature appeared: effects connected in a row, and a foot controller to switch between them."

---

## SLIDE 8 — PHASE 1: A REAL ENGINE & A NEW NAME (Early February)

- **Layout:** Right = big "02 / FEB" numeral; left = 3 points. Include a small "before → after" name chip: *"Project" → "MAP2"*.
- **On-slide text:**
  - **Phase 1 — Identity** (Feb 1–4)
  - Officially named **Mackes Audio Platform 2 (MAP2)**
  - Native C++ effects + famous studio emulations (Eventide, Lexicon-style)
  - **Snapshots** born: save & recall a whole rig
  - The big early bet: built for **many machines**, not one
- **Art direction:** *vintage rack-mount studio gear*, *Eventide-style hardware*, *server rack*. Blue duotone.
- **Speaker notes:** "Early February is where the project found its identity and got its name. It gained real C++ effects and emulations of legendary studio hardware. But the most important decision was invisible to users: it was designed from the start to run on *many machines at once*. Building that assumption in early — before it was even needed — shaped everything that came after."

---

## SLIDE 9 — PHASE 2: THE BIG VISION (The "Digital Snake")

- **Layout:** Full-bleed diagram slide. Show a simple stage-to-soundboard concept: many instruments → one network cable → mixing desk.
- **On-slide text:**
  - **The Vision: AVB — audio over one network cable**
  - Timing accurate to **less than a millionth of a second**
  - Replace a thick bundle of analog cables with **one Ethernet cable**
  - The "digital snake": the whole band, perfectly in sync
- **Art direction:** *live concert stage from above*, *ethernet cable macro*, *network switch lights*. Or build a clean custom diagram: guitar/bass/keys/drums icons → switch → FOH desk. unDraw has network illustrations.
- **Speaker notes:** "Mid-February, the grand vision got formally documented. AVB is a networking standard that carries audio over a regular Ethernet cable with incredibly precise timing — accurate to less than a millionth of a second. The dream is a 'digital snake': instead of a thick bundle of analog cables from the stage to the soundboard, a single network cable carries the entire band, perfectly synchronized."

---

## SLIDE 10 — PHASE 2: THE FIRST HARD LESSONS (Real-Time)

- **Layout:** Dark, tense slide. A large "1.33 ms" number dominates. Three small fix-cards below.
- **On-slide text:**
  - **Real-time is unforgiving: deliver sound every 1.33 ms — or you hear a click**
  - Feb 17 — Rebuilt metering to never pause the audio ("lock-free")
  - Feb 24 — Fixed a crash when a pitch setting hit exactly zero
  - Feb 25 — Plugin crashes fixed across *four* layers at once
  - **Rule born here: "Done means clean build."**
- **Art direction:** *oscilloscope waveform*, *red warning light*, *circuit board macro*. High-contrast, slightly tense mood.
- **Speaker notes:** "While the documents described the dream, the code had to survive reality. Real-time audio is unforgiving — the software must deliver the next chunk of sound every 1.33 milliseconds, no matter what. A tiny delay means an audible click. February was a crash course, sometimes literally, in writing software that cannot stutter. Code that works 999 times out of 1,000 is broken for live music. A rule was born here that lasted the whole project: nothing is 'done' until it builds clean and passes its tests."

---

## SLIDE 11 — PHASE 3: FROM GUITAR TOOL TO CONTROL CENTER (March)

- **Layout:** "03 / MAR" numeral + an icon grid of the new capabilities (8 small icons).
- **On-slide text:**
  - **Phase 3 — The MIDI Hub** (March, 770 commits)
  - One day (Mar 8): a dozen connected features shipped
  - Routing matrix · patchbay · scripting · clock sync · OSC · MIDI 2.0
  - **Tesira parity** — now aiming at the pro-install market, not just musicians
- **Art direction:** *MIDI keyboard and cables*, *patchbay close-up*, *commercial AV rack*. Icon grid from Tabler.
- **Speaker notes:** "March doubled the project's output. The headline was the MIDI Hub, which turned MAP2 from a guitar-effects tool into a universal control center. On March 8th alone, more than a dozen connected features shipped — routing, scripting, clock sync, and more. It also gained compatibility with professional commercial audio systems. The project was now aiming far beyond musicians. The lesson: scope grows fast, and managing that growth becomes its own skill."

---

## SLIDE 12 — PHASE 4: THE BUSIEST MONTH (April)

- **Layout:** Bold, energetic. A giant **2,145** number as the focal point, with four small thread-cards around it.
- **On-slide text:**
  - **April — 2,145 commits — more than Jan–Mar combined**
  - **Snapshots grow up** — "Go Live" with a safety preview of every change
  - **Real hardware** — device-packs (e.g., Maschine MK1)
  - **The "ship loop"** — AI agents iterating in steady cycles, human steering
  - **Design decision** — adopted IBM's Carbon design system
- **Art direction:** *long-exposure city motion*, *Maschine MK1 controller*, *fast assembly line*. Energetic, accent-heavy.
- **Speaker notes:** "If one slide captures raw output, it's this one. April had more commits than January through March combined. Snapshots matured into a system that previews every change before it goes live. The platform learned to deeply support real hardware through a clean 'device-pack' system. And this is when the 'ship loop' appeared — AI agents working through the task list in repeating cycles while I reviewed and steered. That working method is what made this volume possible."

---

## SLIDE 13 — PHASE 5: THE GREAT CLEANUP (May)

- **Layout:** Calmer, "tidy" aesthetic. Show a "delete / isolate" metaphor. Left = old tangle, right = clean separated boxes.
- **On-slide text:**
  - **Phase 5 — Paying down debt** (May, 1,432 commits)
  - Methodically removed an old MIDI library — step by step
  - May 8: deleted the old hardware path entirely
  - New design: hardware lives in a **separate, crash-isolated process**
  - **If a controller crashes, the audio keeps playing**
- **Art direction:** *organized cable management*, *clean server room*, *minimalist desk*. Cool, calm tones.
- **Speaker notes:** "May was the unglamorous but essential work: removing old, duplicated code so the platform would last. The biggest effort moved all hardware communication into a separate, isolated process. The payoff is a mature design principle: if a misbehaving controller crashes, the audio engine keeps running. Deleting code turned out to be as important as writing it. Isolate the risky parts so the critical parts stay safe."

---

## SLIDE 14 — PHASE 6: POLISH & TOOLING (June)

- **Layout:** "06 / JUN" numeral + 3 refinement points + a "software factory" framing line.
- **On-slide text:**
  - **Phase 6 — Polish & automation** (June)
  - Reusable AI "skills" that know the project's rules
  - An automatic design-rule "ratchet" — fixes accumulate, never slip back
  - Live progress streaming instead of silent 60-second waits
  - **By June, MAP2 wasn't just software — it was a software *factory***
- **Art direction:** *robotic arm precision*, *quality-control inspection*, *polished metal surface*. Clean and precise.
- **Speaker notes:** "The final stretch was refinement and building tools to manage the platform's own growth. Reusable AI skills taught the assistants the project's specific rules. An automated 'ratchet' slowly forces every screen to follow the design standards and never lets old habits creep back. A project this size needs tools that enforce its own rules automatically. By June, MAP2 had guardrails, checklists, and automated reviewers built in."

---

## SLIDE 15 — SECTION DIVIDER: "What Held It Together"

- **Layout:** Full-bleed divider.
- **On-slide text:** **THE DISCIPLINE** — *Why a solo project reached this scale without falling apart*
- **Art direction:** *steel cables under tension*, *suspension bridge structure*. Strong, structural imagery.
- **Speaker notes:** "Beyond the timeline, a handful of habits ran through the entire project. These are the real reason it held together."

---

## SLIDE 16 — THE ENGINEERING DISCIPLINE (6 Habits)

- **Layout:** A clean 2×3 grid of six icon-cards.
- **On-slide text:**
  1. **One master to-do list** — no side lists, no hidden plans
  2. **"Done means clean build"** — no half-finished work counts
  3. **Test the real version** — never the shortcut "dev" mode
  4. **Two safe copies always** — pushed to GitHub *and* GitLab
  5. **Write down every lesson** — *"IT REMEMBERS"*
  6. **Protect the real-time core** — its own CPU cores, shielded from crashes
- **Art direction:** six matching line icons (checklist, hammer, browser, cloud-backup, brain/book, shield). Consistent style, accent-blue.
- **Speaker notes:** "Six habits carried the whole thing. A single master to-do list tracked thousands of changes. Nothing was 'done' until it built clean. We always tested the real, fully-built version, because the quick development version hides bugs. Every change was backed up to two services. Every solved bug was written into a permanent lessons file — the docs literally say 'IT REMEMBERS.' And the most important code, the audio brain, was given its own CPU cores and shielded from everything else."

---

## SLIDE 17 — HONEST REFLECTIONS (The Heart of the Talk)

- **Layout:** Five short reflection lines, generous spacing, calm. Maybe a soft portrait-style background.
- **On-slide text:**
  - **AI was a force multiplier, not a replacement** — human sets vision + rules; AI handles volume
  - **The boring months mattered most** — foundations earned the speed
  - **Real-time is a different world** — software that *cannot* pause
  - **Scope will grow — plan for it** — the multi-machine bet paid off
  - **It was supposed to be fun** — *"something I enjoy tinkering with"*
- **Art direction:** *person at desk dawn light*, *calm workspace*. Softer, more human and reflective than the rest of the deck.
- **Speaker notes:** "A few honest reflections — and these are the heart of the talk. AI was a force multiplier, not a replacement: I set the vision, made the architecture bets, and enforced the rules; the AI handled the sheer volume. Neither of us could have built this alone. The careful, low-volume early months are what made the explosive output possible — you can't shortcut the foundation. Real-time forced a discipline most everyday programming never requires. The early decision to build for many machines is what let it grow without a painful rewrite. And honestly — it was supposed to be fun, and that shows in the energy of the work."

---

## SLIDE 18 — A NOTE ON HONESTY (Educational Framing)

- **Layout:** Simple, sincere, centered statement slide.
- **On-slide text:**
  - **MAP2 is openly an educational & research project**
  - Not a finished commercial product — and that's the point
  - Built to learn: DevSecOps, AI-assisted engineering, real-time audio
- **Art direction:** *open-source / open padlock*, *students collaborating*, *blueprint paper*. Honest and warm.
- **Speaker notes:** "One important note. This project is explicitly educational — its README and license make clear it's for research and learning, not a finished commercial product. That honesty is part of its character. It was a way to train on real DevSecOps practices, modern AI-assisted engineering, and the brutal discipline of real-time audio — while building something genuinely fun."

---

## SLIDE 19 — ONE-SLIDE SUMMARY

- **Layout:** Recap slide. The commit timeline ribbon returns (smaller) across the bottom; key numbers as large stat-tiles across the top.
- **On-slide text:**
  - Stat tiles: **~4,800** commits · **4** months · **3** layers · **6** phases · **1** person + AI
  - One line: *From a pedalboard idea to a real-time, multi-machine audio platform — held together by discipline, not luck.*
- **Art direction:** reuse the title-slide background, dimmed, for visual bookending. Bring back the animated signal-chain line.
- **Speaker notes:** "To sum up: MAP2 went from a 'pedalboard in a computer' idea to a real-time, multi-machine audio platform in about four months and 4,800 commits, built by one person with heavy AI help. It moved through six clear phases. And its success rested less on any single feature than on discipline — one to-do list, clean builds, redundant backups, written-down lessons, and a fiercely protected real-time core."

---

## SLIDE 20 — CLOSING / THANK YOU

- **Layout:** Full-bleed closer with the project name, a thank-you, and space for contact/links.
- **On-slide text:**
  - **Thank you**
  - *Building MAP2: From Pedalboard to Platform*
  - Matt Mackes · [LinkedIn / GitHub link] · Questions?
- **Art direction:** *concert crowd lights / silhouette*, *sunrise over a city*, or reuse the title studio shot. End on an uplifting note.
- **Speaker notes:** "Thank you. I'm happy to take questions — whether about the audio engineering, the AI-assisted workflow, or just what it's like to build something this big on your own."

---

## ★ OPTIONAL BONUS SLIDES (include if time allows)

- **B1 — "A Day in the Life of a Commit":** walk one feature from idea → worklist task → code → clean build → dual-push → live. *Art: relay race / pipeline.*
- **B2 — "The Numbers" deep-dive:** 1,700 Python files, 1,700 TypeScript files, 320 C++ files, 150 docs. *Art: data-viz / infographic.*
- **B3 — "What I'd Do Differently":** an honest lessons-learned slide. *Art: winding road / course correction.*

---

*Companion document: `BUILDING_MAP2_A_CHRONOLOGICAL_GUIDE.md` (the full prose narrative this deck is drawn from).*
*All on-slide facts are grounded in the project's real git history, README, and dated documentation.*
