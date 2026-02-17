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

## Fetched / installed dependencies

| Component | How it is obtained | Notes |
| --- | --- | --- |
| JUCE framework | Fetched at build time via CMake FetchContent | See `juce-engine/CMakeLists.txt:45`. JUCE is available under GPLv3 or a commercial license. You are responsible for obtaining and complying with the appropriate JUCE license for your use case. |
| Python dependencies (FastAPI, Uvicorn, SQLAlchemy, etc.) | Installed via pip | See `requirements*.txt` and your Python environment metadata. |
| JavaScript/TypeScript dependencies | Installed via npm | See `package.json`, `package-lock.json`, `web/package.json`, and `web/package-lock.json`. |

## Summary

- This project is intended for **non-commercial educational use** under the
  top-level `LICENSE` for original MAP2 code.
- Third-party components remain under their original licenses. Compliance is
  your responsibility when copying, modifying, distributing, or shipping any
  combined work.
