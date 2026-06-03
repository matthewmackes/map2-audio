# Rust Migration Strategy — staged, FFI-bounded, strangler-fig

**Status:** Proposal · **Worklist anchor:** `T2533` · **First written:** 2026-06-03 (Claude) · **Document only — no code authorized yet.**
**Template:** Follows the house architecture-doc format (`docs/architecture/SONOBUS_AOO_TRANSPORT.md`, `CONTROLLER_LAYER.md`). The subtask grid is canonical in `docs/PROJECT_WORKLIST.md §T2533`; this doc owns the reasoning + diagrams.
**Scope:** "Convert the platform to a complete (within reason) Rust-based product." This doc defines what "within reason" means here, why, and the order of operations. The decisions below are **recommended positions pending operator ratification** — they were authored from a codebase-grounding sweep, not a 5-question operator protocol, so they are not yet locked.

---

## 0. Recommended positions (proposed — pending operator ratification)

| # | Topic | Recommended position |
|---|---|---|
| **R1** | **Thesis** | Adopt Rust where it **eliminates a bug class we actually hit** — RT-safety, lock-free correctness, GIL/GC pauses on the shared event loop — not uniformly. The win is "make the bug unrepresentable," not raw speed (C++ is already fast). |
| **R2** | **Method** | **Strangler-fig along existing process/IPC seams.** Never a big-bang rewrite. Each component is replaced behind an unchanged contract so the product keeps shipping; every cutover is independently revertable. |
| **R3** | **The FFI floor** | A "pure Rust" platform is impossible within reason. **JUCE, la_avdecc, AOO, NeuralAmpModelerCore, libavtp have no production Rust equivalent** and are FFI-wrapped or kept permanently. "Complete within reason" ≈ 80% Rust by *value* (RT core, all daemons, hot-path control), with a permanent C/C++ DSP/protocol floor. |
| **R4** | **Frontend** | **Out of scope — keep React/TypeScript/Carbon.** "Rust frontend" means WASM (Leptos/Dioxus), which discards the entire Carbon investment (T2481/T2475 epics) for zero RT benefit. This is the clearest line "within reason" draws. |
| **R5** | **Engine DSP/graph/plugin-host** | **Keep JUCE; wrap, don't rewrite.** JUCE's `AudioProcessorGraph` + LV2/VST3 hosting + DSP + convolution is multi-year to replace and depends on lilv/NAM/JUCE regardless. FFI is the *permanent* state, not a stepping stone. Rust enters the engine only as linked RT-primitive crates (`cxx`). |
| **R6** | **Migration order** | By value/risk ratio: **Tier 0** toolchain bootstrap → **Tier 1** controller-host daemon → **Tier 2** RT primitives (recorder writer, rings) → **Tier 3** backend hot-path sidecar → **Tier 4** opportunistic backend. Tiers 3–4 may never fully complete, and that is an acceptable terminal state. |
| **R7** | **Cutover gate** | Reuse the platform's existing gate families verbatim: **golden-byte/contract parity** (drift gates, IPC-schema manifest sync, spawn-replay-trace) + **RT soak** (`juce-random-effects-soak`, xruns=0 / jitter ≤0.35 ms, `MAP2_AUDIO_PREFER_JACK=1` mandatory). No tier cuts over until Gates 0–5 pass. |

**Honesty note.** No Rust code is authorized by this document. It is a plan. Each tier requires its own go-ahead, and the recommended positions above should be ratified (or amended) before Tier 0 begins.

---

## 1. Framing position — why Rust, where, and why not everywhere

The platform's recurring, documented pain is **not** throughput — it is *correctness under real-time and concurrency*. The worklist and memory record plugin-lifecycle segfauls, "RT allocations in the callback still need verification," lock-free metering-ring correctness, `setBufferSize()` having to stop audio before realloc, the controller-host protocol wedge (T2459-H9), and GC/GIL pauses on the event loop shared with audio. These are exactly the classes Rust's ownership model, `Send`/`Sync`, and no-GC discipline make *unrepresentable at compile time*.

