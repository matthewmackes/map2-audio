"""Unit tests for app.services.maschine.mk1_protocol.

Tests the pure wire-format encoder/decoder — no USB I/O, no hardware needed.
"""
from __future__ import annotations

from app.services.maschine.mk1_protocol import (
    DISPLAY_FRAMEBUFFER_SIZE,
    DISPLAY_HEIGHT,
    DISPLAY_PIXEL_MAX,
    DISPLAY_WIDTH,
    LED_DATA_SIZE,
    LED_GROUP_SIZE,
    LED_PAD_INDEX,
    N_BUTTONS,
    N_ENCODERS,
    PAD_COUNT,
    PAD_DATA_SIZE,
    PAD_THRESHOLD,
    Button,
    ButtonChange,
    EncoderDelta,
    FrameBuffer,
    Led,
    PadEvent,
    build_display_frame_packets,
    build_display_init_packets,
    build_led_packets,
    decode_button_report,
    decode_encoder_report,
    decode_pad_report,
    is_shift_held,
)


# ---------------------------------------------------------------------------
# LED packets
# ---------------------------------------------------------------------------


class TestBuildLedPackets:
    def test_returns_two_33_byte_packets(self) -> None:
        g0, g1 = build_led_packets([0] * LED_DATA_SIZE)
        assert len(g0) == 2 + LED_GROUP_SIZE  # 33
        assert len(g1) == 2 + LED_GROUP_SIZE

    def test_headers_are_correct(self) -> None:
        g0, g1 = build_led_packets([0] * LED_DATA_SIZE)
        assert g0[0] == 0x0C
        assert g0[1] == 0x00
        assert g1[0] == 0x0C
        assert g1[1] == 0x1E

    def test_data_is_split_at_slot_31(self) -> None:
        state = list(range(LED_DATA_SIZE))
        g0, g1 = build_led_packets(state)
        assert list(g0[2:]) == list(range(0, 31))
        assert list(g1[2:]) == list(range(31, 62))

    def test_clamps_out_of_range_values(self) -> None:
        state = [-10, 300] + [0] * (LED_DATA_SIZE - 2)
        g0, _ = build_led_packets(state)
        assert g0[2] == 0    # clamped from -10
        assert g0[3] == 255  # clamped from 300

    def test_pads_shorter_than_62_are_zero_padded(self) -> None:
        g0, g1 = build_led_packets([255, 128])
        assert g0[2] == 255
        assert g0[3] == 128
        assert g0[4] == 0
        assert all(b == 0 for b in g1[2:])

    def test_all_16_pad_indices_are_unique(self) -> None:
        assert len(set(LED_PAD_INDEX)) == 16
        assert all(0 <= idx < LED_DATA_SIZE for idx in LED_PAD_INDEX)


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------


class TestDisplayInitPackets:
    def test_returns_22_init_entries_per_display(self) -> None:
        for d in (0, 1):
            packets = build_display_init_packets(d)
            assert len(packets) == 22
            for pkt, delay in packets:
                assert isinstance(pkt, bytes)
                assert isinstance(delay, int)
                assert delay >= 0

    def test_display_index_sets_d_byte(self) -> None:
        pkts0 = build_display_init_packets(0)
        pkts1 = build_display_init_packets(1)
        assert pkts0[0][0][0] == 0  # d=0
        assert pkts1[0][0][0] == 2  # d=2 (1 << 1)


class TestDisplayFramePackets:
    def test_total_data_sums_to_framebuffer_size(self) -> None:
        fb = b"\xff" * DISPLAY_FRAMEBUFFER_SIZE
        packets = build_display_frame_packets(0, fb)
        # First 2 are column-setup packets, rest are data
        data_packets = packets[2:]
        total = sum(len(p) - 4 for p in data_packets[:1])  # first has 4-byte header
        total += sum(len(p) - 3 for p in data_packets[1:])  # rest have 3-byte headers
        assert total == DISPLAY_FRAMEBUFFER_SIZE

    def test_rejects_wrong_size_framebuffer(self) -> None:
        try:
            build_display_frame_packets(0, b"\x00" * 100)
            assert False, "should have raised ValueError"
        except ValueError:
            pass

    def test_chunk_count_is_24(self) -> None:
        """2 column setup + 22 data chunks = 24 total packets."""
        fb = b"\xff" * DISPLAY_FRAMEBUFFER_SIZE
        packets = build_display_frame_packets(0, fb)
        assert len(packets) == 24


