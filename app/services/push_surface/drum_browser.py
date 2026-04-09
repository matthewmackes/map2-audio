"""Push-facing browser adapter for MAP2 drum kits and pad sources."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from app.services.drum_kit_service import get_drum_kit_service


class PushDrumBrowserService:
    def __init__(self) -> None:
        self._kit_service = get_drum_kit_service
        self._favorite_item_ids: set[str] = set()
        self._recent_item_ids: list[str] = []
        self._last_browse_payload: dict[str, Any] = {}

    def _service(self):
        return self._kit_service()

    @staticmethod
    def _remember_recent(items: list[str], item_id: str, *, limit: int = 8) -> list[str]:
        next_items = [entry for entry in items if entry != item_id]
        next_items.insert(0, item_id)
        return next_items[:limit]

    @staticmethod
    def _kit_entry(summary: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(summary["kit_id"]),
            "kind": "kit",
            "name": str(summary.get("name") or summary["kit_id"]),
            "category": str(summary.get("category") or "uncategorized"),
            "source": str(summary.get("source") or "unknown"),
            "description": str(summary.get("description") or ""),
        }

    @staticmethod
    def _instrument_entry(kit: dict[str, Any], pad_index: int, instrument: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": f"{kit['kit_id']}::pad::{pad_index}",
            "kind": "instrument",
            "kit_id": str(kit["kit_id"]),
            "kit_name": str(kit.get("name") or kit["kit_id"]),
            "source_pad": int(pad_index),
            "name": str(instrument.get("name") or f"Pad {pad_index + 1}"),
            "default_note": int(instrument.get("default_note", 36)),
            "bus_assignment": int(instrument.get("bus_assignment", 0)),
            "sfz_path": str(instrument["sfz_path"]),
        }

    def browse(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = dict(payload or {})
        self._last_browse_payload = dict(body)
        action = str(body.get("action") or "").strip()
        favorite_id = str(body.get("favorite_id") or body.get("item_id") or "").strip()
        if action == "toggle_favorite" and favorite_id:
            if favorite_id in self._favorite_item_ids:
                self._favorite_item_ids.remove(favorite_id)
            else:
                self._favorite_item_ids.add(favorite_id)
        category = str(body.get("category") or "all").strip().lower()
        kit_id = str(body.get("kit_id") or "").strip()
        shortcut = str(body.get("shortcut") or "").strip().lower()

        kits = [self._kit_entry(item) for item in self._service().list_kits()]
        categories = ["all", *sorted({str(item["category"]).lower() for item in kits})]
        if category != "all":
            kits = [item for item in kits if str(item["category"]).lower() == category]
        if shortcut == "favorites":
            kits = [item for item in kits if item["id"] in self._favorite_item_ids]
        elif shortcut == "recent":
            order = {item_id: index for index, item_id in enumerate(self._recent_item_ids)}
            kits = [item for item in kits if item["id"] in order]
            kits.sort(key=lambda item: order[item["id"]])

        if kit_id:
            kit = self._service().get_kit(kit_id)
            items = [
                self._instrument_entry(kit, pad_index, instrument)
                for pad_index, instrument in enumerate(kit.get("instruments") or [])
            ]
            if shortcut == "favorites":
                items = [item for item in items if item["id"] in self._favorite_item_ids]
            elif shortcut == "recent":
                order = {item_id: index for index, item_id in enumerate(self._recent_item_ids)}
                items = [item for item in items if item["id"] in order]
                items.sort(key=lambda item: order[item["id"]])
            preview_index = max(0, min(int(body.get("cursor", 0) or 0), max(len(items) - 1, 0)))
            return {
                "scope": "kit",
                "kit": self._kit_entry(kit),
                "categories": categories,
                "items": items,
                "preview": items[preview_index] if items else None,
                "metadata": self.get_projection(),
            }

        preview_index = max(0, min(int(body.get("cursor", 0) or 0), max(len(kits) - 1, 0)))
        return {
            "scope": "kits",
            "categories": categories,
            "items": kits,
            "preview": kits[preview_index] if kits else None,
            "metadata": self.get_projection(),
        }

    def load(self, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = dict(payload or {})
        kit_id = str(body.get("kit_id") or "").strip()
        if not kit_id:
            raise ValueError("kit_id is required")

        if "source_pad" not in body:
            loaded = self._service().load_kit(kit_id)
            self._recent_item_ids = self._remember_recent(self._recent_item_ids, kit_id)
            return {
                "mode": "kit",
                "kit_id": kit_id,
                "loaded_pad_count": int(loaded.get("loaded_pad_count", 0)),
                "kit": loaded.get("kit"),
                "metadata": self.get_projection(),
            }

        target_pad = int(body.get("pad", -1))
        source_pad = int(body["source_pad"])
        if target_pad < 0 or target_pad >= 16:
            raise ValueError("pad must be between 0 and 15")
        if source_pad < 0 or source_pad >= 16:
            raise ValueError("source_pad must be between 0 and 15")

        source_kit = self._service().get_kit(kit_id)
        instruments = list(source_kit.get("instruments") or [])
        if source_pad >= len(instruments):
            raise ValueError(f"source_pad out of range for kit {kit_id}")
        instrument = dict(instruments[source_pad])

        active_kit = self._service().ensure_editable_active_kit()
        relative_sfz_path = self._copy_instrument_assets_to_active_kit(
            source_root=Path(source_kit["root_path"]),
            source_sfz_path=str(instrument["sfz_path"]),
            destination_root=Path(active_kit["root_path"]),
            target_pad=target_pad,
            source_kit_id=kit_id,
        )
        updated_kit = self._service().update_kit_instrument(
            active_kit["kit_id"],
            target_pad,
            {
                "name": instrument.get("name"),
                "sfz_path": relative_sfz_path,
                "default_note": instrument.get("default_note"),
                "bus_assignment": instrument.get("bus_assignment"),
                "default_volume": instrument.get("default_volume"),
                "default_pan": instrument.get("default_pan"),
                "default_tune": instrument.get("default_tune"),
            },
        )
        self._recent_item_ids = self._remember_recent(self._recent_item_ids, f"{kit_id}::pad::{source_pad}")
        return {
            "mode": "pad",
            "kit_id": kit_id,
            "source_pad": source_pad,
            "target_pad": target_pad,
            "active_kit_id": active_kit["kit_id"],
            "instrument_name": instrument.get("name"),
            "sfz_path": relative_sfz_path,
            "kit": updated_kit,
            "metadata": self.get_projection(),
        }

    def get_projection(self) -> dict[str, Any]:
        favorite_ids = sorted(self._favorite_item_ids)
        recent_ids = list(self._recent_item_ids)
        quick_shortcuts = [
            {"kind": "favorite", "item_id": item_id}
            for item_id in favorite_ids[:4]
        ] + [
            {"kind": "recent", "item_id": item_id}
            for item_id in recent_ids[:4]
        ]
        return {
            "favorites": favorite_ids,
            "recent": recent_ids,
            "quick_shortcuts": quick_shortcuts[:6],
            "last_browse_payload": dict(self._last_browse_payload),
        }

    def _copy_instrument_assets_to_active_kit(
        self,
        *,
        source_root: Path,
        source_sfz_path: str,
        destination_root: Path,
        target_pad: int,
        source_kit_id: str,
    ) -> str:
        source_sfz = (source_root / source_sfz_path).resolve()
        import_root = destination_root / "imports" / source_kit_id / f"pad_{target_pad + 1}"
        import_root.mkdir(parents=True, exist_ok=True)

        destination_sfz = import_root / source_sfz.name
        shutil.copy2(source_sfz, destination_sfz)

        for sample_path in self._extract_sfz_sample_paths(source_sfz):
            resolved_sample = (source_sfz.parent / sample_path).resolve()
            destination_sample = import_root / sample_path
            destination_sample.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(resolved_sample, destination_sample)

        return destination_sfz.relative_to(destination_root).as_posix()

    @staticmethod
    def _extract_sfz_sample_paths(sfz_path: Path) -> list[str]:
        sample_paths: list[str] = []
        for line in sfz_path.read_text().splitlines():
            stripped = line.strip()
            if stripped.startswith("sample="):
                sample_path = stripped.split("=", 1)[1].strip()
                if sample_path:
                    sample_paths.append(sample_path)
        return sample_paths


_push_drum_browser_service: PushDrumBrowserService | None = None


def get_push_drum_browser_service() -> PushDrumBrowserService:
    global _push_drum_browser_service
    if _push_drum_browser_service is None:
        _push_drum_browser_service = PushDrumBrowserService()
    return _push_drum_browser_service
