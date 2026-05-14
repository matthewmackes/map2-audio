# MAP2 License Compatibility Audit

> **Filed:** 2026-05-09 under T2503 Set 1.
> **Updated:** 2026-05-10 — pivoted from Tracktion Engine to MAP2-native DAW core; Tracktion rows removed, Mixxx clip-pattern reuse retained.
> **Updated:** 2026-05-11 — T2503 DAW Service epic retired under T2504 / T2505. `MAP2_DAW_MODE` CMake flag and `juce-engine/Source/Daw/` tree have been removed; the archived doc is `docs/architecture/archive/DAW_SERVICE_RETIRED_2026-05-11.md`. Mixxx mapping/import attribution remains in effect for the controller-host device-pack subsystem (T2459-H).
> **Updated:** 2026-05-13 — T2521-9 adds AOO (BSD-3) + SonoBus (GPLv3) rows for the new remote-audio transport. AOO is vendored under `vendor/aoo/`; SonoBus is brand/protocol reference only (no linkage).
> **Scope:** verify that every third-party component vendored or fetched by MAP2 is compatible with the top-level AGPLv3-only license.

---

## 1. Top-level license posture

MAP2-owned source code is licensed **AGPL-3.0-only** (see top-level `LICENSE`). Combined builds distribute under AGPLv3 because AGPLv3 is the strictest license in the combined work and AGPLv3's terms govern the combined whole.

Nothing in this audit relicenses MAP2-owned code or alters the terms under which it is distributed. This document only records *why each third-party component is permitted in an AGPLv3 work*.

---

## 2. Component-by-component matrix

| Component | License | Distribution form | Compatible with AGPLv3? | Authority |
| --- | --- | --- | --- | --- |
| **MAP2-owned source** | AGPL-3.0-only | Source + binary | (self) | top-level `LICENSE` |
| **JUCE 8.0.0** | GPL-3.0-or-later or commercial | Linked at build time (`FetchContent`) | **Yes** — GPLv3 → AGPLv3 (one-way per AGPLv3 §13) | https://juce.com/get-juce |
| **NeuralAmpModelerCore** | MIT | Vendored under `juce-engine/Modules/NeuralAmpModelerCore/` | **Yes** — MIT is permissive, compatible with any GPL family | `juce-engine/Modules/NeuralAmpModelerCore/LICENSE` |
| **PiPedal-derived UI code** | MIT | Vendored under `web/src/pipedal/` | **Yes** — MIT permissive | per-file headers |
| **Mixxx controller mappings + ControllerEngine patterns** | GPL-2.0-or-later | Mappings vendored under `device-packs/_mixx-imports/`. MAP2 reuses Mixxx's ControllerEngine XML+JS *pattern* (re-implementation in `map2-controller-host`) under T2459-H. The retired T2503 DAW service used the same patterns for deck/launcher — that consumer is gone, but the mappings stay for the device-pack subsystem. | **Yes** — GPLv2-or-later → can be combined with GPLv3 → AGPLv3. Re-implementation must preserve attribution per `.gemini/instructions.md` standing rule. | upstream Mixxx repo |
| **Open Color palette values** | MIT | Numeric constants in `externalPaletteThemes.ts` | **Yes** — MIT permissive | `yeun/open-color` |
| **Material palette values** | (numeric constants only — values, not code) | Numeric constants in `externalPaletteThemes.ts` | **Yes** — bare numeric constants are not copyrightable | Google Material Design docs |
| **Web fonts (Roboto, IBM Plex Sans, Plex Mono, Fira Sans, Space Grotesk, Inter)** | each per upstream license (Apache 2.0 / SIL OFL 1.1) | Bundled into web build | **Yes** — Apache 2.0 → AGPLv3 (one-way), SIL OFL is independent of GPL (fonts) | per-package metadata |
| **AOO (Audio Over OSC)** | BSD-3-Clause | Vendored under `vendor/aoo/` (T2521-4). Built into `map2-sonobus-transport` daemon. | **Yes** — BSD-3 is permissive, compatible with any GPL family; one-way upgrade to AGPLv3 in the combined work. | upstream `vendor/aoo/LICENSE` |
| **SonoBus (application)** | GPL-3.0 | **Not vendored, not linked.** Brand-name reference only — the `/sonobus` operator mount is named after the SonoBus brand per Q2 of the T2521 decision lock. The runtime is MAP2-owned `map2-sonobus-transport` built on AOO (BSD-3). | **N/A — no linkage.** If a future task vendors SonoBus code (mapping plugin, connection-server source), the GPLv3 boundary will be re-audited here and the affected code will stay in a process-isolated boundary (separate binary, not linked into the JUCE engine or FastAPI app). | https://github.com/essej/sonobus |
| **Opus codec (`libopus`)** | BSD-3-Clause | Installed via DNF/apt as a dynamic shared library. Linked at build time by `map2-sonobus-transport`. Reserved for the future Opus codec slots (T2521 v1 ships PCM-only per Q7/Q8). | **Yes** — BSD-3 is permissive, compatible with AGPLv3 in the combined work. | xiph.org/opus |
| **libuv** | MIT | Installed via DNF/apt as a dynamic shared library. Used by `map2-sonobus-transport` for the UDS bridge to the FastAPI authority layer. | **Yes** — MIT is permissive, compatible with AGPLv3 in the combined work. | libuv.org |
| **Avahi client (`avahi-client`)** | LGPL-2.1-or-later | Installed via DNF/apt as a dynamic shared library. Dynamically linked by `map2-sonobus-transport` for mDNS peer discovery (Q17). | **Yes** — LGPL-2.1 dynamic linkage preserves library-replacement rights; compatible with AGPLv3 in the combined work. The `LGPLv2.1 → GPLv3 → AGPLv3` chain is permitted per LGPL-2.1 §3 (allowing relicensing of the *combination* to GPL-family work while the library itself remains LGPL). | avahi.org |

