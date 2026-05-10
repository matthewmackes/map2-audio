# MAP2 License Compatibility Audit

> **Filed:** 2026-05-09 under T2503 Set 1.
> **Updated:** 2026-05-10 — pivoted from Tracktion Engine to MAP2-native DAW core; Tracktion rows removed, Mixxx clip-pattern reuse retained.
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
| **Mixxx controller mappings + clip-launcher patterns** | GPL-2.0-or-later | Mappings vendored under `device-packs/_mixx-imports/`. T2503 reuses Mixxx's clip-deck/launcher *patterns* (re-implementation in MAP2 source) for the DAW service. | **Yes** — GPLv2-or-later → can be combined with GPLv3 → AGPLv3. Re-implementation must preserve attribution per `.gemini/instructions.md` standing rule. | upstream Mixxx repo |
| **Open Color palette values** | MIT | Numeric constants in `externalPaletteThemes.ts` | **Yes** — MIT permissive | `yeun/open-color` |
| **Material palette values** | (numeric constants only — values, not code) | Numeric constants in `externalPaletteThemes.ts` | **Yes** — bare numeric constants are not copyrightable | Google Material Design docs |
| **Web fonts (Roboto, IBM Plex Sans, Plex Mono, Fira Sans, Space Grotesk, Inter)** | each per upstream license (Apache 2.0 / SIL OFL 1.1) | Bundled into web build | **Yes** — Apache 2.0 → AGPLv3 (one-way), SIL OFL is independent of GPL (fonts) | per-package metadata |

**Components removed in the 2026-05-10 pivot:**
- *Tracktion Engine (GPL-3.0-or-later)* — was planned for T2503 Set 2 but the version-coordination cost between Tracktion `develop` and JUCE 8.x patch releases proved too high for autonomous shipping. Replaced with a MAP2-native DAW core built on `juce::AudioProcessorGraph` (no new external dependency). The audit text below is preserved for reference if the operator ever re-evaluates Tracktion.

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
- The MAP2-native DAW service (T2503, when `-DMAP2_DAW_MODE=ON`) does not introduce any new third-party dependency, so the AGPLv3 obligations on the combined work are unchanged.

---

## 5. Build-flag gating

The `-DMAP2_DAW_MODE` CMake option (default `OFF`) gates whether the DAW service source tree is compiled. With the flag OFF:

- `juce-engine/Source/Daw/` is excluded from `SOURCES`.
- The resulting binary is byte-identical to a pre-T2503 build.

With the flag ON:

- The DAW source tree compiles into `map2_audio_engine` and into the `daw_tests` Catch2 binary.
- All deps (JUCE, etc.) are already pulled by the live engine; no additional fetch is performed.

---

## 6. Trademark, attribution, and copyright preservation

- **MAP2 trademarks** are held by Matthew Mackes. AGPLv3 §7 expressly disclaims trademark grants. Nothing in this audit alters that.
- **Copyright headers** in vendored MIT and GPLv2-or-later components are preserved verbatim.
- **Mixxx clip/deck pattern reuse** in T2503 Set 8: the MAP2 implementation is a clean re-implementation, not copy-paste. Per the standing rule in `.gemini/instructions.md`, attribution is preserved in source comments wherever a Mixxx-derived pattern is named.

---

## 7. Audit references

- AGPLv3 full text: https://www.gnu.org/licenses/agpl-3.0.txt
- GPLv3 full text: https://www.gnu.org/licenses/gpl-3.0.txt
- FSF compatibility table: https://www.gnu.org/licenses/license-list.html
- AGPLv3 vs GPLv3 explanation: https://www.gnu.org/licenses/why-affero-gpl.html

---

## 8. Conclusion

Every third-party component currently vendored or fetched by MAP2 is **compatible with the top-level AGPLv3-only license**. The MAP2-native DAW service (T2503) introduces no new external dependency — it builds on JUCE's `AudioProcessorGraph` (already in tree) and reuses Mixxx clip/deck *patterns* (re-implementation; Mixxx is already vendored and license-cleared).

The flag `-DMAP2_DAW_MODE` (default OFF) ensures stock builds contain no DAW service code, so operators who do not need DAW mode pay zero compile-time or binary-size cost. Operators who do enable the flag receive the same AGPLv3 distribution as the live engine.

---

Last updated: 2026-05-10 EDT - Claude (T2503 Set 2 pivot to MAP2-native engine)
