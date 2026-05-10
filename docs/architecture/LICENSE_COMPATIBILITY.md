# MAP2 License Compatibility Audit

> **Filed:** 2026-05-09 under T2503 Set 1.
> **Scope:** verify that embedding Tracktion Engine (GPLv3) into MAP2 Audio (AGPLv3-only) is permitted, document the resulting distribution license, and record compatibility with all other in-tree third-party components.

---

## 1. Top-level license posture

MAP2-owned source code is licensed **AGPL-3.0-only** (see top-level `LICENSE`). The combined distributable work (when `-DMAP2_DAW_MODE=ON` and Tracktion Engine is linked in) is also AGPL-3.0-only — AGPLv3 is the strictest license in the combined work, and AGPLv3's terms govern the combined whole.

Nothing in this audit relicenses MAP2-owned code or alters the terms under which it is distributed. This document only records *why each third-party component is permitted in an AGPLv3 work*.

---

## 2. Component-by-component matrix

| Component | License | Distribution form | Compatible with AGPLv3? | Authority |
| --- | --- | --- | --- | --- |
| **MAP2-owned source** | AGPL-3.0-only | Source + binary | (self) | top-level `LICENSE` |
| **JUCE 8.0.0** | GPL-3.0-or-later or commercial | Linked at build time (`FetchContent`) | **Yes** — GPLv3 → AGPLv3 (one-way per AGPLv3 §13) | https://juce.com/get-juce |
| **Tracktion Engine** | GPL-3.0-or-later or commercial | Linked at build time (`FetchContent`, gated by `-DMAP2_DAW_MODE=ON`) | **Yes** — GPLv3 → AGPLv3 (one-way per AGPLv3 §13) | https://github.com/Tracktion/tracktion_engine |
| **NeuralAmpModelerCore** | MIT | Vendored under `juce-engine/Modules/NeuralAmpModelerCore/` | **Yes** — MIT is permissive, compatible with any GPL family | `juce-engine/Modules/NeuralAmpModelerCore/LICENSE` |
| **PiPedal-derived UI code** | MIT | Vendored under `web/src/pipedal/` | **Yes** — MIT permissive | per-file headers |
| **Mixxx controller mappings** | GPL-2.0-or-later | Vendored under `device-packs/_mixx-imports/` | **Yes** — GPLv2-or-later → can upgrade to GPLv3 → AGPLv3 | upstream Mixxx repo |
| **Open Color palette values** | MIT | Numeric constants in `externalPaletteThemes.ts` | **Yes** — MIT permissive | `yeun/open-color` |
| **Material palette values** | (numeric constants only — values, not code) | Numeric constants in `externalPaletteThemes.ts` | **Yes** — bare numeric constants are not copyrightable | Google Material Design docs |
| **Web fonts (Roboto, IBM Plex Sans, Plex Mono, Fira Sans, Space Grotesk, Inter)** | each per upstream license (Apache 2.0 / SIL OFL 1.1) | Bundled into web build | **Yes** — Apache 2.0 → AGPLv3 (one-way), SIL OFL is independent of GPL (fonts) | per-package metadata |

---

## 3. AGPLv3 ↔ GPLv3 compatibility

AGPLv3 §13 explicitly allows combining AGPLv3 and GPLv3 work:

> Notwithstanding any other provision of this License, you have permission to link or combine any covered work with a work licensed under version 3 of the GNU General Public License into a single combined work, and to convey the resulting work. The terms of this License will continue to apply to the part which is the covered work, but the work with which it is combined will remain governed by version 3 of the GNU General Public License.

GPLv3 §13 has the symmetric provision for combining GPLv3 work with AGPLv3 work.

