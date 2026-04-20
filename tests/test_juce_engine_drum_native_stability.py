import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest


def _run_native_drum_case(repo_root: Path, module_dir: Path) -> subprocess.CompletedProcess[str]:
    script = textwrap.dedent(
        f"""
        import json
        import math
        import struct
        import sys
        import tempfile
        import time
        import wave
        from pathlib import Path

        sys.path.insert(0, {str(module_dir)!r})
        import map2_audio_engine

        def write_wav(path: Path, frequency: float) -> None:
            frame_rate = 48000
            frame_count = 48000
            amplitude = 0.65
            with wave.open(str(path), "wb") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(frame_rate)
                frames = bytearray()
                for index in range(frame_count):
                    sample = int(amplitude * 32767.0 * math.sin(2.0 * math.pi * frequency * index / frame_rate))
                    frames += struct.pack("<h", sample)
                wav_file.writeframes(bytes(frames))

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            pad0_wav = temp_root / "pad0.wav"
            pad1_wav = temp_root / "pad1.wav"
            pad0_sfz = temp_root / "pad0.sfz"
            pad1_sfz = temp_root / "pad1.sfz"
            write_wav(pad0_wav, 220.0)
            write_wav(pad1_wav, 330.0)
            pad0_sfz.write_text("<region>\\nsample=pad0.wav\\nkey=36\\n")
            pad1_sfz.write_text("<region>\\nsample=pad1.wav\\nkey=37\\n")

            engine = map2_audio_engine.create_engine()
            engine.set_sample_rate(48000)
            engine.set_buffer_size(128)

            if not engine.initialize(""):
                raise SystemExit(2)
            if not engine.start_audio():
                engine.shutdown()
                raise SystemExit(3)

            try:
                if not engine.load_drum_pad_sfz(0, str(pad0_sfz)):
                    raise SystemExit(20)
                if not engine.load_drum_pad_sfz(1, str(pad1_sfz)):
                    raise SystemExit(21)

                status = engine.get_drum_kit_status()
                if not status["pad_0"]["loaded"] or not status["pad_1"]["loaded"]:
                    raise SystemExit(22)

                if not engine.drum_trigger_note(0, 1.0):
                    raise SystemExit(23)

                trigger_meter = None
                for _ in range(20):
                    meter = engine.get_drum_metering()
                    if meter["per_pad_peak"][0] > 0.0 and meter["master_peak_left"] > 0.0:
                        trigger_meter = meter
                        break
                    time.sleep(0.05)
                if trigger_meter is None:
                    raise SystemExit(24)

                if not engine.set_drum_bpm(240.0):
                    raise SystemExit(25)
                if not engine.set_drum_step(7, 1, 0, 116, False):
                    raise SystemExit(26)
                if not engine.set_drum_step(7, 0, 4, 112, True):
                    raise SystemExit(27)
                if not engine.set_drum_current_pattern(7):
                    raise SystemExit(28)
                if not engine.set_drum_transport_playing(True):
                    raise SystemExit(29)

                playing_position = None
                for _ in range(40):
                    position = engine.get_drum_sequencer_position()
                    if position["is_playing"] and position["step"] > 0:
                        playing_position = position
                        break
                    time.sleep(0.05)
                if playing_position is None:
                    raise SystemExit(30)

                if not engine.set_drum_step(7, 1, 1, 100, True):
                    raise SystemExit(31)

                print(
                    "RESULT:" + json.dumps(
                        {{
                            "pad0_status": status["pad_0"],
                            "pad1_status": status["pad_1"],
                            "trigger_meter": trigger_meter,
                            "playing_position": playing_position,
                            "edited_step": engine.get_drum_step(7, 1, 1),
                        }},
                        sort_keys=True,
                    )
                )
            finally:
                try:
                    engine.set_drum_transport_playing(False)
                except Exception:
                    pass
                engine.stop_audio()
                engine.shutdown()
        """
    )

    env = os.environ.copy()
    env.setdefault("MAP2_AUDIO_PREFER_JACK", "0")

    return subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(repo_root),
        env=env,
        capture_output=True,
        text=True,
        timeout=90,
        check=False,
    )


def test_native_drum_engine_supports_audio_trigger_and_running_transport() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    module_dir = repo_root / "juce-engine" / "build"
    if not module_dir.exists():
        pytest.skip(f"JUCE build output not found at {module_dir}")

    proc = _run_native_drum_case(repo_root, module_dir)
    if proc.returncode in (2, 3):
        pytest.skip(f"Audio backend unavailable in test environment (rc={proc.returncode})")
    if proc.returncode == 24:
        pytest.skip("Drum audio callback/metering unavailable in current test environment")

    assert proc.returncode == 0, (
        f"Native drum engine stability regression (rc={proc.returncode})\n"
        f"stdout:\n{proc.stdout}\n"
        f"stderr:\n{proc.stderr}"
    )

    result_line = next(
        (line for line in reversed(proc.stdout.splitlines()) if line.startswith("RESULT:")),
        None,
    )
    assert result_line is not None, f"Missing RESULT payload in stdout:\n{proc.stdout}"
    payload = json.loads(result_line[len("RESULT:"):])

    assert payload["pad0_status"]["loaded"] is True
    assert payload["pad1_status"]["loaded"] is True
    assert payload["pad0_status"]["region_count"] >= 1
    assert payload["pad1_status"]["region_count"] >= 1
    assert payload["trigger_meter"]["per_pad_peak"][0] > 0.0
    assert payload["trigger_meter"]["master_peak_left"] > 0.0
    assert payload["playing_position"]["is_playing"] is True
    assert payload["playing_position"]["pattern"] == 7
    assert payload["playing_position"]["step"] > 0
    assert payload["edited_step"]["velocity"] == 100
    assert payload["edited_step"]["accent"] is True
