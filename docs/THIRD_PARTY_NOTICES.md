# Third-Party Notices

This repository includes or depends on third-party software. Those components
are governed by their own licenses and are **not** relicensed by the top-level
`LICENSE` file.

If a file contains an explicit license header, that header takes precedence for
that file.

## Included in this repository

| Component | Location | License |
| --- | --- | --- |
| NeuralAmpModelerCore | `juce-engine/Modules/NeuralAmpModelerCore/` | MIT (`juce-engine/Modules/NeuralAmpModelerCore/LICENSE`) |
| PiPedal-derived UI code | `web/src/pipedal/` | MIT (see file headers, e.g. `web/src/pipedal/AlsaDeviceInfo.tsx`) |
| Fonts (Roboto and others) | `web/public/fonts/` | See `web/public/fonts/LICENSE.txt` |
| Theme palette reference values | `web/src/app/theme/externalPaletteThemes.ts` | Open Color palette values are derived from `yeun/open-color` under MIT. Material palette reference values are derived from Google's published Material Design color palette documentation; no upstream runtime package or source code is vendored. |
| AOO (Audio Over OSC) | `vendor/aoo/` *(vendored by T2521-4)* | BSD-3-Clause. Upstream LICENSE preserved verbatim in `vendor/aoo/LICENSE`. Per Q20 of the T2521 decision lock, MAP2 vendors AOO source directly into the repository rather than depending on a distro package. The `map2-sonobus-transport` daemon (T2521-4) is built from this source. BSD-3 is fully compatible with MAP2's AGPLv3 application surface (BSD-3 → AGPLv3 one-way upgrade is allowed). See `docs/architecture/LICENSE_COMPATIBILITY.md` for the audit. |

## Referenced but not vendored

| Component | Relationship | License |
| --- | --- | --- |
| SonoBus (the application) | Brand name + protocol compatibility target only. The operator-facing `/sonobus` route on the MAP2 web app is named after the SonoBus brand (Q2). Per Q1, MAP2 does **not** vendor or link the SonoBus JUCE binary at runtime — the runtime is MAP2-owned `map2-sonobus-transport` built on AOO (BSD-3). | GPLv3 (https://github.com/essej/sonobus). MAP2's use is a name-and-protocol-compatibility reference, not a linkage. If a future task vendors any SonoBus code (e.g., the mapping plugin or the upstream connection-server source), the GPLv3 boundary will be documented in `docs/architecture/LICENSE_COMPATIBILITY.md` and the affected components will stay in a process-isolated boundary (separate binary, not linked into the JUCE engine or the FastAPI app). |

## Fetched / installed dependencies

| Component | How it is obtained | Notes |
| --- | --- | --- |
| JUCE framework | Fetched at build time via CMake FetchContent | See `juce-engine/CMakeLists.txt`. JUCE is available under GPLv3 or a commercial license. Ensure your JUCE usage terms are compatible with the way you build/distribute MAP2. |
| Python dependencies (FastAPI, Uvicorn, SQLAlchemy, etc.) | Installed via pip | See `requirements*.txt` and your Python environment metadata. |
| JavaScript/TypeScript dependencies | Installed via npm | See `package.json`, `package-lock.json`, `web/package.json`, and `web/package-lock.json`. |
| Web font packages (`@fontsource/ibm-plex-sans`, `@fontsource/roboto`, `@fontsource/fira-sans`, `@fontsource/space-grotesk`, `@fontsource/inter`) | Installed via npm and bundled into the web build | Package metadata declares the upstream font licenses; see `web/package.json`, `web/package-lock.json`, and the installed package license files in `web/node_modules/@fontsource*/`. |
| Opus codec (`libopus`) | Installed via DNF/apt (Fedora: `opus-devel`; Debian: `libopus-dev`) | BSD-3-Clause. Reserved for the future Opus codec slots in `SonoBusBinding.codec_profile` (T2521 v1 ships PCM-only per Q7/Q8; the build dep is installed so future expansion is forward-compatible). |
| libuv (`libuv`) | Installed via DNF/apt (Fedora: `libuv-devel`; Debian: `libuv1-dev`) | MIT. Used by the T2521-4 daemon for the cross-platform UDS bridge to the FastAPI authority layer. |
| Avahi / mDNS (`avahi-client`) | Installed via DNF/apt (Fedora: `avahi-devel`; Debian: `libavahi-client-dev`) | LGPLv2.1. Used by the T2521-4 daemon for mDNS peer discovery (Q17) on the LAN. Linkage is dynamic (system shared library), keeping LGPL compliance via library replacement rights. |

## Summary

- MAP2-owned code is licensed under AGPLv3 (`AGPL-3.0-only`) as described in
  the top-level `LICENSE`.
- Third-party components remain under their original licenses. Compliance is
  your responsibility when copying, modifying, distributing, or shipping any
  combined work.
- Educational language in repository docs describes project intent and does not
  replace or narrow the AGPLv3 grant.
- For the AOO (BSD-3) + SonoBus (GPLv3) compatibility analysis specific to the
  T2521 epic, see `docs/architecture/LICENSE_COMPATIBILITY.md` and
  `docs/architecture/SONOBUS_AOO_TRANSPORT.md §6 (Licensing)`.
