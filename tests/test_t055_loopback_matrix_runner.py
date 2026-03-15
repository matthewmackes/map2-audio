from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_t055_ua1000_loopback_matrix.py"


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IEXEC)


def test_t055_runner_blocks_when_ua1000_is_missing(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_executable(
        bin_dir / "jack_lsp",
        """#!/usr/bin/env bash
printf '%s\n' 'Jogg USB Audio Analog Stereo:playback_FL' 'Jogg USB Audio Mono:capture_MONO'
""",
    )
    measure_script = tmp_path / "fake_measure.py"
    _write_executable(
        measure_script,
        """#!/usr/bin/env python3
raise SystemExit(99)
""",
    )

    output_dir = tmp_path / "blocked"
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--output-dir",
            str(output_dir),
            "--measure-script",
            str(measure_script),
            "--stabilize-seconds",
            "0",
        ],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )

    assert proc.returncode == 2, proc.stderr
    summary = json.loads((output_dir / "t055-loopback-matrix-summary.json").read_text(encoding="utf-8"))
    assert summary["overall_status"] == "BLOCKED"
    assert summary["preflight"]["ua1000_port_count"] == 0
    assert summary["conditions"]["tuned"]["status"] == "BLOCKED"


def test_t055_runner_executes_full_matrix_and_restore(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_executable(
        bin_dir / "jack_lsp",
        """#!/usr/bin/env bash
printf '%s\n' \
  'EDIROL UA-1000 Pro:playback_AUX0' \
  'EDIROL UA-1000 Pro:capture_AUX0' \
  'EDIROL UA-1000 Pro:playback_AUX1' \
  'EDIROL UA-1000 Pro:capture_AUX1'
""",
    )

    hooks_log = tmp_path / "hooks.log"
    hook_script = tmp_path / "hook.sh"
    _write_executable(
        hook_script,
        f"""#!/usr/bin/env bash
echo "$1" >> {hooks_log}
if [[ "$1" == verify-* ]]; then
  echo "api.alsa.period-num=$2"
fi
""",
    )

    counter_path = tmp_path / "counter.json"
    counter_path.write_text('{"tuned": 0, "rollback": 0}', encoding="utf-8")
    measure_script = tmp_path / "fake_measure.py"
    _write_executable(
        measure_script,
        f"""#!/usr/bin/env python3
import json
import sys
from pathlib import Path

counter_path = Path({str(counter_path)!r})
state = json.loads(counter_path.read_text(encoding="utf-8"))
args = sys.argv[1:]
output_path = Path(args[args.index("--output") + 1])
label = "tuned" if "/tuned/" in str(output_path) else "rollback"
index = state[label]
state[label] += 1
counter_path.write_text(json.dumps(state), encoding="utf-8")

if label == "tuned":
    mean_values = [3.8, 3.7, 3.9]
    p95_values = [4.0, 3.9, 4.1]
else:
    mean_values = [5.2, 5.0, 5.1]
    p95_values = [5.4, 5.2, 5.3]

payload = {{
    "timestamp": "2026-03-14T00:00:00Z",
    "hardware": {{"interface": "UA-1000", "buffer_size": 64, "sample_rate": 48000, "cpu_cores": [2, 3]}},
    "rtl": {{
        "min_ms": mean_values[index] - 0.2,
        "mean_ms": mean_values[index],
        "p50_ms": mean_values[index],
        "p95_ms": p95_values[index],
        "p99_ms": p95_values[index] + 0.1,
        "max_ms": p95_values[index] + 0.2
    }},
    "jitter": {{"p95_ms": 0.2, "max_ms": 0.4}},
    "xruns": 0,
    "gate": "PASS",
    "notes": f"label={{label}}"
}}
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(payload), encoding="utf-8")
print(json.dumps({{"status": "ok", "label": label, "index": index}}))
""",
    )

    output_dir = tmp_path / "pass"
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--output-dir",
            str(output_dir),
            "--measure-script",
            str(measure_script),
            "--stabilize-seconds",
            "0",
            "--tuned-setup-cmd",
            f"{hook_script} setup-tuned 2",
            "--tuned-verify-cmd",
            f"{hook_script} verify-tuned 2",
            "--rollback-setup-cmd",
            f"{hook_script} setup-rollback 3",
            "--rollback-verify-cmd",
            f"{hook_script} verify-rollback 3",
            "--restore-cmd",
            f"{hook_script} restore 2",
        ],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )

    assert proc.returncode == 0, proc.stderr
    summary = json.loads((output_dir / "t055-loopback-matrix-summary.json").read_text(encoding="utf-8"))
    assert summary["overall_status"] == "PASS"
    assert summary["conditions"]["tuned"]["trial_count_measured"] == 3
    assert summary["conditions"]["rollback"]["trial_count_measured"] == 3
    assert summary["comparison"]["status"] == "KEEP_TUNED"
    assert summary["restore"]["status"] == "PASS"
    assert "setup-tuned" in hooks_log.read_text(encoding="utf-8")
    assert "restore" in hooks_log.read_text(encoding="utf-8")
    markdown = (output_dir / "T055_UA1000_LOOPBACK_MATRIX_SUMMARY.md").read_text(encoding="utf-8")
    assert "Conclusion: Pass:" in markdown
