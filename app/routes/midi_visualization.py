"""MIDI Connections Visualization — topology HTTP route.

T2500-MV-A3.

Backs the new ``/midi/connections/visualization`` page. The frontend
fetches this once on mount, then opens ``/ws/midi/visualization`` for
live activity. Topology refetch happens on focus or manual refresh —
the page does not poll this endpoint.

Returns the static graph (devices + mappings + targets + edges) as
materialised by :func:`app.services.midi_visualization_topology.build_topology`.
Defensive: a degraded subsystem (host not running, dispatcher not
initialised) is allowed to return an empty topology rather than 500.
The frontend handles the empty case as "nothing connected yet".
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.services.midi_visualization_topology import build_topology


router = APIRouter(
    prefix="/api/midi/visualization",
    tags=["MIDI Visualization"],
)


@router.get("/graph")
def get_graph() -> dict[str, list[dict[str, Any]]]:
    """Return the current MIDI topology graph as ``{nodes, edges}``.

    See :func:`build_topology` for the node/edge schema. The frontend
    feeds this directly into the dagre layout adapter and never
    transforms node ids.
    """
    return build_topology()
