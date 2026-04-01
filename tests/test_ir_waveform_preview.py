from pathlib import Path

import numpy as np
import soundfile as sf

from app.routes import ir


def test_build_ir_waveform_preview_returns_metadata_and_bins(tmp_path: Path) -> None:
    asset_path = tmp_path / "preview.wav"
    audio = np.array([0.0, 0.5, -0.25, 1.0, -0.75, 0.25], dtype=np.float32)
    sf.write(asset_path, audio, 48_000)

    preview = ir._build_ir_waveform_preview(str(asset_path), sample_count=4)

    assert preview["fileName"] == "preview.wav"
    assert preview["assetPath"] == str(asset_path)
    assert preview["sampleRate"] == 48_000
    assert preview["sampleCount"] == 6
    assert len(preview["points"]) == 32
    assert max(preview["points"]) > 0.99
