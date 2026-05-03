"""Sequencer action registry — T2461-A4.

A flat namespace of operator-facing actions exposed by Sequencer
that downstream surfaces (the MIDI Assignments wizard target step, the
controller-host fast-path, the script bridge) can bind to.

Action ids use dotted notation matching the broader engine target
namespace (`audio.chain.1.volume`, etc.) so a "Sequencer action" target is
indistinguishable from any other binding target at the controller-host
level. The wizard's StepTarget reads this registry to populate a tree:

  brain.transport.play
  brain.transport.pause
  brain.transport.stop
  brain.section.<id>            (jump to section)
  brain.slot.<n>.mute_toggle    (n in 0..15)

The registry is read-only. Mutation lives in the existing per-section
endpoints (e.g. `POST /api/engine/sequencer/transport`); a binding fires
the action by routing through those endpoints. The dispatcher half
that *executes* a Sequencer action lives in T2461-A4-dispatch (queued
follow-up); for now the registry is the contract surface every Brain-
related binding negotiates against.

Worklist: T2461-A4.
"""

from __future__ import annotations

import dataclasses
from typing import Literal

ActionKind = Literal["transport", "section", "slot", "layer"]


@dataclasses.dataclass(frozen=True)
class SequencerActionDescriptor:
    """One operator-facing Sequencer action.

    Surface fields mirror the wizard target tree shape so the GUI can
    render a Carbon Tree with no further translation:

      - ``id``: dotted target string the binding writes (e.g.
        ``brain.transport.play``).
      - ``label``: human-readable label for the wizard.
      - ``kind``: rough category for tree grouping.
      - ``value_type``: ``"trigger"`` | ``"toggle"`` | ``"continuous"``.
        The wizard uses this to default the calibrate step's behavior.
      - ``description``: one-line context for the operator.
    """

    id: str
    label: str
    kind: ActionKind
    value_type: Literal["trigger", "toggle", "continuous"]
    description: str

    def to_dict(self) -> dict[str, object]:
        return dataclasses.asdict(self)


# ---------------------------------------------------------------------------
# Built-in catalogue
# ---------------------------------------------------------------------------

_TRANSPORT_ACTIONS: tuple[SequencerActionDescriptor, ...] = (
    SequencerActionDescriptor(
        id="brain.transport.play", label="Play", kind="transport",
        value_type="trigger",
        description="Start Sequencer transport.",
    ),
    SequencerActionDescriptor(
        id="brain.transport.pause", label="Pause", kind="transport",
        value_type="trigger",
        description="Pause Sequencer transport without resetting position.",
    ),
    SequencerActionDescriptor(
        id="brain.transport.stop", label="Stop", kind="transport",
        value_type="trigger",
        description="Stop Sequencer transport and reset position.",
    ),
    SequencerActionDescriptor(
        id="brain.transport.toggle", label="Play / Pause toggle",
        kind="transport", value_type="toggle",
        description="Toggle play/pause from a single CC or note.",
    ),
)

# Each Sequencer section is a section-jump action. Mirrors the live
# `SequencerStateModel.active_section` Literal so adding a section here
# without adding it there (or vice versa) shows up at validation time.
_BRAIN_SECTIONS: tuple[str, ...] = (
    "performance",
    "console",
    "step",
    "split",
    "perform",
    "layers",
    "sequence",
    "routing",
    "inputs",
    "library",
    "session_media",
    "practice_coach",
    "diagnostics",
)


def _section_actions() -> tuple[SequencerActionDescriptor, ...]:
    return tuple(
        SequencerActionDescriptor(
            id=f"brain.section.{section}",
            label=f"Jump to {section.replace('_', ' ').title()}",
            kind="section",
            value_type="trigger",
            description=f"Activate Performance Sequencer '{section}' section.",
        )
        for section in _BRAIN_SECTIONS
    )


def _slot_actions(slot_count: int = 16) -> tuple[SequencerActionDescriptor, ...]:
    """One mute-toggle action per slot, indexed 0..N-1."""
    return tuple(
        SequencerActionDescriptor(
            id=f"brain.slot.{i}.mute_toggle",
            label=f"Slot {i + 1} mute toggle",
            kind="slot",
            value_type="toggle",
            description=f"Toggle the mute state of Sequencer slot {i + 1}.",
        )
        for i in range(slot_count)
    )


def list_actions(slot_count: int = 16) -> tuple[SequencerActionDescriptor, ...]:
    """Return the full ordered action catalogue.

    Tree order: transport → sections → slots. Stable so the wizard's
    target tree renders consistently across reloads.
    """
    return _TRANSPORT_ACTIONS + _section_actions() + _slot_actions(slot_count)


def find_action(action_id: str, slot_count: int = 16) -> SequencerActionDescriptor | None:
    """Lookup a single action by id; ``None`` if the id is unknown."""
    for descriptor in list_actions(slot_count):
        if descriptor.id == action_id:
            return descriptor
    return None
