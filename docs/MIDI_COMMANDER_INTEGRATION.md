# MeloAudio MIDI Commander Integration Design

## Overview

The **MeloAudio MIDI Commander** is the recommended standard MIDI foot controller for the MAP2 Audio Platform. This document provides a comprehensive integration design for optimal utilization of the controller's features.

## Hardware Specifications

| Feature | Specification |
|---------|---------------|
| **Footswitches** | 10 tactile switches (8 main + 2 bank) |
| **Expression Jacks** | 2x TRS (EXP1, EXP2) |
| **MIDI Output** | 5-pin DIN MIDI Out |
| **USB** | USB-B (MIDI + Power) |
| **Display** | OLED (shows PC#, CC#, EXP values, battery) |
| **Power** | USB or 2x AAA batteries (40+ hours) |
| **Dimensions** | 286mm x 110mm x 60mm |

### Physical Layout

```
┌─────────────────────────────────────────────────────────────┐
│                     [OLED DISPLAY]                          │
│                                                             │
│   ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐  │
│   │ 1 │  │ 2 │  │ 3 │  │ 4 │  │ ▲ │  │ ▼ │  │ A │  │ B │  │
│   └───┘  └───┘  └───┘  └───┘  └───┘  └───┘  └───┘  └───┘  │
│   (Top Row - CCs/Scenes)     (Bank)  (Bottom Row - PCs)    │
│                                                             │
│   ┌───┐  ┌───┐  ┌───┐  ┌───┐          ┌───┐  ┌───┐        │
│   │ C │  │ D │  │   │  │   │          │   │  │   │        │
│   └───┘  └───┘  └───┘  └───┘          └───┘  └───┘        │
│                                                             │
│   [EXP1]                                          [EXP2]    │
└─────────────────────────────────────────────────────────────┘
```

## Recommended Default Configuration

### Boot Mode: Custom 2

Enter by holding **D** while powering on. This provides full CC/PC configurability.

### Footswitch Assignments

| Switch | Function | MIDI Message | MAP2 Action |
|--------|----------|--------------|-------------|
| **A** | Chain 1 | PC 0 | `activate_chain(chain_id=1)` |
| **B** | Chain 2 | PC 1 | `activate_chain(chain_id=2)` |
| **C** | Chain 3 | PC 2 | `activate_chain(chain_id=3)` |
| **D** | Chain 4 | PC 3 | `activate_chain(chain_id=4)` |
| **1** | Toggle Slot 1 | CC 80, Toggle | `toggle_plugin(slot=0)` |
| **2** | Toggle Slot 2 | CC 81, Toggle | `toggle_plugin(slot=1)` |
| **3** | Toggle Slot 3 | CC 82, Toggle | `toggle_plugin(slot=2)` |
| **4** | Tap Tempo | CC 14, Momentary | `set_tempo()` or tuner |
| **▲** | Bank Up | Internal | Next 4 chains (PC 4-7) |
| **▼** | Bank Down | Internal | Previous 4 chains |

### Expression Pedal Assignments

| Pedal | Default CC | Function | Range |
|-------|------------|----------|-------|
| **EXP1** | CC 7 | Volume / Output Level | 0-127 → 0.0-1.0 |
| **EXP2** | CC 1 | Wah Position / Mod Depth | 0-127 → 0.0-1.0 |

## Platform Integration Architecture

### 1. Auto-Detection System

```python
# app/services/midi/device_profiles.py

from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum

class MIDIDeviceProfile(Enum):
    MELOAUDIO_COMMANDER = "meloaudio_commander"
    GENERIC = "generic"

@dataclass
class FootswitchConfig:
    switch_id: str
    label: str
    midi_type: str  # "pc", "cc", "note"
    channel: int
    number: int
    mode: str  # "momentary", "toggle", "timed"
    default_action: Optional[str] = None

@dataclass
class ExpressionConfig:
    pedal_id: str
    label: str
    cc_number: int
    channel: int
    min_value: int = 0
    max_value: int = 127
    curve: str = "linear"
    default_target: Optional[str] = None

@dataclass
class MIDICommanderProfile:
    """MeloAudio MIDI Commander device profile"""

    name: str = "MeloAudio MIDI Commander"
    profile_id: str = "meloaudio_commander"
    usb_vendor_id: Optional[int] = None  # If discoverable
    usb_product_id: Optional[int] = None

    # Detection patterns (device name matching)
    name_patterns: List[str] = field(default_factory=lambda: [
        "MIDI Commander",
        "MeloAudio",
        "TSMIDI",
    ])

    footswitches: List[FootswitchConfig] = field(default_factory=lambda: [
        # Bottom row - Program Changes for chain switching
        FootswitchConfig("A", "Chain 1", "pc", 1, 0, "momentary", "activate_chain"),
        FootswitchConfig("B", "Chain 2", "pc", 1, 1, "momentary", "activate_chain"),
        FootswitchConfig("C", "Chain 3", "pc", 1, 2, "momentary", "activate_chain"),
        FootswitchConfig("D", "Chain 4", "pc", 1, 3, "momentary", "activate_chain"),
        # Top row - CCs for plugin bypass toggles
        FootswitchConfig("1", "Slot 1", "cc", 1, 80, "toggle", "toggle_plugin"),
        FootswitchConfig("2", "Slot 2", "cc", 1, 81, "toggle", "toggle_plugin"),
        FootswitchConfig("3", "Slot 3", "cc", 1, 82, "toggle", "toggle_plugin"),
        FootswitchConfig("4", "Tap/Tuner", "cc", 1, 14, "momentary", "tap_tempo"),
    ])

    expression_pedals: List[ExpressionConfig] = field(default_factory=lambda: [
        ExpressionConfig("EXP1", "Volume", 7, 1, curve="linear"),
        ExpressionConfig("EXP2", "Wah/Mod", 1, 1, curve="linear"),
    ])

    # Banking configuration
    banks_enabled: bool = True
    chains_per_bank: int = 4
    max_banks: int = 8  # 32 chains total addressable

    def get_pc_for_chain(self, chain_index: int) -> tuple[int, int]:
        """Calculate PC number and bank for a given chain index"""
        bank = chain_index // self.chains_per_bank
        pc = chain_index % self.chains_per_bank
        return pc, bank
```

### 2. Quick Setup Wizard

Add a dedicated setup flow for MIDI Commander users:

```typescript
// web/src/app/pages/MIDISetupWizard.tsx

interface MIDICommanderSetupState {
  step: 'detect' | 'confirm' | 'configure' | 'test' | 'complete'
  deviceFound: boolean
  deviceName: string | null
  expressionPedals: {
    exp1Connected: boolean
    exp2Connected: boolean
    exp1Function: 'volume' | 'wah' | 'custom'
    exp2Function: 'wah' | 'modulation' | 'custom'
  }
  chainAssignments: Array<{
    switchId: string
    chainId: number | null
  }>
}

const MIDI_COMMANDER_DEFAULTS = {
  // Chain switching via Program Change
  commands: [
    { trigger_type: 'program_change', channel: 0, data1: 0, action: 'activate_chain', target_chain_id: 1 },
    { trigger_type: 'program_change', channel: 0, data1: 1, action: 'activate_chain', target_chain_id: 2 },
    { trigger_type: 'program_change', channel: 0, data1: 2, action: 'activate_chain', target_chain_id: 3 },
    { trigger_type: 'program_change', channel: 0, data1: 3, action: 'activate_chain', target_chain_id: 4 },
  ],

  // Plugin toggles via CC
  mappings: [
    { cc: 80, channel: 0, action: 'toggle_plugin', slot: 0, name: 'Slot 1 Toggle' },
    { cc: 81, channel: 0, action: 'toggle_plugin', slot: 1, name: 'Slot 2 Toggle' },
    { cc: 82, channel: 0, action: 'toggle_plugin', slot: 2, name: 'Slot 3 Toggle' },
  ],

  // Expression pedal defaults
  expressionMappings: [
    { cc: 7, channel: 0, target: 'master_volume', name: 'Volume Pedal' },
    { cc: 1, channel: 0, target: null, name: 'Expression 2' }, // User assigns
  ]
}
```

### 3. Expression Pedal Integration

Map expression pedals to plugin parameters with curve support:

```python
# app/services/midi/expression_handler.py

from enum import Enum
from typing import Callable
import math

class CurveType(Enum):
    LINEAR = "linear"
    LOGARITHMIC = "logarithmic"
    EXPONENTIAL = "exponential"
    S_CURVE = "s_curve"

class ExpressionPedalHandler:
    """Handles expression pedal MIDI input with configurable curves"""

    CURVE_FUNCTIONS: dict[CurveType, Callable[[float], float]] = {
        CurveType.LINEAR: lambda x: x,
        CurveType.LOGARITHMIC: lambda x: math.log10(1 + 9 * x) if x > 0 else 0,
        CurveType.EXPONENTIAL: lambda x: (math.pow(10, x) - 1) / 9,
        CurveType.S_CURVE: lambda x: 0.5 * (1 + math.tanh(4 * (x - 0.5))),
    }

    def __init__(self, cc_number: int, channel: int = 0):
        self.cc_number = cc_number
        self.channel = channel
        self.curve_type = CurveType.LINEAR
        self.min_output = 0.0
        self.max_output = 1.0
        self.invert = False
        self.deadzone_low = 0  # 0-127 range
        self.deadzone_high = 127
        self.last_value = 0
        self.smoothing = 0.0  # 0.0-1.0, low-pass filter coefficient

    def process_value(self, midi_value: int) -> float:
        """Convert MIDI 0-127 to parameter value with curve applied"""
        # Apply deadzone
        if midi_value < self.deadzone_low:
            midi_value = self.deadzone_low
        elif midi_value > self.deadzone_high:
            midi_value = self.deadzone_high

        # Normalize to 0.0-1.0
        range_size = self.deadzone_high - self.deadzone_low
        if range_size == 0:
            normalized = 0.0
        else:
            normalized = (midi_value - self.deadzone_low) / range_size

        # Apply curve
        curved = self.CURVE_FUNCTIONS[self.curve_type](normalized)

        # Apply inversion
        if self.invert:
            curved = 1.0 - curved

        # Apply smoothing (simple low-pass)
        if self.smoothing > 0:
            curved = self.last_value * self.smoothing + curved * (1 - self.smoothing)
        self.last_value = curved

        # Scale to output range
        return self.min_output + curved * (self.max_output - self.min_output)
```

### 4. Bank Management

Track bank state for extended chain access:

```python
# app/services/midi/bank_manager.py

from dataclasses import dataclass
from typing import Optional
import logging

logger = logging.getLogger(__name__)

@dataclass
class BankState:
    current_bank: int = 0
    chains_per_bank: int = 4
    max_banks: int = 8

    @property
    def pc_offset(self) -> int:
        """Get the PC offset for current bank"""
        return self.current_bank * self.chains_per_bank

    def get_chain_id(self, pc_number: int) -> int:
        """Convert PC number to absolute chain ID"""
        return self.pc_offset + pc_number + 1  # 1-indexed chains

    def bank_up(self) -> bool:
        """Move to next bank, returns True if changed"""
        if self.current_bank < self.max_banks - 1:
            self.current_bank += 1
            logger.info(f"Bank up: now bank {self.current_bank}")
            return True
        return False

    def bank_down(self) -> bool:
        """Move to previous bank, returns True if changed"""
        if self.current_bank > 0:
            self.current_bank -= 1
            logger.info(f"Bank down: now bank {self.current_bank}")
            return True
        return False

class MIDICommanderBankManager:
    """Manages bank state for MIDI Commander integration"""

    # Bank up/down are typically sent as specific CCs or internal
    BANK_UP_CC = 85  # Configurable
    BANK_DOWN_CC = 86

    def __init__(self):
        self.state = BankState()
        self.bank_display_callback: Optional[callable] = None

    def handle_cc(self, cc: int, value: int) -> Optional[str]:
        """Handle CC for bank switching, returns action if bank changed"""
        if cc == self.BANK_UP_CC and value > 63:
            if self.state.bank_up():
                return "bank_up"
        elif cc == self.BANK_DOWN_CC and value > 63:
            if self.state.bank_down():
                return "bank_down"
        return None

    def handle_program_change(self, pc: int) -> int:
        """Convert incoming PC to absolute chain ID"""
        return self.state.get_chain_id(pc)
```

### 5. Web UI Enhancements

#### Device Profile Selector

```typescript
// Add to MIDIPage.tsx

interface DeviceProfile {
  id: string
  name: string
  icon: string
  description: string
  isRecommended?: boolean
}

const DEVICE_PROFILES: DeviceProfile[] = [
  {
    id: 'meloaudio_commander',
    name: 'MeloAudio MIDI Commander',
    icon: '🎛️',
    description: '10 footswitches, 2 expression pedals, USB/DIN MIDI',
    isRecommended: true,
  },
  {
    id: 'generic',
    name: 'Generic MIDI Controller',
    icon: '🎹',
    description: 'Manual CC/PC configuration',
  },
]
```

#### Expression Pedal Calibration UI

```typescript
interface ExpressionCalibration {
  minRaw: number
  maxRaw: number
  deadzoneLow: number
  deadzoneHigh: number
  curve: 'linear' | 'logarithmic' | 'exponential' | 's_curve'
  invert: boolean
}

function ExpressionCalibrationPanel({ pedalId }: { pedalId: 'EXP1' | 'EXP2' }) {
  const [calibration, setCalibration] = useState<ExpressionCalibration>({
    minRaw: 0,
    maxRaw: 127,
    deadzoneLow: 2,
    deadzoneHigh: 125,
    curve: 'linear',
    invert: false,
  })
  const [liveValue, setLiveValue] = useState(0)

  // Subscribe to MIDI activity for live preview
  // ... implementation
}
```

## Complete MIDI Command Mapping Table

### Standard Configuration (Custom 2 Mode)

| Button | Bank 1 | Bank 2 | Bank 3 | Bank 4 |
|--------|--------|--------|--------|--------|
| A | PC 0 → Chain 1 | PC 0 → Chain 5 | PC 0 → Chain 9 | PC 0 → Chain 13 |
| B | PC 1 → Chain 2 | PC 1 → Chain 6 | PC 1 → Chain 10 | PC 1 → Chain 14 |
| C | PC 2 → Chain 3 | PC 2 → Chain 7 | PC 2 → Chain 11 | PC 2 → Chain 15 |
| D | PC 3 → Chain 4 | PC 3 → Chain 8 | PC 3 → Chain 12 | PC 3 → Chain 16 |
| 1 | CC 80 → Slot 1 bypass | (same) | (same) | (same) |
| 2 | CC 81 → Slot 2 bypass | (same) | (same) | (same) |
| 3 | CC 82 → Slot 3 bypass | (same) | (same) | (same) |
| 4 | CC 14 → Tap Tempo | (same) | (same) | (same) |

### Alternative Scene Mode (for Preset Switching)

| Button | Function | MIDI |
|--------|----------|------|
| A-D | Chain Select | PC 0-3 |
| 1-7 | Preset/Scene 1-7 | CC 34 val 0-6 |
| 4/D | Next Scene | CC 14 |

## API Endpoints

### Device Profile Endpoints

```
GET  /api/midi/v2/device-profiles
     Returns available device profiles

GET  /api/midi/v2/device-profiles/meloaudio_commander
     Returns MIDI Commander specific configuration

POST /api/midi/v2/device-profiles/apply
     Body: { profile_id: "meloaudio_commander" }
     Applies a device profile (creates default mappings/commands)

GET  /api/midi/v2/expression/calibration
     Returns expression pedal calibration settings

POST /api/midi/v2/expression/calibration
     Body: { pedal: "EXP1", min: 0, max: 127, curve: "linear", ... }
     Updates calibration

POST /api/midi/v2/expression/calibrate/start
     Body: { pedal: "EXP1" }
     Starts calibration mode (move pedal to set min/max)

POST /api/midi/v2/expression/calibrate/stop
     Completes calibration
```

## Connection Modes

### USB Mode (Recommended)

- Provides power + MIDI simultaneously
- Class-compliant USB MIDI (works with Linux/ALSA)
- Shows as MIDI device in `aconnect -l`

### 5-Pin DIN MIDI Mode

- Use when USB not practical
- Requires external power (batteries or USB power bank)
- Connect MIDI Out → MAP2 MIDI In

### Linux Connection

```bash
# List MIDI devices
aconnect -l

# The MIDI Commander typically appears as:
# client 24: 'MIDI Commander' [type=kernel,card=2]
#     0 'MIDI Commander MIDI 1'

# Connect to MAP2's MIDI input (example)
aconnect 'MIDI Commander':0 'MAP2 Audio':0
```

## Firmware Notes

### Standard Firmware Modes

1. **AxeFX Mode**: 4 PC + 4 CC layout (hold specific button on power-on)
2. **Scene Mode**: Scenes on 1-7, chain select on A-D
3. **Custom 1/2**: User-configurable (recommended for MAP2)

### Custom Firmware Option

The [harvie256/midi-commander-custom](https://github.com/harvie256/midi-commander-custom) firmware offers:
- 8 banks × 8 buttons
- Up to 10 chained commands per button
- Individual channel per command
- CC toggle/momentary/timed modes
- Bank Select (LSB/MSB) support

### Entering DFU Mode (Firmware Update)

1. Connect via USB
2. Hold **Bank Down + D** while powering on
3. Display stays blank, LED 3 lights up
4. Use `dfu-util` to flash

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Device not detected | Check USB connection; try different cable |
| Wrong PC numbers | Verify Custom mode active (hold D on boot) |
| Expression pedal jumpy | Add deadzone (2-5 at each end) |
| Bank not changing | Check Bank Up/Down CC configuration |
| No MIDI output | Verify MIDI cable orientation (Out→In) |

## Sources

- [Amazon Product Page](https://www.amazon.com/MeloAudio-Commander-Multi-Effects-Portable-Controller/dp/B07DQPTZ1F)
- [Gear Gods Review](https://geargods.net/review/a-simple-compact-midi-footswitch-meloaudio-midi-commander-review/)
- [Custom Firmware (GitHub)](https://github.com/harvie256/midi-commander-custom)
- [Fractal Audio Forums](https://forum.fractalaudio.com/threads/meloaudio-midi-commander.147909/)
- [Linux Firmware Guide](https://gist.github.com/ericfont/7c780275e51a511bb6be4d3075b34e3b)
- [Audiofanzine Manual](https://medias.audiofanzine.com/files/ts-midi-manual-482144.pdf)
- [EEVBlog Custom Firmware Thread](https://www.eevblog.com/forum/projects/meloaudio-midi-commander-custom-firmware/)
