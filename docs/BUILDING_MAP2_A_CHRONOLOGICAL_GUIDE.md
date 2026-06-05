# Building MAP2: A Chronological Guide

*A detailed, plain-language walkthrough of how the Mackes Audio Platform 2 was built — from a single idea to a 4,800-commit real-time audio platform. Written for a presentation about the experience of building it.*

> **Reading level:** ~11th grade. Technical terms are defined the first time they appear.
> **Time span covered:** January 28, 2026 → June 4, 2026 (about 4 months and 1 week).
> **Built by:** One person, Matt Mackes, with heavy help from AI coding tools.
> **Scale at the end:** ~4,800 commits, ~1,700 Python files, ~1,700 TypeScript files, ~320 C++ files, ~150 documentation files.

---

## 1. The Big Picture (Read This First)

Before the timeline, here is the whole story in one paragraph so the dates make sense:

> MAP2 started as a simple idea — *"What if a guitar pedalboard lived inside a computer instead of on the floor?"* That idea kept growing. It became a full **audio platform**: software that turns a cheap Linux computer into a professional-grade audio processor that can handle an entire band at once, link multiple machines together over a network, and be controlled from a web browser, a touchscreen, or a text terminal. It was built in public, in the open, one small commit at a time, with AI doing a lot of the heavy lifting and a human steering the direction.

### What problem was it trying to solve?

Modern bands are *already* digital. Guitar amp modelers, digital mixers, electronic drums, MIDI keyboards — almost every instrument turns into a digital signal the moment you plug it in. But each device usually has its own little computer chip inside, and the sound gets converted back and forth between analog and digital many times. Every conversion adds delay and loses a tiny bit of quality.

MAP2's idea was to build **one shared digital "backbone"** that the whole band plugs into. The sound stays digital and "clean" from the moment it enters until it's recorded. Instead of putting an expensive, fragile desktop computer in every room, you use a small, cheap PC running like an **appliance** — something that just works, like a microwave, with no complicated operating system to babysit.

### The three big pieces

Throughout the whole project, MAP2 was made of three main layers that had to work together:

| Layer | What it does | Built with |
|---|---|---|
| **Audio Engine** | The "brain" that actually processes sound in real time | C++ with the JUCE framework |
| **Backend** | The "manager" that handles settings, saving, and coordination | Python with FastAPI |
| **Web Dashboard** | The screens you click on to control everything | React (a JavaScript web framework) |

Keeping these three layers in sync — and *fast enough* for live music — was the central challenge of the entire build.

---

## 2. Timeline at a Glance

| Month (2026) | Commits | What it was mostly about |
|---|---|---|
| **January** | 15 | The idea, the name, the first README, the first signal chain |
| **February** | 341 | Real audio engine, the multi-machine vision, fixing crashes |
| **March** | 770 | The "MIDI Hub" — turning a guitar tool into a full control center |
| **April** | 2,145 | The busiest month: snapshots, hardware devices, automated building |
| **May** | 1,432 | Deep cleanup, removing old code, switching to a new design system |
| **June** | 91 (so far) | Final polish, automation tools, documentation |

The shape of this table tells its own story: a slow, thoughtful start, then a massive acceleration once the foundations were solid, then a deliberate slowdown to clean up and polish.

---

## 3. Phase 0 — The Idea and the Name (Late January 2026)

**Key dates:** January 28–31, 2026

The very first commit is literally named **"Initial commit"** on January 28. Within hours, the next few commits added:

- A detailed README explaining the vision
- Creator branding and a LinkedIn profile link
- A "beta status" badge and a target release date

This phase was about **writing down the dream before building it**. The README from this period reads almost like a manifesto. It explains *why* a centralized digital audio system makes sense, and it ends with a very human note: *"It is a fun project, maintained by one person... It continues to allow me to train on DevSecOps principles and AI methods, while building something I enjoy tinkering with."*

> **The experience here:** Starting with the "why" instead of the "what." The project had a clear philosophy from day one, and that philosophy guided thousands of later decisions.