**Practical effect:**
- Tracktion Engine code remains under GPLv3 inside the combined work; the engine's own LICENSE file is preserved verbatim.
- MAP2 source code stays under AGPLv3.
- The combined work as a whole distributes under AGPLv3. Anyone who interacts with the combined work over a network is entitled to the AGPLv3 source-disclosure rights.
- If MAP2 is ever distributed without DAW mode (i.e., `-DMAP2_DAW_MODE=OFF`), the combined work has no Tracktion code; the distribution remains AGPLv3.

The same analysis applies to JUCE — JUCE has been part of MAP2 since inception and the same §13 compatibility applies.

---

## 4. AGPLv3 network-use clause (§13)

AGPLv3's distinguishing clause requires that operators of network services built on AGPLv3 code make the corresponding source available to network users. This is unchanged by the addition of Tracktion. Any operator of a MAP2 instance accessible over a network must offer the corresponding source under AGPLv3.

**Operational implications for MAP2 deployments:**
- The web frontend served on port 3000 is a network service. Source disclosure obligations apply.
- The FastAPI backend on port 8080 is a network service. Source disclosure obligations apply.
- The C++ engine, when accessed only by local IPC, is not a "network service" in the AGPLv3 sense. But because it links into a process whose state is reachable over the network (via FastAPI), source disclosure of the engine still applies as part of the combined work.
- Including Tracktion in the combined work does not change any of the above — Tracktion code itself is under GPLv3 (no network clause), but the combined work is AGPLv3.

---

## 5. Build-flag gating

The `-DMAP2_DAW_MODE` CMake option (default `OFF`) gates whether Tracktion source is fetched and linked. With the flag OFF:

- `FetchContent_Declare(tracktion_engine ...)` is not invoked.
- The `juce-engine/Source/Daw/` source tree is not compiled.
- The resulting build contains no Tracktion code.
- Distribution license remains AGPLv3 (covering only MAP2 + JUCE + the existing third-party components).

With the flag ON:

- Tracktion source is fetched at configure time and linked statically.
- The combined work is the union of MAP2 + JUCE + Tracktion + others.
- Distribution license remains AGPLv3 (per §3 above).

---

## 6. Trademark, attribution, and copyright preservation

- **MAP2 trademarks** are held by Matthew Mackes. AGPLv3 §7 expressly disclaims trademark grants. Nothing in this audit alters that.
- **Tracktion trademarks** are held by Tracktion Software Corporation. The combined work must not imply Tracktion's endorsement. The "DAW (Tracktion-backed)" service identity (T2503 A4) explicitly attributes the engine.
- **Copyright headers** in vendored Tracktion source are preserved verbatim by `FetchContent` (it clones the upstream repo). MAP2 source files do not copy or paraphrase Tracktion source.
- **Mixxx mapping attribution** in `device-packs/_mixx-imports/` continues per the standing rule in `.gemini/instructions.md`.

---

## 7. Audit references

- AGPLv3 full text: https://www.gnu.org/licenses/agpl-3.0.txt
- GPLv3 full text: https://www.gnu.org/licenses/gpl-3.0.txt
- FSF compatibility table: https://www.gnu.org/licenses/license-list.html
- AGPLv3 vs GPLv3 explanation: https://www.gnu.org/licenses/why-affero-gpl.html
- Tracktion Engine README: https://github.com/Tracktion/tracktion_engine#license

---

## 8. Conclusion

Embedding Tracktion Engine (GPLv3) into MAP2 Audio (AGPLv3-only) is **permitted under AGPLv3 §13 and GPLv3 §13**. The combined work distributes as AGPLv3. No relicense of MAP2-owned code is required. Tracktion remains GPLv3 inside the combined work; its `LICENSE` file is preserved verbatim by the build system.

The flag `-DMAP2_DAW_MODE` (default OFF) ensures stock builds contain no Tracktion code, so operators who do not need the DAW service do not pull in the dependency. Operators who do enable the flag receive the combined AGPLv3 distribution and inherit AGPLv3 §13 network-use obligations on any service surface they expose.

---

Last updated: 2026-05-09 EDT - Claude (T2503 Set 1)
