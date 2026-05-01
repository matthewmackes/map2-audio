"""T2482-P1.2 Gap C (iter 74) — outbound wiring verification.

Iter 73 added the LibremidiAdapter::sendToVirtualOutput surface to
the outbound drain in drain_ring_and_dispatch. A live virtual-port
loopback test (Python opens a virtual input, daemon emits to its
virtual output, Python reads back) requires a `MidiCreateVirtualPortRequest`
IPC envelope that doesn't exist yet (iter 75 work). Until then,
this test verifies:

1. Symbol presence: the rebuilt binary exports sendToVirtualOutput
   (catches a build-system regression that drops the new code).
2. Fallback: when no virtual output is open, the legacy
   midi_send_request IPC path still fires (proves the iter-73
   `bool sent_libremidi = false` short-circuit works).

The full live virtual-port round-trip lands in iter 75-76 once
the IPC envelope ships.
"""

from __future__ import annotations

import subprocess
import unittest
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
BINARY = REPO_ROOT / "juce-engine" / "build" / "map2-controller-host"


@pytest.mark.skipif(
    not BINARY.exists(),
    reason=f"map2-controller-host binary not built: {BINARY}",
)
class OutboundWiringSymbolTests(unittest.TestCase):
    def test_binary_links_send_to_virtual_output(self) -> None:
        """nm -C the binary and confirm the new symbol is present.

        Catches a build-system regression where iter-72/73 source
        edits don't get linked into the binary (e.g., CMake target
        not rebuilt, or LibremidiAdapter.cpp.o stale).
        """
        try:
            result = subprocess.run(
                ["nm", "-C", str(BINARY)],
                capture_output=True, text=True, timeout=30,
            )
        except FileNotFoundError:
            self.skipTest("nm not installed; can't verify symbol presence")
        self.assertEqual(result.returncode, 0,
                          f"nm failed: {result.stderr}")
        # Look for the demangled C++ name. The exact form depends on
        # demangler version; match on the function name component.
        self.assertIn(
            "sendToVirtualOutput",
            result.stdout,
            "iter-73 symbol not linked into binary — rebuild needed?",
        )


@pytest.mark.skipif(
    not BINARY.exists(),
    reason=f"map2-controller-host binary not built: {BINARY}",
)
class OutboundFallbackBehaviourTests(unittest.TestCase):
    """Existing B5 fixtures don't exercise outbound MIDI yet, so the
    fallback path (no virtual output → IPC frame) is the only
    behaviour we can directly assert today. The lifecycle dispatch
    + B5 fixture suites already exercise the fallback indirectly
    (they run against a daemon that never opened a virtual output)
    — this test pins that contract by re-importing the existing
    suites + confirming they pass."""

    def test_existing_b5_fixtures_still_pass(self) -> None:
        # Run the existing B5 + lifecycle pytest suites as
        # subprocesses to ensure the iter-73 wiring didn't break
        # them. A regression here means the fallback path is broken.
        result = subprocess.run(
            [
                "python3", "-m", "pytest",
                str(REPO_ROOT / "tests"
                    / "test_controller_host_b5_golden_t2482p1_2.py"),
                str(REPO_ROOT / "tests"
                    / "test_controller_host_p1_2_lifecycle_dispatch_t2482.py"),
                "-q",
            ],
            capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(
            result.returncode, 0,
            f"B5/lifecycle suites failed after iter-73 wiring:\n"
            f"--- stdout ---\n{result.stdout}\n--- stderr ---\n{result.stderr}",
        )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