By **January 31**, the first real working feature appeared: a **horizontal signal chain view** — a screen showing audio effects connected in a row, like pedals on a pedalboard. The same day brought the first **MIDI** support (MIDI is the language electronic instruments use to talk to each other), letting a foot controller switch between effect chains. The C++ audio engine got its first compilation fixes too. The idea was becoming code.

---

## 4. Phase 1 — A Real Engine and a New Name (Early February 2026)

**Key dates:** February 1–4, 2026

This is where the project found its identity.

- **February 1:** The project was officially **rebranded to "Mackes Audio Platform 2" (MAP2)**. On the same day, `ToobAmp` guitar amp plugins were added as built-in effects, and a new grid-based effect editor (`GridFlowPage`) replaced the older one as the main screen.
- **February 2:** A major engine update added **native audio processors** written directly in C++ (instead of relying only on outside plugins), plus a searchable, sortable "Library" page for browsing effects.
- **February 4:** A huge day. The platform gained famous studio-effect emulations — **Eventide H9, H3000, and Lexicon-style** processors — plus **flow snapshots** (the ability to save and recall a whole setup). Most importantly, it added a **distributed LCD event system with node management**.

That last item is bigger than it sounds. A **node** is one MAP2 machine. "Node management" means the software was now designed from the ground up to run on *many machines at once*, not just one. This was the seed of MAP2's most ambitious feature.

> **The experience here:** The project made a critical early bet — that it would grow into a *multi-machine* system. Building that assumption in early (even before it was needed) shaped everything that followed.

---

## 5. Phase 2 — The Big Vision and the First Hard Lessons (Mid-to-Late February 2026)

**Key dates:** February 11–27, 2026

February was when MAP2 stopped being a hobby toy and started being treated like a serious engineering project. Two things happened in parallel: **the vision got documented**, and **the engine got hardened**.

### 5a. Writing down the architecture (Feb 14–16)

A wave of detailed design documents appeared, including an **Educational Overview**, an **Installation Guide**, a **Platform Manual**, and a formal **Systems Block Diagram** with a full **protocol compliance matrix**.

This is where the **AVB** vision was formally locked in. **AVB (Audio Video Bridging)** is a set of networking standards that lets audio travel over a regular Ethernet cable with extremely precise timing — accurate to less than a millionth of a second. The dream was a "digital snake": instead of a thick bundle of analog cables running from the stage to the soundboard, a single network cable carries every channel of the entire band, perfectly in sync.

### 5b. Fixing real-time crashes (Feb 17–27)

While the documents described the dream, the code had to survive reality. **Real-time audio** is unforgiving: the software must deliver the next chunk of sound every 1.33 milliseconds, *no matter what*. If it's even a little late, you hear a click or a dropout. This makes normal programming shortcuts dangerous.

Several hard-won fixes landed:

- **February 17 — RT Safety Fixes:** The metering system (the moving level bars) was rebuilt using a "lock-free ring buffer," a special technique that lets the audio brain share data without ever pausing. Functions that change the buffer size now safely stop audio *before* rearranging memory.
- **February 24 — H3000 crash:** The engine could crash when a pitch-shift setting was exactly zero, because of an unsafe math optimization. Fixed with guardrails.
- **February 25 — Plugin lifecycle crashes:** Loading and swapping effects under heavy load could crash the engine. The fix required addressing four different layers at once — a lesson that stability is never a single bug.

> **The experience here:** Real-time audio teaches humility. Code that works 999 times out of 1,000 is *broken* for live music. February was a crash course (sometimes literally) in writing software that cannot afford to stutter.

A rule was born here that stuck for the whole project: **"Done means clean build."** No task was finished until the code compiled and passed its tests with zero known errors.

---

## 6. Phase 3 — From Guitar Tool to Control Center (March 2026)

**Key dates:** Throughout March, with a giant push on March 8

March doubled the project's commit count compared to February. The headline was the **MIDI Hub** — a massive expansion that turned MAP2 from a *guitar effects* tool into a *universal control center*.

