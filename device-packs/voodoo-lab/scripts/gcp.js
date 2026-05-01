// Voodoo Lab Ground Control Pro mapping script
// — controller-host QuickJS module.

var GCP = GCP || {};

GCP.STATUS_CC      = 0xB0;
GCP.STATUS_PC      = 0xC0;
GCP.STATUS_SYSEX   = 0xF0;
GCP.VOODOOLAB_MFR_ID = [0x00, 0x00, 0x32];

GCP.program_change = function (channel, program) {
    // GCP sends PC for the active bank (0-7) on channel 1. Combined
    // with active-bank setting (0-31), that's a 256-program library.
    var bank = (typeof engine !== 'undefined' && engine.getSetting)
        ? (engine.getSetting('gcp_active_bank') || 0) : 0;
    return { snapshot_id: bank * 8 + program };
};

GCP.handle_sysex = function (bytes) {
    // T2459-H4 / T2482-P1.5 cutover surface.
    //
    // Voodoo Lab SysEx framing: F0 00 00 32 <product-id> <command>
    //   <args...> F7
    // command 0x10 = memory dump request; 0x11 = memory dump response;
    // 0x12 = preset name string; 0x13 = field-map write.
    //
    // Until cutover lands the existing GCP service +
    // groundControlProApi handle inbound SysEx via the Python path.
    if (bytes.length < 7) return null;
    if (bytes[1] !== 0x00 || bytes[2] !== 0x00 || bytes[3] !== 0x32) return null;
    var command = bytes[5];
    return { command: command, length: bytes.length };
};
