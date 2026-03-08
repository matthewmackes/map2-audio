# Biamp Tesira Forte CI — Reset & Connection Guide

> **Use case**: AVB I/O expander — additional analog inputs/outputs for MAP2 signal chains, transported over AVB.
>
> **Two paths documented**:
> - **Path A** (Steps 1-8): Linux / MAP2 only — works if the used unit already has a DSP config with AVB streams
> - **Path B** ([Appendix](#appendix--windows-path-using-biamp-tesira-software)): Windows + Biamp Tesira Software — required for firmware updates, factory-reset recovery, and creating a new DSP config

---

## Prerequisites

| Item | Details |
|------|---------|
| **MAP2 Audio** | Running on Linux with AVB support configured (`docs/avb-setup.md`) |
| **AVB NIC** | Intel I210 or I225 on the MAP2 host, with PTP/TSN qdiscs set up |
| **Network** | AVB-capable managed switch **or** direct Ethernet cable between Forte CI AVB port and MAP2 NIC |
| **Control network** | Forte CI control port on same subnet as MAP2 host (DHCP or link-local) |
| **Biamp Tesira Software** *(optional)* | Free download from [biamp.com/support/downloads](https://www.biamp.com/support/downloads?products=Tesira&resources=Software/Firmware) — requires Windows 10/11. Needed **only if**: firmware update required, factory reset wiped the DSP config, or you want to create a custom DSP design. See [Appendix](#appendix--windows-path-using-biamp-tesira-software) for full steps. |

---

## Decision: Factory Reset or Keep Existing Config?

A **used** Forte CI likely has a compiled DSP configuration with AVB stream blocks already set up by the previous owner. **Factory reset wipes that DSP config**, and recompiling one requires Biamp Tesira Software (Windows only).

| Scenario | Recommended Action |
|----------|-------------------|
| TTP port 23 is accessible and AVB streams exist | **Skip factory reset** — go straight to [Step 3](#step-3--verify-ttp-access) |
| TTP port 23 is closed and you can't control the unit | **Factory reset** — then see [Step 5](#step-5--dsp-configuration-caveat) for DSP config options |
| You have security concerns about the previous config | **Factory reset** — accept that you'll need Windows access for DSP recompile |

> **Need Biamp Tesira Software?** It's a single free application (no license key) — download it from [biamp.com/support/downloads](https://www.biamp.com/support/downloads?products=Tesira&resources=Software/Firmware). Runs on Windows 10/11 only. You'll need it for firmware updates, DSP config creation after a factory reset, or enabling TTP on a locked-down unit. Full walkthrough in the [Windows Appendix](#appendix--windows-path-using-biamp-tesira-software).

**Quick test** — plug in the control port and try:
```bash
telnet <forte-ip> 23
# Type: device get hostname
# If you get +OK — skip factory reset
# If connection refused — factory reset required
```

---

## Step 1 — Factory Reset (if needed)

> Skip this step if TTP is already accessible on the used unit.

1. **Power off** the Forte CI
2. **Locate the reset pinhole** on the rear panel, between the GPIO terminal block and the power connector
3. **Power on** the unit
4. **Press and hold** the reset button with a paperclip for **at least 10 seconds**, then release
5. Wait for the front-panel LCD to display **"Configuring Network Interface..."**
6. The unit will reboot with:
   - DHCP or link-local IP addressing
   - TTP (Telnet) port 23 **open** with no password
   - All presets and DSP configuration **cleared**

**Reference**: [Biamp — How to reset a Tesira device to factory defaults](https://support.biamp.com/Tesira/Miscellaneous/How_to_reset_a_Tesira_device_to_factory_defaults)

---

## Step 2 — Find the IP Address

Connect the Forte CI **control port** (not the AVB port) to the same network as the MAP2 host.

### Option A: DHCP network
```bash
# Scan for Biamp devices on the local subnet
sudo arp-scan -l | grep -i biamp

# Or use mDNS discovery
avahi-browse -art | grep -i tesira
```

### Option B: No DHCP (link-local fallback)

The Forte CI falls back to a 169.254.x.x link-local address. Configure the MAP2 NIC on the same segment:

```bash
# Add a link-local address to your control NIC (adjust interface name)
sudo ip addr add 169.254.1.1/16 dev enp3s0

# Scan link-local range for the Forte
sudo arp-scan --interface=enp3s0 169.254.0.0/16
```

### Verify connectivity
```bash
ping <forte-ip>
```

---

## Step 3 — Verify TTP Access

```bash
telnet <forte-ip> 23
```

At the blank prompt, type:
```
device get hostname
```

Expected response:
```
+OK value="TesiraFORTE-XXXXXX"
```

Useful identity commands:
```
device get hostname
device get serialNumber
device get version
device get model
device get macAddress
```

**If port 23 is refused**: the unit needs a factory reset (go back to [Step 1](#step-1--factory-reset-if-needed)).

---

## Step 4 — Check Firmware Version

From the TTP session:
```
device get version
```

Expected format: `+OK value="X.Y.Z"`

- **Firmware >= 3.12**: proceed to next step
- **Firmware < 3.12**: firmware update is required for reliable AVB and TTP operation. Firmware updates **require Biamp Tesira Software on Windows** — see [Appendix W2](#w2--update-firmware-if-needed). Use the [firmware update path calculator](https://support.biamp.com/Tesira/Software-Firmware/Tesira_firmware_update_path_calculator) to determine the upgrade path.

---

## Step 5 — DSP Configuration Caveat

> This step only applies if you performed a factory reset.

A factory-reset Forte CI has **no compiled DSP configuration**. Without a DSP config, there are **no AVB stream blocks** — the unit cannot send or receive AVB audio.

### Options

1. **You have the original `.sdx` file** from the previous owner
   - Re-compile and deploy via Biamp Tesira Software (Windows)

2. **No `.sdx` file available**
   - Create a minimal DSP config in Biamp Tesira Software:
     - Add `ExplicitAVBOutStream1` block (routes analog inputs to AVB talker)
     - Add `ExplicitAVBInStream1` block (routes AVB listener to analog outputs)
     - Wire analog input → AVB out, AVB in → analog output
     - Compile and deploy to device

3. **Best option (if applicable)**: don't factory-reset
   - If TTP was accessible on the used unit, the existing DSP config's AVB streams are still intact
   - Just change the hostname and register in MAP2

### Verify AVB streams exist

From TTP:
```
# Check for a talker stream (outputs from Forte to network)
ExplicitAVBOutStream1 get numChannels

# Check for a listener stream (inputs from network to Forte)
ExplicitAVBInStream1 get numChannels
```

If you get `+OK value="..."` responses, AVB streams are configured. If you get `-ERR`, the DSP config is missing or has no AVB stream blocks.

---

## Step 6 — AVB Network Setup

1. **Connect the AVB port** on the Forte CI to your AVB network:
   - Direct cable to MAP2 host's Intel I210/I225 NIC, **or**
   - AVB-managed switch with IEEE 802.1AS (gPTP) support

2. **Verify MAP2 AVB config**:
   ```bash
   # Check the AVB interface env var
   echo $MAP2_AVB_INTERFACE   # Should be e.g. enp2s0

   # Verify PTP is running
   systemctl status map2-ptp4l.service
   systemctl status map2-phc2sys.service
   ```

3. **Verify gPTP sync** via TTP:
   ```
   AVBInterface1 get ptpStatus
   ```
   Expected: `+OK value="Locked"` (may take 10-30 seconds after cable connect)

   Or via MAP2 API (after registration in next step):
   ```bash
   curl http://localhost:8080/api/tesira/devices/<device_id>/avb/ptp
   ```

---

## Step 7 — Register in MAP2

### Option A: Auto-discovery
```bash
# Start discovery scan
curl -X POST http://localhost:8080/api/tesira/discovery/start

# Poll until complete
curl http://localhost:8080/api/tesira/discovery/status

# Adopt the discovered device
curl -X POST http://localhost:8080/api/tesira/discovery/adopt \
  -H "Content-Type: application/json" \
  -d '{"host": "<forte-ip>", "name": "Forte CI"}'
```

### Option B: Manual registration
```bash
curl -X POST http://localhost:8080/api/tesira/devices \
  -H "Content-Type: application/json" \
  -d '{"host": "<forte-ip>", "port": 23, "name": "Forte CI"}'
```

### Verify
```bash
curl http://localhost:8080/api/tesira/devices | python3 -m json.tool
```

Look for `"connected": true` in the response. MAP2 will automatically:
- Connect via TTP and fetch device identity
- Enumerate all AVB send/receive streams
- Register them as AudioEndpoints in the AVB router

---

## Step 8 — Connect AVB I/O Streams

### List available streams
```bash
curl http://localhost:8080/api/tesira/devices/<device_id>/avb/streams | python3 -m json.tool
```

You should see talker streams (Forte CI analog inputs → AVB network) and listener streams (AVB network → Forte CI analog outputs).

### Connect streams to MAP2

**Forte CI inputs → MAP2** (receive analog audio from Forte CI):
```bash
curl -X POST http://localhost:8080/api/avb/router/connect \
  -H "Content-Type: application/json" \
  -d '{
    "talker_endpoint_id": "<forte-ci-talker-endpoint-id>",
    "listener_endpoint_id": "<map2-listener-endpoint-id>"
  }'
```

**MAP2 → Forte CI outputs** (send audio to Forte CI analog outputs):
```bash
curl -X POST http://localhost:8080/api/avb/router/connect \
  -H "Content-Type: application/json" \
  -d '{
    "talker_endpoint_id": "<map2-talker-endpoint-id>",
    "listener_endpoint_id": "<forte-ci-listener-endpoint-id>"
  }'
```

### Verify endpoints are visible
```bash
# List all talker endpoints
curl "http://localhost:8080/api/avb/router/endpoints?direction=talker"

# List all listener endpoints
curl "http://localhost:8080/api/avb/router/endpoints?direction=listener"
```

### Assign to signal chain

In the MAP2 GridFlow UI:
1. Click the **INPUT** endpoint card on your signal chain
2. In the AudioPortSelector modal, select the Forte CI AVB endpoint under the AVB tab
3. Repeat for **OUTPUT** to route audio back to the Forte CI's analog outputs

---

## Verification Checklist

- [ ] TTP port 23 responding (`device get hostname` returns `+OK`)
- [ ] Firmware >= 3.12 (`device get version`)
- [ ] DSP config has AVB stream blocks (`ExplicitAVBOutStream1 get numChannels` returns `+OK`)
- [ ] AVB PTP locked (`AVBInterface1 get ptpStatus` = `"Locked"`)
- [ ] Device in MAP2: `GET /api/tesira/devices` shows `connected: true`
- [ ] AVB streams visible: `GET /api/avb/router/endpoints` includes Forte CI endpoints
- [ ] Audio passes: analog in on Forte CI → AVB → MAP2 chain → AVB → analog out on Forte CI

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Port 23 connection refused | TTP disabled (configured unit) or incomplete reset | Factory reset: hold reset >=10s. Or try MAP2 port-61451 probe: `POST /api/tesira/devices/{id}/reconnect` |
| PTP not locking | Switch doesn't support 802.1AS | Use direct Ethernet cable between Forte CI and MAP2 NIC |
| No AVB streams found | DSP config missing or has no ExplicitAVBStream blocks | Requires Biamp Tesira Software (Windows) to create and compile a DSP config |
| Device shows offline in MAP2 | Firewall blocking TCP port 23 | `sudo firewall-cmd --add-port=23/tcp --permanent && sudo firewall-cmd --reload` |
| Audio dropouts | AVB QoS not configured on switch | Set VLAN 2, PCP 5 on switch; verify CBS/ETF qdiscs on MAP2 NIC (see `docs/avb-setup.md`) |
| Link-local IP not found | NIC not on same link-local segment | Add `169.254.1.1/16` to your control NIC: `sudo ip addr add 169.254.1.1/16 dev <iface>` |
| Firmware too old | Version < 3.12 | Use [Biamp firmware update path calculator](https://support.biamp.com/Tesira/Software-Firmware/Tesira_firmware_update_path_calculator) — requires Windows |

---

## Forte CI Specifications (Quick Reference)

| Spec | Value |
|------|-------|
| Analog inputs | 12 mic/line (configurable) |
| Analog outputs | 8 line |
| AVB channels | Up to 32x32 (depends on DSP config) |
| AVB sample rates | 48 kHz (standard), 96 kHz (reduced channel count) |
| Control protocol | TTP (Telnet Text Protocol) on port 23 |
| Control network | 1x Gigabit Ethernet (DHCP or static) |
| AVB network | 1x Gigabit Ethernet (Layer 2, IEEE 802.1AS/gPTP) |
| Default after reset | DHCP, TTP open, no password, no DSP config |

---

## Appendix — Windows Path Using Biamp Tesira Software

Use this path when:
- You performed a factory reset and need to create a new DSP config with AVB stream blocks
- Firmware is below 3.12 and needs updating
- You want to enable TTP on a configured unit without factory-resetting
- You want full control over the DSP routing (EQ, mixing, AEC, etc.)

### What You Need

| Item | Details |
|------|---------|
| **Windows PC** | Windows 10 or 11 (64-bit) |
| **Biamp Tesira Software** | Download from [biamp.com/support/downloads](https://www.biamp.com/support/downloads?products=Tesira&resources=Software/Firmware) — free, no license required |
| **Firmware file** | `.tfa` or `.tfa2` file from the same downloads page (match to your target version) |
| **Ethernet** | Cat5e cable from Windows PC to Forte CI **control port** (direct or via switch) |
| **Network config** | PC set to DHCP ("Obtain an IP address automatically") |

### W1 — Install Tesira Software and Connect

1. Download and install the latest **Biamp Tesira Software** from the [downloads page](https://www.biamp.com/support/downloads?products=Tesira&resources=Software/Firmware)
2. Connect the Windows PC to the Forte CI **control port** via Ethernet (direct cable or same switch/subnet)
3. Set the PC's Ethernet adapter to **DHCP** — both PC and Forte CI will auto-negotiate link-local addresses if no DHCP server is present (169.254.x.x range, may take up to 60 seconds)
4. Open Tesira Software — it should auto-discover the Forte CI via the network
   - If not found: go to **Tools > Options > Application Settings > Network > Device Discovery** and verify the correct network interface is selected

**Reference**: [TesiraFORTE Quickstart](https://support.biamp.com/Tesira/Programming/TesiraFORTE_Quickstart)

### W2 — Update Firmware (if needed)

> Skip if `device get version` already shows >= 3.12.

1. Check the [firmware update path calculator](https://support.biamp.com/Tesira/Software-Firmware/Tesira_firmware_update_path_calculator) — enter your current version to see if intermediate updates are required
2. Download the required `.tfa` / `.tfa2` firmware files from the [downloads page](https://www.biamp.com/support/downloads?products=Tesira&resources=Software/Firmware)
3. In Tesira Software: **System > Network > Perform Device Maintenance** (or click the **Device Maintenance** button)
4. Select the Forte CI device
5. Click **Update Firmware**, browse to the `.tfa` / `.tfa2` file
6. Wait for the update to complete (5-15 minutes) — **do not disconnect power or Ethernet during this process**
7. If an intermediate version was required, repeat with the next firmware file in the upgrade path
8. After final update, verify: **Device Maintenance > Device Info** should show the target version

**Reference**: [Tesira firmware update instructions](https://support.biamp.com/Tesira/Miscellaneous/Tesira_firmware_update_instructions)

### W3 — Enable TTP (Telnet) for Linux/MAP2 Control

> Factory-reset units already have TTP open. This step is only needed if you're keeping an existing DSP config where TTP was disabled.

1. In Tesira Software: **System > Network > Perform Device Maintenance**
2. Select the Forte CI
3. Go to **Network Settings**
4. Enable **Telnet** (TTP on port 23)
5. Click **Apply**
6. Verify from your Linux box: `telnet <forte-ip> 23` → `device get hostname` → `+OK`

### W4 — Create a Minimal AVB I/O DSP Configuration

> Skip if the used unit already has a working DSP config with AVB streams (check via TTP: `ExplicitAVBOutStream1 get numChannels`).

This creates a clean config that routes all 12 analog inputs out over AVB, and routes AVB audio in to all 8 analog outputs.

1. In Tesira Software: **File > New** to create a blank system design
2. From the **Device** palette, drag a **TesiraFORTE AVB CI** onto the canvas
3. Double-click the device to open the DSP block editor
4. Add the following blocks from the palette:

   **Input side** (Forte CI analog → AVB network):
   - **Input** block: 12-channel analog input (this represents the Forte CI's physical mic/line inputs)
   - **AVB.1 Output** block (`ExplicitAVBOutStream1`): set to desired channel count (e.g., 8 or 12 channels)
   - Wire: Input → AVB.1 Output

   **Output side** (AVB network → Forte CI analog):
   - **AVB.1 Input** block (`ExplicitAVBInStream1`): set to desired channel count (e.g., 8 channels)
   - **Output** block: 8-channel analog output (this represents the Forte CI's physical line outputs)
   - Wire: AVB.1 Input → Output

5. **Compile**: click the **Compile** button (or Ctrl+F7) — resolve any errors
6. **Deploy**: click **Go Live** (or press F5) — this pushes the compiled config to the Forte CI
7. The device will restart its DSP engine — front-panel LCD should show normal operation within a few seconds

### W5 — Save and Export

1. **Save the `.sdx` file** — keep this somewhere safe for future re-deploys
2. Optionally save presets on the device: **System > Presets > Store Preset**

### W6 — Return to Linux Path

Once the DSP config is deployed and TTP is enabled, disconnect the Windows PC and return to the Linux guide:
- Continue from [Step 6 — AVB Network Setup](#step-6--avb-network-setup) to connect the AVB port and register in MAP2

---

## References

- [Biamp — Factory reset procedure](https://support.biamp.com/Tesira/Miscellaneous/How_to_reset_a_Tesira_device_to_factory_defaults)
- [Biamp — TesiraFORTE Quickstart](https://support.biamp.com/Tesira/Programming/TesiraFORTE_Quickstart)
- [Biamp — Network ports and protocols](https://support.biamp.com/Tesira/Control/Tesira_network_ports_and_protocols)
- [Biamp — Firmware update path calculator](https://support.biamp.com/Tesira/Software-Firmware/Tesira_firmware_update_path_calculator)
- [Biamp — Separated or converged AVB networks](https://support.biamp.com/Tesira/AVB/Separated_or_converged_Control_and_AVB_networks)
- [Biamp — AVB streams (IEEE 1722.1)](https://support.biamp.com/Tesira/AVB/AVB_streams_(IEEE_1722.1))
- [Biamp — Tesira Software & Firmware downloads](https://www.biamp.com/support/downloads?products=Tesira&resources=Software/Firmware)
- [Biamp — Firmware update instructions](https://support.biamp.com/Tesira/Miscellaneous/Tesira_firmware_update_instructions)
- [Biamp — Forte CI data sheet](https://downloads.biamp.com/assets/docs/default-source/data-sheets/biamp_data_sheet_tesiraforte_avb_ci.pdf)
- MAP2 AVB setup: `docs/avb-setup.md`