On **March 8 alone**, more than a dozen connected features shipped (tracked as tasks "T066-subE" through "T066-subP"):

- A **transform engine** (changing MIDI messages on the fly)
- A **routing matrix** and **patchbay editor** (deciding what controls what)
- A **preset system**, a **scripting engine**, and a **clock engine** (keeping instruments in time)
- An **OSC bridge** and **MIDI 2.0 readiness** (newer control protocols)

The same period added **Tesira parity** — compatibility with Biamp Tesira, a line of professional commercial audio processors used in large buildings and venues. MAP2 was now aiming at the professional install market, not just musicians.

By **March 28**, a formal **Platform Audit** reviewed the whole system's health.

> **The experience here:** Scope grew fast. A project that began as "effects in a row" was now juggling MIDI routing, scripting, network protocols, and pro-install hardware. Managing that growth — without the whole thing collapsing into chaos — became its own skill. This is why a single, strict **worklist** (a master to-do list) became the law of the project.

---

## 7. Phase 4 — The Busiest Month (April 2026)

**Key dates:** All of April — 2,145 commits, the peak of the entire project

If you only present one slide about raw output, it's this month. April had more commits than January through March *combined*. Several big threads ran at once.

### 7a. Snapshots grow up (early April)

A **snapshot** is a saved photo of your entire rig — every effect, every setting, every connection — that you can recall instantly. In April this matured into a full system:

- A **"Go Live" state machine** that safely switches the live sound to a new snapshot
- A **diff summary** showing exactly what will change before you commit
- **Dead-channel detection**, activation feedback, auto-tagging, and timestamps

### 7b. Real hardware devices (mid-to-late April)

MAP2 began deeply supporting specific physical controllers, most notably the **Native Instruments Maschine MK1**, a popular music production controller. This introduced the **device-pack** system: a clean, organized way to teach MAP2 about any new piece of hardware without rewriting the core code.

### 7c. The "ship loop" and automated building

April is when the commit messages start showing patterns like *"loop 8, iter 76."* This reflects a new way of working: **autonomous iteration**, where AI agents would work through the task list in repeating cycles, building, testing, and committing in a steady rhythm — with the human reviewing and steering. This is what made the enormous April output possible.

### 7d. A design system decision (April 30)

On April 30, the project **retired MUI** (one web design library) in favor of **Carbon**, IBM's professional design system. This was a deliberate choice to make the whole interface look consistent and enterprise-grade — and it created cleanup work that continued for weeks.

> **The experience here:** April proves a key lesson about building with AI: once the *foundations and the rules* are solid, output can scale enormously. The slow, careful months of January and February are what *earned* the explosive productivity of April.

---

## 8. Phase 5 — The Great Cleanup (May 2026)

**Key dates:** All of May — 1,432 commits

May was about **paying down debt** — removing old, messy, or duplicated code so the platform would be reliable for the long term. This is the unglamorous but essential part of any real software project.

The biggest effort was **removing `python-rtmidi`** (an older library for MIDI input) and routing *all* MIDI through a new, dedicated, crash-isolated process called the **controller-host**. The commit history shows this happening methodically — "loop 9, iter 81... iter 82... iter 89" — each step carefully removing one more dependency on the old system.

- **May 1:** A systematic, step-by-step removal of the old MIDI library across five different parts of the code.
- **May 8:** The old raw "ALSA" MIDI path (`Map2MidiController`) was **deleted entirely**. From now on, the audio engine reads MIDI exclusively from a fast, shared memory "ring," and a separate host process owns all the messy hardware communication. If that host crashes, the *audio keeps playing*.
- **May 20:** A formal build version was stamped.

Meanwhile, the migration to the Carbon design system continued across hundreds of screens.

> **The experience here:** Deleting code is as important as writing it. The decision to put hardware communication in a *separate process* — so a misbehaving controller can't take down the audio — reflects a mature engineering mindset: **isolate the risky parts so the critical parts stay safe.**

---

## 9. Phase 6 — Polish and Tooling (June 2026)

