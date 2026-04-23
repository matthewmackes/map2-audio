# LCD Hardware Wiring — MAP2

**Last updated:** 2026-04-23 (T2430)

Two 20×4 HD44780 character LCDs with PCF8574 I²C backpacks, driven via
native I²C bus and/or an FT232H USB-to-I²C bridge.

---

## HD44780 + PCF8574 backpack

Standard 20×4 character LCDs with an I²C backpack (PCF8574 chip) soldered
on the back. Common module pinout (backpack → MCU):

| Backpack pin | Function | Connect to |
|---|---|---|
| GND | Ground | Bus GND |
| VCC | 5 V power | 5 V supply |
| SDA | I²C data | SDA line |
| SCL | I²C clock | SCL line |

PCF8574 I²C address is fixed at board manufacture — common variants are
`0x27` (default) and `0x3F` (some suppliers). Solder jumpers on the
backpack (`A0/A1/A2`) can select `0x20`–`0x27` or `0x38`–`0x3F`.

The MAP2 default config expects:
- LCD 0 @ `0x27`
- LCD 1 @ `0x3F`

Change these in `/devices/lcd/settings` if your hardware is different.

---

## Native I²C path

Host: Linux with native I²C controller exposed as `/dev/i2c-1`
(Intel/AMD workstations typically use `i2c-1` on the SMBus; Raspberry
Pi uses `i2c-1` on the GPIO header).

### Permissions

```bash
sudo usermod -aG i2c $USER
# log out + back in for group change to take effect
```

### Verify the bus
```bash
i2cdetect -y 1
# Should show addresses like 27 and/or 3F marked as present.
```

### Pull-ups
PCF8574 modules usually have 10 kΩ pull-ups on SDA/SCL built in. For
long runs (> 30 cm) or multiple displays on the same bus, lower the
bus frequency (`frequency=50_000`) or add external 4.7 kΩ pull-ups to
VCC.

---

## FT232H path

FT232H is an FTDI USB-to-multi-protocol bridge. MAP2 uses its MPSSE
engine to drive I²C over USB. Requirements:

- FT232H breakout (Adafruit 2264 or similar)
- USB cable to host
- Python: `pip install pyftdi` in the MAP2 venv

### FT232H → LCD wiring

| FT232H pin | Function | LCD backpack pin |
|---|---|---|
| D0 | SCL | SCL |
| D1 + D2 (tied) | SDA | SDA |
| GND | Ground | GND |
| 5V out | Power | VCC |

D1 and D2 must be tied together for bidirectional SDA (pyftdi I2C mode).
Pull-ups (4.7 kΩ to 5 V) on SDA and SCL are required — most backpack
modules already include them.

### Permissions

pyftdi needs direct access to the USB device. Install the udev rule:

```bash
sudo tee /etc/udev/rules.d/11-ftdi.rules >/dev/null <<'EOF'
SUBSYSTEM=="usb", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6014", GROUP="plugdev", MODE="0660"
EOF
sudo udevadm control --reload-rules
# unplug + replug FT232H
sudo usermod -aG plugdev $USER
```

### FT232H URL format

Default URL: `ftdi://ftdi:232h/1`. Multi-FT232H setups: enumerate with
`pyftdi.ftdi.Ftdi.list_devices()` and use serial-number-qualified URLs
like `ftdi://ftdi:232h:FT1ABC2D/1`.

### Verify

```bash
python3 -m pyftdi.ftdi  # lists attached FT232H devices
```

Then in MAP2: `/devices/lcd/hardware` → **Scan FT232H** button. Should
report `connected=true` and list discovered I²C addresses.

---

## Multi-adapter dual-LCD setup

Two common configurations:

### Dual native (most common)
Both LCDs on the same I²C bus at `0x27` and `0x3F`. Set both displays
to `adapter: native-i2c` in Settings.

### Native + FT232H (dev/test bench)
LCD 0 on native I²C bus (`0x27`), LCD 1 on FT232H (`0x3F`). Set
`lcd.displays[0].adapter = native-i2c`, `lcd.displays[1].adapter = ft232h`.

The LCD manager's multi-adapter support handles this natively — each
driver runs independently.

---

## Troubleshooting

### Scan shows no devices

- Verify backpack is powered (VCC = 5 V, GND connected).
- Check `i2cdetect -y 1` sees the addresses.
- Check for cold solder joints on the backpack's pin header.
- For FT232H: `dmesg | grep FTDI` — USB device should enumerate.
- Lower bus frequency: `frequency_hz=50000` in the driver constructor.

### Garbage characters or wrong text

- Wrong I²C address — the PCF8574 acknowledged but a different chip is
  there. Try writing to alternate addresses via the raw-write debug tool.
- Contrast pot on the LCD is misadjusted — twist the blue potentiometer
  on the backpack until characters appear.
- Wrong number of lines or character width — HD44780 20×4 init uses
  the `0x28` function-set command. Non-standard LCDs may need different
  values.

### Backlight won't turn off

- Check `driver.set_backlight(0)` was called — `/api/lcd/backlight/{id}`
  with `enabled=false`.
- PCF8574 backpack backlight is on/off only (no PWM dim). The
  `brightness` field is simulated as on-above-zero / off-at-zero for
  this backpack.

### FT232H fails with `BackendError`

- pyftdi not installed: `pip install pyftdi`.
- udev rule missing or user not in `plugdev` group.
- Another process (like a serial terminal) has the FT232H open.

---

## Recommended bill of materials

- 2× 20×4 HD44780 LCD with PCF8574 I²C backpack (any supplier; look for
  "20x4 I2C LCD blue green yellow")
- 1× FT232H breakout (Adafruit 2264 or Glyn/Mouser equivalent) for dual
  adapter setups
- 4.7 kΩ resistors (2× pull-ups if the backpack doesn't include them)
- Dupont jumper wires or ribbon cable
- USB-A → micro-USB for FT232H

---

## References

- HD44780 datasheet: Hitachi LCD controller — character codes and timing.
- PCF8574 datasheet: NXP I²C 8-bit I/O expander — backlight + register
  layout.
- pyftdi documentation: https://eblot.github.io/pyftdi/
- Driver source: `app/drivers/lcd_display.py`, `app/drivers/ft232h_lcd_display.py`