class TestFrameBuffer:
    def test_initial_state_is_black(self) -> None:
        fb = FrameBuffer()
        assert fb.buffer() == b"\xff" * DISPLAY_FRAMEBUFFER_SIZE

    def test_fill_white_is_all_zero(self) -> None:
        fb = FrameBuffer()
        fb.fill_white()
        assert fb.buffer() == bytes(DISPLAY_FRAMEBUFFER_SIZE)

    def test_set_pixel_and_get_pixel_roundtrip(self) -> None:
        fb = FrameBuffer()
        for brightness in (0, 1, 15, 31):
            fb.set_pixel(10, 10, brightness)
            assert fb.get_pixel(10, 10) == brightness

    def test_set_pixel_all_three_phases(self) -> None:
        fb = FrameBuffer()
        # Phase 0 (x%3==0), Phase 1 (x%3==1), Phase 2 (x%3==2)
        for x in (0, 1, 2):
            fb.set_pixel(x, 0, DISPLAY_PIXEL_MAX)
            assert fb.get_pixel(x, 0) == DISPLAY_PIXEL_MAX

    def test_set_pixel_ignores_out_of_bounds(self) -> None:
        fb = FrameBuffer()
        fb.set_pixel(-1, 0, 31)   # no crash
        fb.set_pixel(0, -1, 31)
        fb.set_pixel(DISPLAY_WIDTH, 0, 31)
        fb.set_pixel(0, DISPLAY_HEIGHT, 31)

    def test_clear_with_uniform_brightness(self) -> None:
        fb = FrameBuffer()
        fb.clear(15)
        # Spot-check a few pixels
        assert fb.get_pixel(0, 0) == 15
        assert fb.get_pixel(100, 32) == 15
        assert fb.get_pixel(254, 63) == 15

    def test_dimensions_are_correct(self) -> None:
        assert DISPLAY_WIDTH == 255
        assert DISPLAY_HEIGHT == 64
        assert DISPLAY_FRAMEBUFFER_SIZE == 10_880


# ---------------------------------------------------------------------------
# Pad decoding
# ---------------------------------------------------------------------------


class TestDecodePadReport:
    @staticmethod
    def _make_pad_report(pad: int, pressure: int) -> bytearray:
        """Build a minimal 64-byte pad report with one active pad."""
        raw = bytearray(PAD_DATA_SIZE)
        h = ((pad & 0x0F) << 4) | ((pressure >> 8) & 0x0F)
        l = pressure & 0xFF
        raw[1] = h
        raw[2] = l
        return raw

    def test_above_threshold_emits_press(self) -> None:
        raw = self._make_pad_report(pad=5, pressure=PAD_THRESHOLD + 1)
        events = decode_pad_report(bytes(raw))
        assert any(e.pad == 5 and e.pressed and e.pressure == PAD_THRESHOLD + 1 for e in events)

    def test_below_threshold_emits_release_after_press(self) -> None:
        prev = [False] * PAD_COUNT
        raw_press = self._make_pad_report(pad=3, pressure=1000)
        decode_pad_report(bytes(raw_press), prev)
        assert prev[3] is True

        raw_release = self._make_pad_report(pad=3, pressure=100)
        events = decode_pad_report(bytes(raw_release), prev)
        assert any(e.pad == 3 and not e.pressed for e in events)
        assert prev[3] is False

    def test_max_pressure_is_4095(self) -> None:
        raw = self._make_pad_report(pad=0, pressure=0x0FFF)
        events = decode_pad_report(bytes(raw))
        assert any(e.pressure == 4095 for e in events)

    def test_short_report_returns_empty(self) -> None:
        assert decode_pad_report(b"\x00" * 10) == []


# ---------------------------------------------------------------------------
# Button decoding
# ---------------------------------------------------------------------------


