# Lookup Index — Device-Pack Auto-Generation (T2492)

This directory holds enrichment data used by the device-pack
auto-generator at `app/services/device_pack_auto_gen/`.

## Contents

- `mixxx-controllers.json` — VID:PID lookup index built from
  `device-packs/_mixx-imports/res/controllers/*.{hid,bulk}.xml` by
  `scripts/build_mixxx_lookup_index.py`. Mixxx `.midi.xml` files are
  intentionally skipped because they don't declare USB VID:PID
  (operator falls through to "generate from scratch" for those
  devices, per the locked T2492 Q4=A decision).

- `usb.ids` — verbatim mirror of `http://www.linux-usb.org/usb.ids`
  (USB-IF maintained vendor + product database, ~700 KB). Used as the
  vendor-name fallback when the Mixxx index has no VID:PID match.
  Refresh by running:
  ```
  curl -sL -o device-packs/_lookup-index/usb.ids http://www.linux-usb.org/usb.ids
  ```

## Refresh

To rebuild both files:

```bash
# 1. Refresh the Mixxx mirror (T2492-2; not part of T2492-1 kickoff)
#    git -C /tmp/mixxx pull
#    cp -a /tmp/mixxx/res/controllers/. device-packs/_mixx-imports/res/controllers/

# 2. Rebuild the VID:PID index from whatever's in the mirror
python3 scripts/build_mixxx_lookup_index.py

# 3. Refresh the USB-IF table
curl -sL -o device-packs/_lookup-index/usb.ids http://www.linux-usb.org/usb.ids
```

## License

- `mixxx-controllers.json` is a derivative work that references file
  paths inside `device-packs/_mixx-imports/`. The referenced XMLs
  retain their original Mixxx GPL-2.0-or-later license headers; the
  index itself is metadata about those files.
- `usb.ids` is in the public domain per USB-IF's distribution terms.

## Cross-references

- Design doc: `docs/architecture/DEVICE_PACK_AUTO_GENERATION.md`
- T2492 worklist entry: `docs/PROJECT_WORKLIST.md`
- Mixxx mirror: `device-packs/_mixx-imports/`
