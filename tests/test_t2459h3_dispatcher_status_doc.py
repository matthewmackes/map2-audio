"""T2459-H3 production-dispatcher status doc invariants.

The doc at docs/midi/T2459_H3_PRODUCTION_DISPATCHER_GAP.md was
originally authored on 2026-05-04 as a "gap" doc that incorrectly
claimed the dispatcher only existed in a parallel agent's worktree.
On 2026-05-05 it was rewritten to reflect master state: slices 3, 5,
and 6 are ALL on master and the only remaining acceptance gate is the
bench HIL run with physical MeloAudio hardware.

These pins prevent the doc from regressing back into the misleading
"gap" framing, and they tie the doc's truth claims to specific,
greppable patterns in juce-engine/Source/ControllerHost/main.cpp.
"""

from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DOC = REPO_ROOT / "docs" / "midi" / "T2459_H3_PRODUCTION_DISPATCHER_GAP.md"
HOST_MAIN = REPO_ROOT / "juce-engine" / "Source" / "ControllerHost" / "main.cpp"


def _read_doc() -> str:
    return DOC.read_text(encoding="utf-8")


def _read_host_main() -> str:
    return HOST_MAIN.read_text(encoding="utf-8")


def test_doc_exists() -> None:
    assert DOC.is_file()


def test_doc_declares_dispatcher_shipped_on_master() -> None:
    text = _read_doc()
    assert "SHIPPED on `master`" in text or "shipped on master" in text.lower()


def test_doc_pipeline_marks_dispatcher_steps_done() -> None:
    """The pipeline ascii-graphic must mark every code-side step
    with the ✓ check; the only ✗ step must be the bench HIL gate."""
    text = _read_doc()
    assert "host main-loop dispatches script_load       ✓" in text
    assert "host caches/loads JS via QuickJS engine     ✓" in text
    assert "libremidi events flow through script        ✓" in text
    assert "host emits engine_command UDS frames        ✓" in text
    assert "multi-controller routing per Slot::ctrl_idx ✓" in text
    assert "Bench HIL with MeloAudio Commander          ✗ HARDWARE GATE" in text


def test_dispatcher_handlers_present_on_master() -> None:
    """Truth claim: the doc says dispatcher handlers live in main.cpp.
    Grep them. If they vanish, this test screams before the doc lies."""
    src = _read_host_main()
    assert '"\\"type\\":\\"script_load_request\\""' in src
    assert '"\\"type\\":\\"mapping_activate\\""' in src
    assert '"\\"type\\":\\"midi_open_input_request\\""' in src
    assert "drain_ring_and_dispatch" in src
    assert "drainEngineCommands" in src


def test_doc_lists_three_h3_integration_test_files() -> None:
    text = _read_doc()
    for fname in (
        "test_controller_host_main_loop_t2459h3.py",
        "test_controller_host_main_loop_t2459h3_slice5.py",
        "test_controller_host_main_loop_t2459h3_slice6.py",
    ):
        assert fname in text, f"doc must reference {fname}"


def test_doc_pins_remaining_acceptance_to_hardware() -> None:
    """No code-side gate may live in the 'remaining' section. The
    only thing left is the bench HIL run with physical hardware."""
    text = _read_doc()
    assert "Bench HIL run" in text
    assert "physical MeloAudio Commander" in text or "physical MIDI Commander" in text
    assert "fit-for-purpose-evidence" in text


def test_doc_does_not_falsely_claim_worktree_split() -> None:
    """The cycle-59 version of this doc claimed the dispatcher only
    lived in '.claude/worktrees/agent-*/...'. That is wrong on master.
    Pin against the false claim re-appearing."""
    text = _read_doc()
    assert "not yet on `master`" not in text
    assert "not yet on master" not in text
    # The doc may legitimately mention `.claude/worktrees/` as part of
    # historical context (the cycle-59 confusion), but only inside the
    # corrective framing — never as a current-state claim.
    if ".claude/worktrees/" in text:
        # If mentioned, must be mentioned alongside the corrective
        # 'doc updated' / 'cycle-59' / 'incorrectly claimed' framing.
        for marker in (
            "incorrectly claimed",
            "Doc updated",
            "doc updated",
            "cycle-59",
            "cycle 59",
        ):
            if marker in text:
                break
        else:
            raise AssertionError(
                "doc references .claude/worktrees/ without corrective framing"
            )
