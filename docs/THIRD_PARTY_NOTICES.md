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

## Fetched / installed dependencies

| Component | How it is obtained | Notes |
| --- | --- | --- |
| JUCE framework | Fetched at build time via CMake FetchContent | See `juce-engine/CMakeLists.txt`. JUCE is available under GPLv3 or a commercial license. Ensure your JUCE usage terms are compatible with the way you build/distribute MAP2. |
| Python dependencies (FastAPI, Uvicorn, SQLAlchemy, etc.) | Installed via pip | See `requirements*.txt` and your Python environment metadata. |
| JavaScript/TypeScript dependencies | Installed via npm | See `package.json`, `package-lock.json`, `web/package.json`, and `web/package-lock.json`. |
| Web font packages (`@fontsource/ibm-plex-sans`, `@fontsource/roboto`, `@fontsource/fira-sans`, `@fontsource/space-grotesk`, `@fontsource/inter`) | Installed via npm and bundled into the web build | Package metadata declares the upstream font licenses; see `web/package.json`, `web/package-lock.json`, and the installed package license files in `web/node_modules/@fontsource*/`. |

## Summary

- MAP2-owned code is licensed under AGPLv3 (`AGPL-3.0-only`) as described in
  the top-level `LICENSE`.
- Third-party components remain under their original licenses. Compliance is
  your responsibility when copying, modifying, distributing, or shipping any
  combined work.
- Educational language in repository docs describes project intent and does not
  replace or narrow the AGPLv3 grant.