That observation is also the *limit*. Rust adds nothing to snapshot CRUD, cluster admin, device-pack YAML resolvers, or a Carbon operator GUI — the parts that are ~90% of the line count. A migration justified by RT-safety must concentrate where RT-safety lives, and stop where it doesn't.

**The grounded shape of the problem** (measured 2026-06-03):

| Surface | Size | RT-adjacent? |
|---|---|---|
| Python backend (`app/`) | 756 files, **293K LOC** | ~24 modules (~12–15K LOC) touch the RT path; **>90% is cold CRUD** |
| C++ engine (`juce-engine/Source/`) | 195 files | the whole audio hot path, but JUCE-bound |
| Web (`web/src`) | 1,152 files | none — operator GUI |
| Daemons (separate processes) | controller-host 24 files, sonobus 14 files | isolated, IPC-bounded — the clean seams |

The 293K-LOC Python number is decisive: a literal "complete rewrite" is *dominated* by porting the backend, which is the part Rust helps least. That asymmetry drives the entire strategy toward **selective, seam-aligned migration**, not breadth.

---

## 2. Migration scope

### 2.1 The FFI floor — what can never be pure Rust (within reason)

Grounded against `juce-engine/CMakeLists.txt` (the single CMake root; no top-level `CMakeLists.txt` exists) and the vendored trees:

