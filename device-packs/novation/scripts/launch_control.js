// Novation Launch Control XL mapping script
// — controller-host QuickJS module.

var LaunchControl = LaunchControl || {};

LaunchControl.STATUS_NOTE_ON = 0x90;
LaunchControl.STATUS_CC      = 0xB0;
LaunchControl.STATUS_SYSEX   = 0xF0;
LaunchControl.NOVATION_MFR_ID = [0x00, 0x20, 0x29];

// Color codes for LED velocity-based color (Launch Control XL palette)
LaunchControl.COLOR_OFF       = 0x0C;
LaunchControl.COLOR_RED_LOW   = 0x0D;
LaunchControl.COLOR_RED_FULL  = 0x0F;
LaunchControl.COLOR_AMBER     = 0x3F;
LaunchControl.COLOR_GREEN_LOW = 0x1C;
LaunchControl.COLOR_GREEN_FULL = 0x3C;

LaunchControl.bank_offset = 0;

LaunchControl.bank_left = function (channel, value) {
    if (value === 0) return null;
    LaunchControl.bank_offset = Math.max(0, LaunchControl.bank_offset - 8);
    return { bank_offset: LaunchControl.bank_offset };
};

LaunchControl.bank_right = function (channel, value) {
    if (value === 0) return null;
    LaunchControl.bank_offset += 8;
    return { bank_offset: LaunchControl.bank_offset };
};

LaunchControl.template_changed = function (bytes) {
    // Novation SysEx for template change:
    //   F0 00 20 29 02 11 77 <template-id> F7
    // We update the active-template setting + emit a corresponding
    // engine event so dependent surfaces can re-evaluate.
    if (bytes.length < 9) return null;
    if (bytes[1] !== 0x00 || bytes[2] !== 0x20 || bytes[3] !== 0x29) return null;
    var templateId = bytes[7];
    return { template_id: templateId };
};

LaunchControl.mute_led = function (engineValue) {
    // Mute on = red full; mute off = green full.
    var velocity = engineValue
        ? LaunchControl.COLOR_RED_FULL
        : LaunchControl.COLOR_GREEN_FULL;
    return [
        LaunchControl.STATUS_NOTE_ON | 8,  // channel 9 (0-indexed = 8)
        0,                                  // note (overridden by output row)
        velocity,
    ];
};
