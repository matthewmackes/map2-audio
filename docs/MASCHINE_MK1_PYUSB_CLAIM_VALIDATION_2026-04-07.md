# Maschine MK1 PyUSB Claim Validation

Date: 2026-04-07

This note records the current-host proof that the `pyusb-bulk` transport can safely detach `snd-usb-caiaq`, claim the richer Maschine MK1 vendor interface, read traffic from the preferred bulk endpoint, and reattach the kernel driver on disconnect.

## Host

- Device: Native Instruments Maschine MK1 `17cc:0808`
- Backend user: `mm`
- Backend service user: `mm`
- Relevant supplemental group: `audio`
- Kernel driver on interface `0`: `snd-usb-caiaq`

## Endpoint mapping

- Alternate setting `0`: bulk `0x01` OUT, `0x81` IN
- Alternate setting `1`: bulk `0x01` OUT, `0x81` IN, `0x08` OUT, `0x84` IN
- Preferred rich path: alternate setting `1`, `0x08` OUT, `0x84` IN

## Validation sequence

1. Confirmed the default host posture was still blocked for the unprivileged session:
   - `/dev/bus/usb/002/029` was `root:root 0664`
   - the `mm` session could open the node read-only but not read/write
2. Installed `pyusb` into the host Python environment.
3. Temporarily granted the usbfs node to the `audio` group as `0660 root:audio`.
4. Ran `PyUsbBulkMaschineTransport(vendor_id=0x17CC, product_id=0x0808, allow_kernel_detach=True)` as both `root` and the normal `mm` user.
5. Verified the transport:
   - detached `snd-usb-caiaq`
   - claimed interface `0`
   - selected alternate setting `1`
   - resolved `0x08` OUT and `0x84` IN
   - read a 64-byte report from `0x84`
   - disconnected and reattached the kernel driver

## Observed results

- Root validation connected successfully and read `64` bytes from `0x84`.
- Unprivileged validation also connected successfully once the device node was `0660 root:audio`.
- Example read preview from the scripted unprivileged run:
  - `000000100020003000400050006000700080009000a000b000c000d000e000f0000000100020003000400050006000700080009000a000b000c000d000e000f0`

## Production posture

- The transport stack is no longer blocked by unknown endpoint or detach behavior.
- The remaining host requirement is persistent usbfs policy, not transport implementation.
- Use the repo-owned rule:
  - `config/udev/90-map2-maschine-mk1.rules`
- Install it to:
  - `/etc/udev/rules.d/90-map2-maschine-mk1.rules`
- Then reload udev and retrigger the device so the usbfs node stays writable by the MAP2 service user.

## Recommended runtime policy

- `transport_preference=pyusb-bulk` or `auto`
- `allow_kernel_detach=true`
- Keep ALSA MIDI available for the raw MIDI path; use `pyusb-bulk` for the richer LCD/LED vendor path