| Dependency | Role | Version | Rust equivalent | Verdict |
|---|---|---|---|---|
| **JUCE** | graph, plugin host (VST3/LV2/LADSPA), DSP, device I/O, MIDI types | 8.0.0 | none (cpal/jack cover device I/O only; nih-plug *authors* plugins, doesn't host them) | **keep-cpp** |
| **la_avdecc** | IEEE-1722.1 AVDECC controller (Milan) | 4.3.1.1 | none | **ffi-wrap** |
| **AOO** | SonoBus audio-over-OSC transport | v2.0-pre4 (vendored, full mode) | none | **ffi-wrap** |
| **NeuralAmpModelerCore** | `.nam` WaveNet/LSTM inference (Eigen) | vendored | none | **ffi-wrap** |
| **libavtp** | IEEE-1722 AVTP | — | none | **ffi-wrap** |
| LV2 (lilv/serd/sord) | plugin hosting | bundled *inside* JUCE `LV2_SDK` | partial (`livi`/`lv2`) | **collapses into JUCE** |
| QuickJS | controller-host JS mapping engine | vendored | `boa`/`rquickjs` | migrate-or-FFI |
| **liburing** | recorder disk writer | 2.9 | `io-uring` (mature) | **migrate** |
| **libpcap** | AVB packet capture | 1.10.6 | `pcap` (mature) | **migrate** |
| **libremidi** | controller-host MIDI I/O | v5 (BSL-1.0) | `midir` (+`jack`) — *partial*, see §2.3 | **migrate w/ gaps** |
| JACK (via PipeWire) | device transport | PipeWire 0.3 drop-in | `jack` crate | abstraction only |

**Conclusion:** the five `keep-cpp`/`ffi-wrap` rows are the hard floor. Any honest "complete Rust" target is really *"Rust owns orchestration, RT primitives, networking and new code; FFI-bridges the irreplaceable C/C++ DSP/protocol libraries."*

### 2.2 Per-layer verdict

| Layer | Verdict | Reasoning |
|---|---|---|
| Standalone daemons (controller-host, sonobus) | **Migrate first** | Already separate processes with byte-locked IPC contracts. MIDI + networking is Rust's home turf. Low blast radius. |
| RT primitives (recorder io_uring writer, metering/event rings, FIFO) | **Migrate as linked crates** | *The* place Rust retires a bug class we hit. `rtrb`, `io-uring`, `assert_no_alloc`. Linked into JUCE via `cxx`. |
| Engine DSP/graph/plugin-host (195 C++ files) | **Keep JUCE; wrap** | Multi-year to replace; depends on lilv/NAM/JUCE anyway. FFI is permanent. |
| Python backend (756 files / 293K LOC) | **Selective carve-out** | Port only the ~24 RT-adjacent modules into a Rust sidecar; the >90% cold CRUD stays Python. |
| React/Carbon frontend (1,152 files) | **Do not touch** | WASM rewrite discards the Carbon investment for zero RT benefit. |

### 2.3 Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| `midir` does **not** cover the JACK-MIDI→PipeWire→ALSA-seq→ALSA-raw probe matrix or UMP | High (Tier 1 core) | Use `midir` + the `jack` crate for JACK MIDI; keep ALSA-raw/PipeWire paths explicit; UMP stays software-gated as today. Treat backend-probe parity as an explicit Tier-1 acceptance criterion, not an assumption. |
| Two pre-existing shm contract quirks (PID-suffixed names; outbound `schema_version:1` while const is `2`) | Med | The Rust rewrite must **reproduce the quirks byte-for-byte** OR fix them deliberately + document — never silently. Both are pinned in the Tier-1 gate. |
| `os.sched_setscheduler(SCHED_FIFO, 80)` at **module import** elevates the whole interpreter to the audio band | High | Tier 3 relocates RT-priority/affinity ownership into a thread that is *actually* RT, inside the sidecar. |
| Team Rust depth + autonomous-shipping culture | Med | Tier 1 doubles as the low-stakes learning vehicle; the compiler's strictness is a *feature* for autonomous agents. |
| Rewriting working code for ideology | Med | Every tier must clear one bar: *does Rust eliminate a bug class we hit here?* CRUD routes don't pass it; the recorder writer does. |
| Offline `rpmbuild` can't fetch crates | Low | `cargo vendor` into the tree (mirrors the existing submodule-append in `build-rpm.sh`). |

---

## 3. Architectural diagrams (5 required views)

### 3.1 Process topology — current vs. target

```
CURRENT                                      TARGET (after Tiers 1–3)
────────────────────────────                 ──────────────────────────────
React/Carbon SPA (TS)  ── HTTP/WS ─┐         React/Carbon SPA (TS)  ── HTTP/WS ─┐   [unchanged, R4]
                                   │                                            │
FastAPI backend (Py, 293K) ────────┤         FastAPI backend (Py, cold CRUD) ───┤   [~90% unchanged]
  ├─ pybind ─► JUCE engine (C++)    │           └─ warm cmds ─► Rust sidecar ────┤   [Tier 3]
  ├─ UDS ──► controller-host (C++)  │                            ├─ ctrl chan ─► JUCE engine (C++/JUCE kept, R5)
  └─ UDS ──► sonobus daemon (C++)   │                            │     └─ Rust RT crates (cxx): recorder
                                    │                            │              writer, rings   [Tier 2]
                                    ┘         controller-host (RUST: midir+jack+tokio) ── UDS/shm  [Tier 1]
                                              sonobus daemon (C++ wrapper, FFI→AOO)               [later/optional]
```

### 3.2 The strangler-fig tier model (value/risk ordered)

```
Tier 0  Toolchain bootstrap   cargo workspace + corrosion-rs↔CMake + RPM vendor + CI lint   [enables all]
Tier 1  controller-host       C++ → Rust (midir/jack/tokio), shm+UDS contract preserved     [isolated, high value]
Tier 2  RT primitives         recorder io_uring writer + event/metering rings → Rust crates  [retires RT bug class]
            (linked into JUCE via cxx; JUCE graph/plugin-host untouched)
Tier 3  backend hot-path      ~24 RT-adjacent Py modules → axum/tokio sidecar                [kills GIL/GC-on-loop]
            (timing core → param coalescer → engine actuation → metering fan-out → RT-prio ownership)
Tier 4  opportunistic         further Py services migrate only when touched for other reasons [may never finish — OK]
NEVER   frontend, JUCE DSP/graph/plugin-host
```

### 3.3 The FFI floor (what Rust orchestrates vs. wraps)

```
        ┌───────────────── Rust owns ─────────────────┐   ┌──── FFI floor (C/C++, permanent) ────┐
        │ daemons (midir/jack/tokio)                  │   │ JUCE  (graph, plugin host, DSP)      │
        │ RT primitives (rtrb, io-uring, assert_noalloc)│ │ la_avdecc (AVDECC/Milan)             │
        │ backend hot-path sidecar (axum/tokio)        │──┤ AOO (SonoBus transport)              │
        │ all new code                                 │   │ NeuralAmpModelerCore (.nam)          │
        └──────────────────────────────────────────────┘  │ libavtp ; LV2 (bundled in JUCE)      │
   bridges: cxx (into JUCE) · bindgen (C APIs) · raw shm/UDS (process seams, no FFI)  └──────────┘
```

### 3.4 Migration narrative (sequencing + gate at each cutover)

```
Tier 0 ─build─► Tier 1 ─[Gates 0-5]─► cut controller-host ─► Tier 2 ─[Gates 0-5]─► cut RT crates
                                                                  └─► Tier 3 ─[Gates 0-5]─► cut sidecar
each "[Gates 0-5]" = golden/contract parity + soak(xruns=0, jitter≤0.35ms) + dual-distro + revertable switch
legacy path stays in-tree one release after each cutover (revert lever)
```

### 3.5 Framing position (the one-line thesis)

```
Rust where it makes a bug we keep fighting impossible — daemons, RT primitives, the hot-path control loop.
C++/JUCE where the DSP/protocol substrate has no Rust peer. TypeScript/Carbon for the operator GUI.
"Complete within reason" = ~80% Rust by value, with a permanent C/C++ floor and a permanent TS frontend.
```

---

## 4. Tier detail (canonical subtask grid in `PROJECT_WORKLIST.md §T2533`)

This section summarizes; the worklist owns the per-subtask acceptance bullets.

- **Tier 0 — Toolchain bootstrap.** Cargo workspace at `rust/`; `corrosion-rs` fetched in the `juce-engine/CMakeLists.txt` FetchContent block (next to JUCE, lines 45–54); `corrosion_import_crate` output to `CMAKE_BINARY_DIR` so binaries land beside `map2-controller-host`; RPM wiring (`-DBUILD_MAP2_RUST_*`, append target to the `cmake --build` list at `map2.spec:76`, `install -m 755`, `%files`, `cargo vendor` for offline builds, `BuildRequires: cargo rust`); CI lint parity (`t2529-install-matrix.yml`). **Deliverable: a no-op Rust binary that builds, packages, installs, and lints clean on both distros.**
- **Tier 1 — `map2-controller-host` in Rust.** `midir`+`jack`+`tokio`; preserve the 4-byte big-endian length-prefixed JSON UDS protocol (8 inbound + 6 outbound frame types), the two SPSC shm rings (64-byte header, 320-byte slot, byte-exact), the classifier routing, and the multi-client broadcast/prune loop. Resolve the two pre-existing quirks explicitly.
- **Tier 2 — RT primitives as `cxx`-linked crates.** Recorder `io_uring` writer (`io-uring` crate), the event/metering rings (`rtrb`), `assert_no_alloc` in the audio path. JUCE graph/plugin-host untouched.
- **Tier 3 — backend hot-path sidecar (`axum`/`tokio`).** In order: (1) deterministic MIDI timing core (`clock_engine`/`scheduler`/recorder delta-sleep → tokio timer-wheel), (2) RT param coalescer (`realtime_parameter_bridge._process_loop`), (3) engine actuation channel (replace the 449 `asyncio.to_thread` GIL crossings), (4) metering poll + fan-out (9 broadcast loops off the FastAPI loop), (5) `SCHED_FIFO`/affinity ownership relocation, (6 optional) `engine_command` warm-dispatch.
- **Tier 4 — opportunistic.** Migrate further Python only when touched; terminal state "rest stays Python" is acceptable.

---

## 5. Validation gates (reused verbatim — no new tooling)

Every tier cuts over only when **all** pass (full detail + file:line in `§T2533`):

- **Gate 0 — Build & A/B inventory.** Both impls coexist behind a switch; Rust struct/field manifest added to the cross-language sync test.
- **Gate 1 — Golden/contract parity (byte-equal).** Reuse: codegen `--check` drift gates; `test_controller_host_ipc_schema.py` manifest sync (add a Rust column); `test_midi_recorder_golden_parity_*` byte-equality; `test_controller_host_b5_golden_*` spawn-replay-trace against the Rust binary.
- **Gate 2 — Soak: xruns == 0.** `juce-random-effects-soak` full profile, **`MAP2_AUDIO_PREFER_JACK=1` mandatory** (without it jitter is unreachable — proven by a real 18.94 ms / 238-xrun FAIL artifact). `--midi-driver host` for IPC components.
- **Gate 3 — Soak: peak jitter ≤ 0.35 ms** + budget ≤ 80% + 0 flow errors; evidence JSON+MD lands in `docs/fit-for-purpose-evidence/<date>/` with a `--soak-tag rust-<component>` stamp vs. baseline.
- **Gate 4 — Dual-distro packaging.** Fedora 41 (rpmbuild+rpmlint+dnf install, verify `map2` user + FHS dirs) and Ubuntu 24.04 (alien+lintian) via `t2529-install-matrix.yml`.
- **Gate 5 — Revertability.** Cutover behind one switch; legacy path stays in-tree ≥1 release; rollback recorded in the evidence dir.

**Promotion rule:** flip default legacy→Rust only when Gates 0–5 pass and soak `overall_pass==true`; record evidence dir + git SHA in the worklist before marking the tier Done (mirrors CLAUDE.md §0.8).

---

## 6. Anti-patterns explicitly forbidden

- **Big-bang rewrite.** Every change ships behind an unchanged contract; the product never stops working.
- **Rewriting cold CRUD for ideology.** No Rust port of a module that never touches the RT path, the pybind boundary, or sub-second timing.
- **Silent contract drift.** The Tier-1 shm/UDS quirks (PID-suffixed names; `schema_version:1` outbound) are reproduced byte-for-byte or fixed *with a documented note* — never silently changed.
- **Frontend WASM rewrite.** Off the table within reason (R4).
- **Reimplementing JUCE/AOO/AVDECC/NAM.** FFI-wrap; do not rewrite.
- **Cutover without soak evidence.** No tier flips default without Gates 2–3 green under `MAP2_AUDIO_PREFER_JACK=1`.

---

## 7. References

- Worklist epic + canonical subtask grid: `docs/PROJECT_WORKLIST.md §T2533`
- Controller-host contract: `juce-engine/Source/ControllerHost/{main.cpp,IpcMessages.h,EventRing/ShmEventRing.{h,cpp}}`, `app/schemas/controller_host.py`, `tests/test_controller_host_ipc_schema.py`
- Build/packaging seams: `juce-engine/CMakeLists.txt`, `packaging/rpm/map2.spec`, `packaging/build-rpm.sh`, `packaging/systemd/map2-controller-host.service`, `.github/workflows/t2529-install-matrix.yml`
- Soak harness: `.codex/skills/juce-random-effects-soak/` (runner `scripts/run_juce_random_fx_soak.py`)
- Sibling architecture docs: `docs/architecture/CONTROLLER_LAYER.md`, `SONOBUS_AOO_TRANSPORT.md`, `FIRST_CLASS_SERVICES.md`
- Standing RT feedback: `memory/feedback_jack_direct_required.md` (`MAP2_AUDIO_PREFER_JACK=1`)