**Key dates:** June 1–4, 2026

The final stretch in this record was about refinement and building tools to *manage* the platform's growth:

- **Skills import (June 4):** Reusable AI "skills" for auditing, shipping, and planning were brought in and adapted for MAP2 — essentially teaching the AI assistants the project's specific rules.
- A **"Carbon lint ratchet"** — an automated check that slowly forces every screen to follow the design rules, one fix at a time, and never lets old habits creep back in.
- **Real-time activation streaming:** Fixing a 60-second silent wait when creating a snapshot by streaming live progress updates to the user instead.
- Retiring stale documentation and fixing flaky tests.

> **The experience here:** A project this size needs tools that *enforce its own rules automatically*. By June, MAP2 wasn't just software — it was a software *factory*, with guardrails, checklists, and automated reviewers built in.

---

## 10. The Engineering Discipline Behind It All

Beyond the timeline, several habits ran through the *entire* project. These are worth their own slide, because they're the real reason a solo project reached this scale without falling apart.

1. **One master to-do list.** Every task lived in a single file (`PROJECT_WORKLIST.md`). No side lists, no hidden plans. Each task had an ID, a status, and a completion note. This is how one person tracked thousands of changes.

2. **"Done means clean build."** A feature wasn't finished until it compiled, passed type-checks, and passed its tests. Half-finished work was not allowed to be called "done."

3. **Test in production mode, not a shortcut mode.** A repeated rule was *"no dev server"* — always test the real, fully-built version, because the quick "development" version can hide bugs.

4. **Keep two copies safe at all times.** Every change was pushed to *both* GitHub and GitLab. If one service went down, the work was never lost.

5. **Write down every lesson.** When a bug was solved, the fix went into a permanent "Gotchas & Learned Fixes" document — so the same mistake would never happen twice. The documentation files literally say *"IT REMEMBERS."*

6. **Isolate the real-time core.** The most important code — the audio brain — was protected from everything else: given its own CPU cores, kept free of risky operations, and shielded from crashes in other parts of the system.

---

## 11. Honest Reflections (Good Material for a Talk)

This project is **explicitly educational** — the README and license make clear it's a research and learning project, not a finished commercial product. That honesty is part of its character, and it makes for an authentic presentation. A few reflections that resonate:

- **AI was a force multiplier, not a replacement.** The human set the vision, made the architecture bets, enforced the rules, and reviewed the work. The AI handled the volume. Neither could have produced this alone.

- **The boring months mattered most.** The careful, low-volume work in January and February (getting the foundations and rules right) is what made the explosive output of April possible. You can't shortcut the foundation.

- **Real-time is a different world.** Building software that *cannot* pause, even for a millisecond, forced a level of discipline that most everyday programming never requires.

- **Scope will grow — plan for it.** What started as a digital pedalboard became a band-wide, multi-machine, network-audio platform. The early decision to build for *many machines* is what let it grow without a painful rewrite.

- **It was supposed to be fun.** The creator's own words: *"It is a fun project... building something I enjoy tinkering with."* That motivation is visible in the energy of the commit history.

---

## 12. One-Slide Summary

> **MAP2** began on January 28, 2026 as a simple "pedalboard in a computer" idea. Over four months and roughly **4,800 commits**, built by one person with heavy AI assistance, it grew into a real-time, multi-machine audio platform combining a C++ audio engine, a Python backend, and a React web dashboard. The journey moved through clear phases: **the idea** (January), **a real engine and the multi-node vision** (February), **a universal control hub** (March), **explosive feature growth** (April), **deep cleanup and hardening** (May), and **polish and automation** (June). Its success rested less on any single feature and more on **discipline**: one master to-do list, "done means clean build," redundant backups, written-down lessons, and a fiercely protected real-time core.

---

*Sources: project git history (4,794 commits, Jan 28 – Jun 4, 2026), `README.md`, `docs/CLAUDE.md`, `docs/Addendum and overview 2-16-26.md`, the dated milestone documents in `docs/`, and the project memory files.*
