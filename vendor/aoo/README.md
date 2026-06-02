# vendor/aoo — AOO (Audio Over OSC) source vendor tree

**Status:** **VENDORED** (T2521-4, 2026-06-02). The full upstream AOO
source tree is now vendored here (tag `v2.0-pre4`, commit
`dc2a5be2962ba02d6cebe297f31f2774f34e7bc7`) — see `VERSION` for the
pull metadata and `LICENSE` for the upstream BSD-3-Clause text. The
upstream project README is preserved alongside this file as
`README.upstream.md`; this `README.md` is the MAP2 vendor-posture note.
`juce-engine/CMakeLists.txt` flips `SONOBUS_AVAILABLE=TRUE` when this
tree (with its `CMakeLists.txt`) is present.

The full tree is vendored verbatim (~2.8 MB); the `pd/`, `sc/`,
`examples/`, `doc/`, `doxygen/`, and `tests/` subtrees are present but
not built (upstream gates them behind `AOO_BUILD_*` options, all
default OFF). MAP2 links only the core `aoo/` library.

## Upstream

- Project: AOO (Audio Over OSC)
- Authors: IEM (Institute of Electronic Music and Acoustics, Graz)
- Upstream URL: <https://aoo.iem.at/>, <https://git.iem.at/cm/aoo>
- License: **BSD-3-Clause**

## Why vendored

Per **Q20** of the T2521 decision lock (see
`docs/architecture/SONOBUS_AOO_TRANSPORT.md §0`), MAP2 vendors AOO
source directly into the repository rather than depending on a distro
package. This keeps the daemon build reproducible across operator
hosts and avoids drift between AOO versions on different machines.

## License obligations

BSD-3-Clause is fully compatible with MAP2's AGPLv3 application
surface — the BSD-3 → AGPLv3 one-way upgrade is allowed.

When the full source tree is vendored, the upstream `LICENSE` /
`COPYING` file MUST land at `vendor/aoo/LICENSE` and be preserved
verbatim. Any NOTICE or attribution requirements upstream surfaces
must propagate to `docs/THIRD_PARTY_NOTICES.md` (already pre-populated
under T2521-9 with the AOO row).

## Build integration

`juce-engine/CMakeLists.txt` exposes `option(USE_SONOBUS …)` which
defaults to `ON` per Q15 (install + enable by default). The option's
`if(EXISTS "${SONOBUS_VENDOR_DIR}/CMakeLists.txt")` guard flips
`SONOBUS_AVAILABLE` true once this directory carries an actual AOO
CMake project. Until then the engine build prints a `PLANNED` status
line and skips the AOO `add_subdirectory(...)` call.

## What lands here in T2521-4

1. The AOO source tree (cloned from upstream, license-preserving).
2. A vendored `LICENSE` copy.
3. A `VERSION` file recording the upstream commit/tag the vendor copy
   matches.
4. The `map2-sonobus-transport` daemon `CMakeLists.txt` that consumes
   the AOO library and links it into the standalone binary.
