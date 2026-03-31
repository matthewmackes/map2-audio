"""Linux-first helpers for Push protocol capture and replay."""

from __future__ import annotations

import argparse
import re
import subprocess
import time
from pathlib import Path

from app.services.push_surface.protocol.replay import CaptureMessageRecord, save_capture


def list_alsa_ports() -> dict[str, str]:
    """Return best-effort ALSA port listings from standard tools."""

    results: dict[str, str] = {}
    for label, command in {
        "aconnect": ["aconnect", "-lio"],
        "aseqdump": ["aseqdump", "-l"],
    }.items():
        try:
            completed = subprocess.run(command, capture_output=True, text=True, check=False, timeout=5)
        except Exception as exc:
            results[label] = f"unavailable: {exc}"
            continue
        results[label] = completed.stdout.strip() or completed.stderr.strip()
    return results


def annotate_message(data: bytes) -> str | None:
    """Return a lightweight annotation for a raw MIDI payload."""

    if not data:
        return "empty"
    if data[0] == 0xF0:
        return "likely_sysex"
    status = data[0] & 0xF0
    if status == 0x90:
        return "note_on"
    if status == 0x80:
        return "note_off"
    if status == 0xB0:
        return "control_change"
    if status == 0xE0:
        return "pitch_bend"
    return "unknown"


def parse_aseqdump_output(text: str, *, port: str) -> list[CaptureMessageRecord]:
    """Parse `aseqdump` output into structured records."""

    records: list[CaptureMessageRecord] = []
    for line in text.splitlines():
        match = re.search(r"(\d+:\d+)\s+(.+)", line.strip())
        if match is None:
            continue
        payload = match.group(2)
        byte_values = [item for item in payload.split() if re.fullmatch(r"[0-9A-Fa-f]{2}", item)]
        if not byte_values:
            continue
        data = bytes(int(item, 16) for item in byte_values)
        records.append(
            CaptureMessageRecord(
                timestamp_ns=time.time_ns(),
                direction="in",
                port=port,
                data_hex=data.hex(" "),
                annotation=annotate_message(data),
            )
        )
    return records


def replay_amidi(port: str, data: bytes) -> subprocess.CompletedProcess[str]:
    """Replay one payload to an ALSA raw MIDI port with `amidi`."""

    hex_payload = data.hex(" ")
    return subprocess.run(
        ["amidi", "-p", port, "-S", hex_payload],
        capture_output=True,
        text=True,
        check=False,
        timeout=5,
    )


def main(argv: list[str] | None = None) -> int:
    """Small CLI entrypoint for manual protocol work."""

    parser = argparse.ArgumentParser(description="MAP2 Push protocol capture helpers")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list-ports", help="List ALSA MIDI ports via aconnect/aseqdump")

    parse_dump = subparsers.add_parser("parse-aseqdump", help="Convert saved aseqdump text into JSONL capture")
    parse_dump.add_argument("input", type=Path)
    parse_dump.add_argument("output", type=Path)
    parse_dump.add_argument("--port", default="aseqdump")

    args = parser.parse_args(argv)
    if args.command == "list-ports":
        for key, value in list_alsa_ports().items():
            print(f"[{key}]")
            print(value)
        return 0
    if args.command == "parse-aseqdump":
        records = parse_aseqdump_output(args.input.read_text(encoding="utf-8"), port=args.port)
        save_capture(args.output, records)
        print(f"wrote {len(records)} records to {args.output}")
        return 0
    return 1


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    raise SystemExit(main())
