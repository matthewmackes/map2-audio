# T082 Nightly Release Validation

- Task: `T082-subE`
- Date: `2026-03-10`
- Result: `pass`
- Workflow run: `22906164239`
- Workflow URL: https://github.com/matthewmackes/map2-audio/actions/runs/22906164239
- Release URL: https://github.com/matthewmackes/MAP2-RELEASES/releases/tag/nightly-20260310-validation
- Source commit: `09432c87bb0c391df6d9b4e04ce1378228e316df`
- Version tag: `nightly-20260310-validation`

## Workflow result

- `Check for new commits`: passed
- `Build web frontend`: passed
- `Create release tarball`: passed
- `Publish to MAP2-RELEASES`: passed

## Published artifacts

- GitHub Release created in `matthewmackes/MAP2-RELEASES`
- `nightly/LATEST.json` updated to:
  - `version`: `nightly-20260310-validation`
  - `commit`: `09432c87`
  - `file`: `map2-audio-nightly-20260310-validation-09432c87.tar.gz`
  - `sha256`: `f9368f739fb3604a1f18a4e0088e05ed1d26b5049ebe325e008bc7e9282a2a46`
- Tarball published: `map2-audio-nightly-20260310-validation-09432c87.tar.gz`
- Tarball size: `11312034` bytes

## Artifact validation

- Downloaded the published tarball from the GitHub Release
- Observed SHA256 matched `LATEST.json` and the Release asset digest exactly
- Extracted root: `/tmp/map2-nightly-validation.bAFvkb/map2-audio-nightly-20260310-validation`
- Required shipped files present:
  - `install_on_new_host.sh`
  - `app/main.py`
  - `web/dist/index.html`
  - `VERSION`

## Installer sanity check

- Command:

```bash
MAP2_INSTALL_TEST_MODE=1 bash install_on_new_host.sh --dry-run --skip-avb --mode management
```

- Exit code: `0`
- Outcome: passed end to end from the extracted tarball without missing-file errors

## Web bundle sanity check

- Served extracted `web/dist` with:

```bash
python3 -m http.server 8124 --directory web/dist
```

- `GET /` returned `200`
- `HEAD /assets/index-DotInjc3.js` returned `200`

## Residual note

- The nightly pipeline is operational.
- Source-repo history cleanup remains separate, destructive, and manually coordinated under `T082-subD`.
