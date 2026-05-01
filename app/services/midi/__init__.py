"""MIDI Services — first-class platform service offering.

See `docs/architecture/MIDI_SERVICES.md` for the canonical design.

Layout (built incrementally across T2482 phases):

    app/services/midi/
    ├── __init__.py                     (this file)
    ├── models.py                       (T2482-P2.1: MidiBinding ORM)
    ├── schemas.py                      (T2482-P2.1: Pydantic shapes)
    ├── authority.py                    (T2482-P2.2: MidiBindingAuthority)
    ├── projections/
    │   ├── __init__.py
    │   ├── snapshot.py                 (T2482-P2.3)
    │   ├── brain.py                    (T2482-P2.4)
    │   ├── plugin_param.py             (T2482-P2.7)
    │   ├── device_pack.py              (T2482-P2.5)
    │   ├── transport.py                (T2482-P2.6)
    │   ├── tesira_ttp.py               (T2482-P2.6)
    │   └── gpio.py                     (T2482-P2.6)
    ├── migrations/
    │   └── 2026_05_unify_midi_bindings.py  (T2482-P2.3 onwards)
    └── routes.py                       (T2482-P3.x consolidated /api/midi/*)
"""

from app.services.midi.authority import MidiBindingAuthority, MidiBindingNotFound
from app.services.midi.models import MidiBinding
from app.services.midi.schemas import (
    BindingConsumerType,
    BindingScope,
    BindingSourceType,
    BindingTargetType,
    MidiBindingCreate,
    MidiBindingRead,
    MidiBindingUpdate,
)

__all__ = [
    "MidiBinding",
    "MidiBindingAuthority",
    "MidiBindingNotFound",
    "BindingConsumerType",
    "BindingScope",
    "BindingSourceType",
    "BindingTargetType",
    "MidiBindingCreate",
    "MidiBindingRead",
    "MidiBindingUpdate",
]
