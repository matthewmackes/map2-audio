"""T2448: PipeWire quantum drift detection + enforcement."""

import asyncio

import pytest

from app.services.audio import pipewire_quantum_enforcer as pqe


_OK_OUTPUT = (
    "found \"settings\" metadata 0\n"
    "\tupdate: id:0 key:'clock.rate' value:'48000' type:''\n"
    "\tupdate: id:0 key:'clock.quantum' value:'64' type:''\n"
    "\tupdate: id:0 key:'clock.force-rate' value:'48000' type:''\n"
    "\tupdate: id:0 key:'clock.force-quantum' value:'64' type:''\n"
)

_DRIFT_OUTPUT = (
    "found \"settings\" metadata 0\n"
    "\tupdate: id:0 key:'clock.rate' value:'48000' type:''\n"
    "\tupdate: id:0 key:'clock.quantum' value:'1024' type:''\n"
)


def _patch_run(monkeypatch, *, outputs_by_args=None, exception=None):
    async def fake_run(args, *, timeout_s=2.0):
        if exception is not None:
            raise exception
        if outputs_by_args is not None:
            key = tuple(args)
            if key in outputs_by_args:
                return outputs_by_args[key]
        return 0, _OK_OUTPUT, ""

    monkeypatch.setattr(pqe, "_run_pw_metadata", fake_run)


def test_observe_quantum_parses_ok_output(monkeypatch):
    _patch_run(monkeypatch)
    observed = asyncio.run(pqe.observe_quantum())
    assert observed.rate == 48000
    assert observed.quantum == 64
    assert observed.matches_expected


def test_observe_quantum_parses_drift(monkeypatch):
    _patch_run(
        monkeypatch,
        outputs_by_args={("-n", "settings", "0"): (0, _DRIFT_OUTPUT, "")},
    )
    observed = asyncio.run(pqe.observe_quantum())
    assert observed.rate == 48000
    assert observed.quantum == 1024
    assert not observed.matches_expected


def test_enforce_reforce_silently_corrects_drift(monkeypatch):
    calls = []

    async def fake_run(args, *, timeout_s=2.0):
        calls.append(tuple(args))
        if args == ["-n", "settings", "0"]:
            return 0, _DRIFT_OUTPUT, ""
        # force-rate / force-quantum
        return 0, "", ""

    monkeypatch.setattr(pqe, "_run_pw_metadata", fake_run)

    result = asyncio.run(pqe.enforce_expected_quantum(policy="reforce"))
    assert result.action == "reforced"
    # Rate must be set first, then quantum.
    rate_call = calls.index(("0", "clock.force-rate", "48000"))
    quantum_call = calls.index(("0", "clock.force-quantum", "64"))
    assert rate_call < quantum_call


def test_enforce_fail_raises_structured_drift_error(monkeypatch):
    _patch_run(
        monkeypatch,
        outputs_by_args={("-n", "settings", "0"): (0, _DRIFT_OUTPUT, "")},
    )

    with pytest.raises(pqe.QuantumDriftError) as excinfo:
        asyncio.run(pqe.enforce_expected_quantum(policy="fail"))
    assert excinfo.value.observed_quantum == 1024
    assert excinfo.value.observed_rate == 48000


def test_enforce_returns_none_when_binary_missing(monkeypatch):
    _patch_run(monkeypatch, exception=pqe.PipeWireMetadataUnavailable("missing"))
    result = asyncio.run(pqe.enforce_expected_quantum(policy="reforce"))
    assert result.action == "none"


def test_enforce_ok_output_is_no_op(monkeypatch):
    _patch_run(monkeypatch)
    result = asyncio.run(pqe.enforce_expected_quantum(policy="reforce"))
    assert result.action == "none"
    assert result.observed.matches_expected


def test_drift_error_message_contains_stable_code():
    exc = pqe.QuantumDriftError(observed_rate=48000, observed_quantum=1024)
    assert "PipeWire quantum drift" in str(exc)
