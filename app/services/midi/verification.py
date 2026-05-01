"""T2482-P2.9: cross-consumer migration verification suite.

Runs round-trip checks across every consumer projection in one place
so a single test invocation answers "is the canonical authority
faithfully serving every consumer."

Each verifier is a pure-async function that takes an already-migrated
authority and returns a VerificationResult dict. The suite caller
composes them as needed (per-consumer gating in P2.9 part 2; full
end-to-end at the Phase 2 close gate).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.projections.snapshot import (
    list_snapshot_midi_map_entries,
)
from app.services.midi.projections.brain import list_brain_device_bindings
from app.services.midi.projections.plugin_param import (
    list_plugin_param_bindings_for_param,
    list_plugin_param_bindings_for_snapshot,
)
from app.services.midi.projections.transport import list_transport_bindings
from app.services.midi.projections.gpio import list_gpio_bindings
from app.services.midi.projections.tesira_ttp import list_tesira_ttp_bindings
from app.services.midi.projections.device_pack import list_all_device_pack_defaults


@dataclass
class VerificationResult:
    """Result of one verifier invocation."""

    name: str
    ok: bool
    detail: str = ""
    counts: dict[str, int] = field(default_factory=dict)


@dataclass
class SuiteResult:
    """Aggregated result of a full verification run."""

    results: list[VerificationResult] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(r.ok for r in self.results)

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.ok)

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if not r.ok)

    def summary(self) -> str:
        return (
            f"{self.passed} passed, {self.failed} failed "
            f"({len(self.results)} total)"
        )


# ---------- Per-consumer verifiers ----------


async def verify_snapshot_consumer(
    authority: MidiBindingAuthority,
    *,
    snapshot_id: int,
    expected_actions: Optional[list[str]] = None,
) -> VerificationResult:
    """Verify a snapshot's bindings round-trip cleanly through the
    canonical store. If `expected_actions` is provided, asserts the
    action set matches.

    Returns ok=True when:
      - read returns at least one entry
      - every entry has a non-None action key
      - expected_actions (if provided) matches the read action set
    """
    entries = await list_snapshot_midi_map_entries(authority, snapshot_id)
    counts = {"entries": len(entries)}

    if not entries:
        return VerificationResult(
            name=f"snapshot[{snapshot_id}]",
            ok=False,
            detail=f"no entries for snapshot {snapshot_id}",
            counts=counts,
        )

    actions = [e.get("action") for e in entries]
    missing_action = [i for i, a in enumerate(actions) if a is None]
    if missing_action:
        return VerificationResult(
            name=f"snapshot[{snapshot_id}]",
            ok=False,
            detail=f"entries missing action: indices {missing_action}",
            counts=counts,
        )

    if expected_actions is not None:
        if sorted(actions) != sorted(expected_actions):
            return VerificationResult(
                name=f"snapshot[{snapshot_id}]",
                ok=False,
                detail=(
                    f"action set mismatch: got {sorted(actions)} "
                    f"expected {sorted(expected_actions)}"
                ),
                counts=counts,
            )

    return VerificationResult(
        name=f"snapshot[{snapshot_id}]", ok=True, detail="round-trip ok", counts=counts
    )


async def verify_brain_consumer(
    authority: MidiBindingAuthority,
    *,
    device_id: str,
    expected_consumer_ids: Optional[list[str]] = None,
) -> VerificationResult:
    """Verify Brain device bindings round-trip cleanly."""
    bindings = await list_brain_device_bindings(authority, device_id)
    counts = {"bindings": len(bindings)}
    if not bindings:
        return VerificationResult(
            name=f"brain[{device_id}]",
            ok=False,
            detail=f"no bindings for device {device_id}",
            counts=counts,
        )
    consumer_ids = [b["consumer_id"] for b in bindings]
    if expected_consumer_ids is not None:
        if sorted(consumer_ids) != sorted(expected_consumer_ids):
            return VerificationResult(
                name=f"brain[{device_id}]",
                ok=False,
                detail=(
                    f"consumer_id set mismatch: got {sorted(consumer_ids)} "
                    f"expected {sorted(expected_consumer_ids)}"
                ),
                counts=counts,
            )
    return VerificationResult(
        name=f"brain[{device_id}]", ok=True, detail="ok", counts=counts
    )


async def verify_plugin_param_consumer(
    authority: MidiBindingAuthority,
    *,
    snapshot_id: Optional[int] = None,
    chain_id: Optional[int] = None,
    plugin_uri: Optional[str] = None,
    param_index: Optional[int] = None,
    expected_count: Optional[int] = None,
) -> VerificationResult:
    """Verify plugin_param bindings. Either snapshot-scoped (pass
    snapshot_id) or param-scoped (pass chain_id + plugin_uri + param_index).
    Optional expected_count gates the result count."""
    if snapshot_id is not None:
        bindings = await list_plugin_param_bindings_for_snapshot(authority, snapshot_id)
        scope_label = f"snapshot[{snapshot_id}]"
    elif chain_id is not None and plugin_uri is not None and param_index is not None:
        bindings = await list_plugin_param_bindings_for_param(
            authority, chain_id=chain_id, plugin_uri=plugin_uri, param_index=param_index
        )
        scope_label = f"param[{chain_id}:{plugin_uri}:{param_index}]"
    else:
        return VerificationResult(
            name="plugin_param",
            ok=False,
            detail="must pass either snapshot_id OR (chain_id+plugin_uri+param_index)",
        )

    counts = {"bindings": len(bindings)}
    if expected_count is not None and len(bindings) != expected_count:
        return VerificationResult(
            name=f"plugin_param.{scope_label}",
            ok=False,
            detail=f"count mismatch: got {len(bindings)} expected {expected_count}",
            counts=counts,
        )
    return VerificationResult(
        name=f"plugin_param.{scope_label}", ok=True, detail="ok", counts=counts
    )


async def verify_transport_consumer(
    authority: MidiBindingAuthority,
    *,
    expected_consumer_ids: Optional[list[str]] = None,
) -> VerificationResult:
    bindings = await list_transport_bindings(authority)
    counts = {"bindings": len(bindings)}
    if expected_consumer_ids is not None:
        consumer_ids = [b.consumer_id for b in bindings]
        if sorted(set(consumer_ids)) != sorted(set(expected_consumer_ids)):
            return VerificationResult(
                name="transport",
                ok=False,
                detail=(
                    f"consumer_id set mismatch: got {sorted(set(consumer_ids))} "
                    f"expected {sorted(set(expected_consumer_ids))}"
                ),
                counts=counts,
            )
    return VerificationResult(name="transport", ok=True, detail="ok", counts=counts)


async def verify_gpio_consumer(
    authority: MidiBindingAuthority,
    *,
    expected_input_count: Optional[int] = None,
    expected_output_count: Optional[int] = None,
) -> VerificationResult:
    inputs = await list_gpio_bindings(authority, direction="input")
    outputs = await list_gpio_bindings(authority, direction="output")
    counts = {"inputs": len(inputs), "outputs": len(outputs)}
    failures = []
    if expected_input_count is not None and len(inputs) != expected_input_count:
        failures.append(f"inputs got {len(inputs)} expected {expected_input_count}")
    if expected_output_count is not None and len(outputs) != expected_output_count:
        failures.append(f"outputs got {len(outputs)} expected {expected_output_count}")
    if failures:
        return VerificationResult(
            name="gpio", ok=False, detail="; ".join(failures), counts=counts
        )
    return VerificationResult(name="gpio", ok=True, detail="ok", counts=counts)


async def verify_tesira_ttp_consumer(
    authority: MidiBindingAuthority,
    *,
    expected_count: Optional[int] = None,
) -> VerificationResult:
    bindings = await list_tesira_ttp_bindings(authority)
    counts = {"bindings": len(bindings)}
    if expected_count is not None and len(bindings) != expected_count:
        return VerificationResult(
            name="tesira_ttp",
            ok=False,
            detail=f"count mismatch: got {len(bindings)} expected {expected_count}",
            counts=counts,
        )
    return VerificationResult(name="tesira_ttp", ok=True, detail="ok", counts=counts)


async def verify_device_pack_consumer(
    authority: MidiBindingAuthority,
    *,
    expected_pack_count: Optional[int] = None,
) -> VerificationResult:
    bindings = await list_all_device_pack_defaults(authority)
    pack_keys = {b.consumer_id for b in bindings}
    counts = {"bindings": len(bindings), "packs": len(pack_keys)}
    if expected_pack_count is not None and len(pack_keys) != expected_pack_count:
        return VerificationResult(
            name="device_pack",
            ok=False,
            detail=f"pack count mismatch: got {len(pack_keys)} expected {expected_pack_count}",
            counts=counts,
        )
    return VerificationResult(name="device_pack", ok=True, detail="ok", counts=counts)


# ---------- Suite composition ----------


async def run_full_suite(
    authority: MidiBindingAuthority,
    *,
    snapshot_ids: Optional[list[int]] = None,
    brain_device_ids: Optional[list[str]] = None,
    plugin_param_snapshot_ids: Optional[list[int]] = None,
) -> SuiteResult:
    """Compose every per-consumer verifier into one suite run.

    Optional per-consumer scopes restrict the verification footprint
    (e.g., pass only the snapshot_ids you care about). When omitted,
    that consumer's verifier still runs but with no expectations
    (returns ok=True if the projection's read path doesn't error).
    """
    suite = SuiteResult()

    # Snapshots
    if snapshot_ids:
        for sid in snapshot_ids:
            suite.results.append(await verify_snapshot_consumer(authority, snapshot_id=sid))

    # Brain device bindings
    if brain_device_ids:
        for did in brain_device_ids:
            suite.results.append(await verify_brain_consumer(authority, device_id=did))

    # Plugin params (per snapshot)
    if plugin_param_snapshot_ids:
        for sid in plugin_param_snapshot_ids:
            suite.results.append(
                await verify_plugin_param_consumer(authority, snapshot_id=sid)
            )

    # Globals — always run, no expectations.
    suite.results.append(await verify_transport_consumer(authority))
    suite.results.append(await verify_gpio_consumer(authority))
    suite.results.append(await verify_tesira_ttp_consumer(authority))
    suite.results.append(await verify_device_pack_consumer(authority))

    return suite