**Components removed in the 2026-05-10 pivot:**
- *Tracktion Engine (GPL-3.0-or-later)* — was planned for T2503 Set 2 but the version-coordination cost between Tracktion `develop` and JUCE 8.x patch releases proved too high for autonomous shipping. Replaced with a MAP2-native DAW core built on `juce::AudioProcessorGraph` (no new external dependency).

**Components removed in the 2026-05-11 T2503 retirement (T2505):**
- *MAP2-native DAW service* (`juce-engine/Source/Daw/`) — entire tree archived under `juce-engine/Source/_archive/Daw_2026-05-11/`. T2504 Multi-Track Recorder + Playback supersedes the DAW timeline model with a snapshot-bound capture/playback surface that introduces no new third-party dependency.
- `-DMAP2_DAW_MODE` CMake flag — removed from `juce-engine/CMakeLists.txt`. Stock builds were already byte-identical to the flag-OFF path, so no operator-visible binary change resulted.

---

## 3. AGPLv3 ↔ GPLv3 compatibility (preserved for reference)

AGPLv3 §13 explicitly allows combining AGPLv3 and GPLv3 work:

> Notwithstanding any other provision of this License, you have permission to link or combine any covered work with a work licensed under version 3 of the GNU General Public License into a single combined work, and to convey the resulting work. The terms of this License will continue to apply to the part which is the covered work, but the work with which it is combined will remain governed by version 3 of the GNU General Public License.

GPLv3 §13 has the symmetric provision for combining GPLv3 work with AGPLv3 work.

**Practical effect for current dependencies:**
- JUCE 8.0.0 (GPLv3) inside MAP2 (AGPLv3) is permitted; combined work distributes as AGPLv3.
- Mixxx (GPLv2-or-later) re-imports preserve attribution and uplift cleanly to GPLv3 → AGPLv3.

---

## 4. AGPLv3 network-use clause (§13)

AGPLv3's distinguishing clause requires that operators of network services built on AGPLv3 code make the corresponding source available to network users. Operational implications:

- The web frontend served on port 3000 is a network service. Source disclosure obligations apply.
- The FastAPI backend on port 8080 is a network service. Source disclosure obligations apply.
- The C++ engine, when accessed only by local IPC, is not a "network service" in the AGPLv3 sense. But because it links into a process whose state is reachable over the network (via FastAPI), source disclosure of the engine still applies as part of the combined work.

---

## 5. Build-flag gating

The `-DMAP2_DAW_MODE` CMake option that previously gated the DAW service tree was **removed** under T2505 (2026-05-11). All MAP2 source trees are unconditional under their respective subsystem CMake blocks; there is no per-subsystem opt-out flag for the audio engine, the controller-host, or the (forthcoming) recorder service. Stock builds remain byte-identical to the prior flag-OFF path because the retired DAW sources were never reachable from the live engine.

---

## 6. Trademark, attribution, and copyright preservation

- **MAP2 trademarks** are held by Matthew Mackes. AGPLv3 §7 expressly disclaims trademark grants. Nothing in this audit alters that.
- **Copyright headers** in vendored MIT and GPLv2-or-later components are preserved verbatim.
- **Mixxx ControllerEngine pattern reuse** in `map2-controller-host`: the MAP2 implementation is a clean re-implementation, not copy-paste. Per the standing rule in `.gemini/instructions.md`, attribution is preserved in source comments wherever a Mixxx-derived pattern is named.

---

## 7. Audit references

- AGPLv3 full text: https://www.gnu.org/licenses/agpl-3.0.txt
- GPLv3 full text: https://www.gnu.org/licenses/gpl-3.0.txt
- FSF compatibility table: https://www.gnu.org/licenses/license-list.html
- AGPLv3 vs GPLv3 explanation: https://www.gnu.org/licenses/why-affero-gpl.html

---

## 8. Conclusion

Every third-party component currently vendored or fetched by MAP2 is **compatible with the top-level AGPLv3-only license**. The forthcoming Multi-Track Recorder + Playback subsystem (T2504) introduces no new external dependency — it builds on JUCE's `AudioProcessorGraph`, `AudioFormatReader`, and `io_uring` (kernel feature), all of which are already pulled by the live engine. Mixxx ControllerEngine patterns remain in use through the `map2-controller-host` device-pack subsystem (T2459-H) with attribution preserved.

The SonoBus/AOO Remote-Audio Transport subsystem (T2521) adds AOO (BSD-3) as a vendored runtime dependency, libopus (BSD-3) / libuv (MIT) / avahi-client (LGPL-2.1) as system shared-library deps, and references SonoBus (GPL-3.0) as a brand/protocol target without linkage. All four are compatible with AGPLv3. The GPLv3 boundary against the SonoBus binary remains process-isolated (separate binary, no link-time dependency); any future change that vendors SonoBus code triggers a re-audit here.

---

Last updated: 2026-05-13 EDT - Claude (T2521-9 added AOO + SonoBus + libopus + libuv + avahi-client rows for the new remote-audio transport)
