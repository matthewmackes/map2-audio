#!/usr/bin/env python3
"""Verify the shipped Maschine MK1 profile catalog through the backend API."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.maschine.mk1_usb_transport import MaschineMK1UsbTransport
from app.services.maschine_lcd_service import MaschineLCDRenderService


def _render(client: httpx.Client, *, profile_id: str, context: str, focus_metric: str | None = None) -> dict:
    params = {"profile_id": profile_id, "context": context}
    if focus_metric:
        params["focus_metric"] = focus_metric
    response = client.get("/api/maschine/lcd/render", params=params)
    response.raise_for_status()
    payload = response.json()
    assert payload["render"]["profile_id"] == profile_id
    assert payload["render"]["left"]["framebuffer"]
    assert payload["render"]["right"]["framebuffer"]
    return payload


def _profile_plan(*, include_hidden: bool) -> list[dict[str, str]]:
    runtime = MaschineLCDRenderService()
    plan: list[dict[str, str]] = []
    for item in runtime.menu_items():
        if not include_hidden and (item.get("hidden_from_cycle") or item.get("admin_only")):
            continue
        profile_id = str(item.get("profile_id") or "")
        category = str(item.get("category") or "Control")
        if not profile_id:
            continue
        plan.append(
            {
                "profile_id": profile_id,
                "category": category,
                "context": "stats" if category == "Monitor" else "audio_grid",
            }
        )
    return plan


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-url", default="http://localhost:8080", help="MAP2 backend URL")
    parser.add_argument("--hardware", action="store_true", help="Write verified frames to the connected MK1")
    parser.add_argument("--include-hidden", action="store_true", help="Also verify hidden/admin-only profiles via direct render")
    parser.add_argument("--dwell-ms", type=int, default=1200, help="Hardware dwell time per profile")
    args = parser.parse_args()

    client = httpx.Client(base_url=args.backend_url.rstrip("/"), timeout=30.0)
    transport = MaschineMK1UsbTransport(allow_kernel_detach=True) if args.hardware else None
    plan = _profile_plan(include_hidden=args.include_hidden)

    try:
        print("# Maschine Profile Verification")
        print(f"- Planned profiles: {len(plan)}")
        payloads: list[dict] = []
        for entry in plan:
            payload = _render(
                client,
                profile_id=entry["profile_id"],
                context=entry["context"],
                focus_metric="audio.cpu_load" if entry["profile_id"] == "t16_monitor" else None,
            )
            payloads.append(payload)
            framebuffer_bytes = len(payload["render"]["left"]["framebuffer"]) // 2
            print(f"- {entry['profile_id']} [{entry['category']}] framebuffer bytes: {framebuffer_bytes}")

        t16_first = _render(client, profile_id="t16_monitor", context="stats", focus_metric="audio.cpu_load")
        t16_second = _render(client, profile_id="t16_monitor", context="stats", focus_metric="health.cpu_percent")
        changed = (
            t16_first["render"]["left"]["data"] != t16_second["render"]["left"]["data"]
            or t16_first["render"]["right"]["data"] != t16_second["render"]["right"]["data"]
        )
        payloads.extend((t16_first, t16_second))
        print(f"- t16_monitor reactive update changed framebuffer: {'YES' if changed else 'NO'}")

        if args.hardware and transport is not None:
            transport.open()
            transport.initialize_device()
            for payload in payloads:
                left = bytes.fromhex(payload["render"]["left"]["framebuffer"])
                right = bytes.fromhex(payload["render"]["right"]["framebuffer"])
                transport.write_display_frame(0, left)
                transport.write_display_frame(1, right)
                time.sleep(max(0.1, args.dwell_ms / 1000.0))
            print("- Hardware write path: PASS")
        else:
            print("- Hardware write path: SKIPPED (use --hardware on a connected MK1)")
    finally:
        client.close()
        if transport is not None:
            transport.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
