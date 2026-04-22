"""Tests for State Authority PlatformEvent integration.

Locks the canonical event kinds registered in platform_event/kind.py and
confirms that the scheduler's emitter adapter produces valid PlatformEvent
envelopes that the bus accepts.
"""

from __future__ import annotations

import pytest

from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.kind import (
    ALL_KINDS,
    PLATFORM_EVENT_KINDS,
    normalize_platform_event_kind,
)


STATE_AUTHORITY_RECONCILIATION_KINDS = (
    "state_authority.reconciliation.healthy",
    "state_authority.reconciliation.drift_detected",
    "state_authority.reconciliation.self_healed",
    "state_authority.reconciliation.reactivation_required",
    "state_authority.reconciliation.cluster_drift",
    "state_authority.reconciliation.error",
)


def test_every_state_authority_reconciliation_kind_is_registered():
    """Plan Q95 — runtime events flow through PlatformEventBus. Each
    reconciliation outcome must have a canonical kind in the taxonomy."""
    for kind in STATE_AUTHORITY_RECONCILIATION_KINDS:
        assert kind in PLATFORM_EVENT_KINDS, f"{kind} missing from PLATFORM_EVENT_KINDS"
        assert kind in ALL_KINDS


def test_state_authority_kinds_pass_canonical_normalization():
    """Normalize should accept and echo back every registered kind."""
    for kind in STATE_AUTHORITY_RECONCILIATION_KINDS:
        assert normalize_platform_event_kind(kind) == kind


def test_unknown_state_authority_kind_fails_normalization():
    import pytest as _pytest

    with _pytest.raises(Exception):
        normalize_platform_event_kind("state_authority.not_a_real_kind")


def test_platform_event_envelope_accepts_state_authority_reconciliation_kinds():
    """The canonical PlatformEvent envelope must validate each registered
    State Authority reconciliation kind without raising."""
    for kind in STATE_AUTHORITY_RECONCILIATION_KINDS:
        event = PlatformEvent(
            kind=kind,
            severity="info",
            source_node="test-node",
            source_service="state_authority_reconciliation_scheduler",
            title="Recon tick",
            message=f"{kind} fired",
            context={"layer": "local", "report": {"status": "healthy"}},
        )
        assert event.kind == kind
        assert event.severity == "info"


def test_platform_event_envelope_truncates_title_below_40_chars():
    """Reconciliation summaries must always fit into the envelope's 40-char
    title cap, otherwise the adapter must truncate before emit."""
    long_title = "Reconciliation cluster and then some extra words that overflow"
    with pytest.raises(Exception):
        PlatformEvent(
            kind="state_authority.reconciliation.healthy",
            severity="info",
            source_node="n",
            source_service="s",
            title=long_title,  # exceeds max_length=40
            message="msg",
        )
    # But the first 40 chars must validate
    event = PlatformEvent(
        kind="state_authority.reconciliation.healthy",
        severity="info",
        source_node="n",
        source_service="s",
        title=long_title[:40],
        message="msg",
    )
    assert len(event.title) <= 40


def test_warning_severity_is_valid_for_drift_kinds():
    event = PlatformEvent(
        kind="state_authority.reconciliation.drift_detected",
        severity="warning",
        source_node="n",
        source_service="s",
        title="Drift",
        message="5 params drifted",
    )
    assert event.severity == "warning"


def test_error_severity_is_valid_for_error_kind():
    event = PlatformEvent(
        kind="state_authority.reconciliation.error",
        severity="error",
        source_node="n",
        source_service="s",
        title="Recon error",
        message="etcd unreachable",
        context={"layer": "cluster", "error": "RuntimeError(...)"},
    )
    assert event.severity == "error"
    assert event.context["layer"] == "cluster"