class TestDecodeButtonReport:
    @staticmethod
    def _make_button_report(button: int, pressed: bool) -> bytearray:
        """Build a minimal 7-byte button report with the gate bit set."""
        raw = bytearray(8)  # tag + 7 data bytes
        raw[0] = 0x04  # tag
        raw[6] |= 0x40  # gate bit
        byte_idx = 1 + (button >> 3)
        if pressed and byte_idx < len(raw):
            raw[byte_idx] |= (1 << (button & 7))
        return raw

    def test_detects_press(self) -> None:
        prev = [False] * N_BUTTONS
        raw = self._make_button_report(int(Button.Play), True)
        changes = decode_button_report(bytes(raw), prev)
        assert any(c.button == int(Button.Play) and c.pressed for c in changes)

    def test_detects_release(self) -> None:
        prev = [False] * N_BUTTONS
        prev[int(Button.Mute)] = True
        raw = self._make_button_report(int(Button.Mute), False)
        changes = decode_button_report(bytes(raw), prev)
        assert any(c.button == int(Button.Mute) and not c.pressed for c in changes)

    def test_gate_bit_required(self) -> None:
        prev = [False] * N_BUTTONS
        raw = bytearray(8)
        raw[0] = 0x04
        # gate bit NOT set
        raw[1] = 0xFF
        changes = decode_button_report(bytes(raw), prev)
        assert changes == []

    def test_shift_is_skipped_in_changes(self) -> None:
        prev = [False] * N_BUTTONS
        raw = self._make_button_report(int(Button.Shift), True)
        changes = decode_button_report(bytes(raw), prev)
        assert not any(c.button == int(Button.Shift) for c in changes)


class TestIsShiftHeld:
    def test_shift_detected(self) -> None:
        raw = bytearray(8)
        raw[0] = 0x04
        b = int(Button.Shift)
        raw[1 + (b >> 3)] |= (1 << (b & 7))
        assert is_shift_held(bytes(raw)) is True

    def test_no_shift(self) -> None:
        raw = bytearray(8)
        raw[0] = 0x04
        assert is_shift_held(bytes(raw)) is False


# ---------------------------------------------------------------------------
# Encoder decoding
# ---------------------------------------------------------------------------


class TestDecodeEncoderReport:
    @staticmethod
    def _make_encoder_report(values: list[int]) -> bytearray:
        """Build a 0x02-tagged report with up to 11 encoder values."""
        raw = bytearray(1 + 2 * N_ENCODERS)
        raw[0] = 0x02
        for i, v in enumerate(values[:N_ENCODERS]):
            raw[1 + 2 * i] = (v >> 8) & 0xFF
            raw[2 + 2 * i] = v & 0xFF
        return raw

    def test_first_observation_initializes_without_events(self) -> None:
        prev = [0] * N_ENCODERS
        raw = self._make_encoder_report([100] * N_ENCODERS)
        deltas, initialized = decode_encoder_report(bytes(raw), prev, False)
        assert deltas == []
        assert initialized is True

    def test_subsequent_change_emits_delta(self) -> None:
        prev = [0] * N_ENCODERS
        raw1 = self._make_encoder_report([0] * N_ENCODERS)
        decode_encoder_report(bytes(raw1), prev, False)

        raw2 = self._make_encoder_report([1] * N_ENCODERS)
        deltas, _ = decode_encoder_report(bytes(raw2), prev, True)
        assert len(deltas) > 0

    def test_short_report_returns_empty(self) -> None:
        prev = [0] * N_ENCODERS
        deltas, init = decode_encoder_report(b"\x02\x00", prev, True)
        assert deltas == []


# ---------------------------------------------------------------------------
# Led enum coverage
# ---------------------------------------------------------------------------


class TestLedEnum:
    def test_62_members(self) -> None:
        assert len(Led) == LED_DATA_SIZE

    def test_pad_indices_reference_valid_led_members(self) -> None:
        for idx in LED_PAD_INDEX:
            assert Led(idx) is not None

    def test_display_backlight_exists(self) -> None:
        assert Led.DisplayBacklight == 58
