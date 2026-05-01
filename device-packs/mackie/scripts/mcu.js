// Mackie Control Universal (MCU) Pro mapping script
// — controller-host QuickJS module.
//
// MCU is bidirectional: every fader position, mute/solo state,
// scribble-strip text, and LED state needs to round-trip between
// MAP2 and the hardware. The fader_echo + scribble_handler functions
// are the load-bearing pieces of the bidirectional contract.

var MCU = MCU || {};

MCU.STATUS_NOTE_ON   = 0x90;
MCU.STATUS_CC        = 0xB0;
MCU.STATUS_PITCH     = 0xE0;
MCU.STATUS_SYSEX     = 0xF0;
MCU.MACKIE_MFR_ID    = [0x00, 0x00, 0x66];

// Bank state (which 8 channels are visible). The MCU's 8 hardware
// fader strips can address any contiguous 8-channel slice of the
// MAP2 chain matrix; bank_left/bank_right shift this offset.
MCU.bank_offset = 0;

// ---------- Fader (pitch-bend per channel) ----------

MCU.fader = function (channel, value14bit) {
    // value14bit = (msb << 7) | lsb from the pitch-bend message.
    // Map to 0.0 ... 1.0 for the engine target.
    var normalized = value14bit / 16383.0;
    return { value: normalized };
};

MCU.fader_echo = function (engineValue) {
    // engineValue is 0.0 ... 1.0 from the engine. Convert back to
    // 14-bit pitch-bend bytes so the motorized fader physically moves
    // to match.
    var v = Math.max(0, Math.min(1, engineValue));
    var pb = Math.round(v * 16383);
    return [
        MCU.STATUS_PITCH,            // status; channel-1 added by dispatcher
        pb & 0x7F,                   // LSB
        (pb >> 7) & 0x7F,            // MSB
    ];
};

// ---------- V-Pot encoder (relative CC) ----------

MCU.vpot = function (channel, value, vpotIndex) {
    // V-Pot CCs use Mackie relative-encoder mode:
    //   bit 6 (0x40) = direction (0 = clockwise, 1 = counter-clockwise)
    //   bits 0-5     = step count (1..63)
    var direction = (value & 0x40) ? -1 : 1;
    var steps = value & 0x3F;
    return { delta: direction * steps };
};

// ---------- Bank navigation ----------

MCU.bank_left = function (channel, value) {
    if (value === 0) return null;  // ignore note-off
    var bankSize = (typeof engine !== 'undefined' && engine.getSetting)
        ? (engine.getSetting('mcu_bank_size') || 8) : 8;
    MCU.bank_offset = Math.max(0, MCU.bank_offset - bankSize);
    return { bank_offset: MCU.bank_offset };
};

MCU.bank_right = function (channel, value) {
    if (value === 0) return null;
    var bankSize = (typeof engine !== 'undefined' && engine.getSetting)
        ? (engine.getSetting('mcu_bank_size') || 8) : 8;
    MCU.bank_offset += bankSize;
    return { bank_offset: MCU.bank_offset };
};

// ---------- Scribble-strip SysEx ----------

MCU.scribble_handler = function (bytes) {
    // Bytes start with F0 00 00 66 ... F7. Mackie scribble-strip
    // protocol:
    //   F0 00 00 66 14 12 <offset> <ascii bytes...> F7
    //     14 = MCU device ID; 12 = display LCD command;
    //     offset = position 0..111 (2 rows × 56 chars)
    //
    // Inbound scribble-strip writes from MAP2 (engine → hardware) are
    // emitted by the outbound side via MCU.scribble_emit (TODO when
    // engine.emitSysex hook lands). This inbound handler is mostly
    // a no-op — the MCU rarely sends scribble-strip writes back.
    return null;
};
