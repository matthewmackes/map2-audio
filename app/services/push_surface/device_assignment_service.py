"""Persist and resolve Push device role assignments."""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal

from app.utils.singleton import Singleton


PushDeviceRole = Literal[
    "push_drum_machine",
    "generic_push_surface",
    "midi_hub_generic_controller",
    "ignore_device",
]


_DEFAULT_ASSIGNMENTS_PATH = Path(
    os.environ.get("MAP2_PUSH_DEVICE_ASSIGNMENTS_PATH", Path.home() / ".map2" / "push_surface" / "device_assignments.json")
)


@dataclass(frozen=True)
class PushDeviceDescriptor:
    input_port_name: str
    output_port_name: str
    input_port_id: str | None = None
    output_port_id: str | None = None
    profile_id: str | None = None


@dataclass(frozen=True)
class PushDeviceAssignment:
    fingerprint: str
    role: PushDeviceRole
    input_port_name: str
    output_port_name: str
    input_port_id: str | None = None
    output_port_id: str | None = None
    profile_id: str | None = None
    disabled_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class PushDeviceAssignmentService(Singleton):
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _DEFAULT_ASSIGNMENTS_PATH
        self._assignments = self._load()

    @staticmethod
    def build_fingerprint(descriptor: PushDeviceDescriptor) -> str:
        raw = "|".join(
            [
                (descriptor.input_port_name or "").strip().lower(),
                (descriptor.output_port_name or "").strip().lower(),
                (descriptor.profile_id or "").strip().lower(),
            ]
        )
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]

    def _load(self) -> dict[str, PushDeviceAssignment]:
        if not self.path.exists():
            return {}
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        assignments: dict[str, PushDeviceAssignment] = {}
        for item in payload.get("assignments", []):
            try:
                assignment = PushDeviceAssignment(**item)
            except TypeError:
                continue
            assignments[assignment.fingerprint] = assignment
        return assignments

    def _persist(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"assignments": [assignment.to_dict() for assignment in self.list_assignments()]}
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        tmp.replace(self.path)

    def list_assignments(self) -> list[PushDeviceAssignment]:
        return sorted(self._assignments.values(), key=lambda item: (item.role, item.input_port_name, item.output_port_name))

    def assign_role(self, descriptor: PushDeviceDescriptor, role: PushDeviceRole) -> PushDeviceAssignment:
        fingerprint = self.build_fingerprint(descriptor)
        assignment = PushDeviceAssignment(
            fingerprint=fingerprint,
            role=role,
            input_port_name=descriptor.input_port_name,
            output_port_name=descriptor.output_port_name,
            input_port_id=descriptor.input_port_id,
            output_port_id=descriptor.output_port_id,
            profile_id=descriptor.profile_id,
            disabled_reason=None,
        )
        self._assignments[fingerprint] = assignment
        self._persist()
        return assignment

    def resolve_device(self, descriptor: PushDeviceDescriptor) -> dict[str, Any]:
        fingerprint = self.build_fingerprint(descriptor)
        assignment = self._assignments.get(fingerprint)
        if assignment is None:
            return {"fingerprint": fingerprint, "status": "unassigned", "assignment": None}
        collision = any(
            [
                assignment.input_port_id not in {None, "", descriptor.input_port_id},
                assignment.output_port_id not in {None, "", descriptor.output_port_id},
            ]
        )
        if collision:
            return {
                "fingerprint": fingerprint,
                "status": "collision",
                "assignment": {
                    **assignment.to_dict(),
                    "disabled_reason": "fingerprint_collision",
                },
            }
        return {"fingerprint": fingerprint, "status": "assigned", "assignment": assignment.to_dict()}


def get_push_device_assignment_service() -> PushDeviceAssignmentService:
    return PushDeviceAssignmentService.get_instance()


def reset_push_device_assignment_service() -> None:
    PushDeviceAssignmentService.reset_instance()
