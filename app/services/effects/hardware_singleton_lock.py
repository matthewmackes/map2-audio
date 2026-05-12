"""T2517-5 — Singleton-instance enforcement for hardware-FX bridge plugins.

Only one physical MPX-1 (and likewise one physical H8000, Fireworx, etc.)
exists per rig. The effects-chooser needs to refuse a second insertion with
a structured error pointing at the chain currently using the device.

The lock is **per-process** (this is a single-node engine) and **per-rig**;
cluster-wide singletons are explicitly out of scope (T2517-Follow-up-C).

The lock canonicalises URIs through the plugin descriptor's ``aliases:`` list
so a snapshot referencing ``hardware://lexicon-mpx1-spdif`` is recognized as
the same physical device as ``hardware://lexicon-mpx1``.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Dict, Iterable, Mapping


class HardwareSingletonInUseError(RuntimeError):
    """Raised when a singleton hardware plugin is already in use in another chain."""

    def __init__(self, uri: str, in_use_by_chain: str) -> None:
        self.uri = uri
        self.in_use_by_chain = in_use_by_chain
        super().__init__(
            f"hardware_singleton_in_use: uri={uri} in_use_by_chain={in_use_by_chain}"
        )

    def to_structured(self) -> dict:
        """Shape suitable for FastAPI 409 detail payloads."""
        return {
            "code": "hardware_singleton_in_use",
            "uri": self.uri,
            "in_use_by_chain": self.in_use_by_chain,
        }


@dataclass(frozen=True)
class SingletonLease:
    canonical_uri: str
    chain_id: str


class HardwareSingletonLock:
    """Thread-safe one-uri → one-chain registry.

    Keyed by *canonical* URI. ``register_aliases`` lets the plugin discovery
    layer declare that two URIs identify the same physical device.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._held: Dict[str, str] = {}              # canonical_uri -> chain_id
        self._alias_to_canonical: Dict[str, str] = {}

    # ------------------------------------------------------------------
    # URI canonicalisation
    # ------------------------------------------------------------------

    def register_aliases(self, canonical_uri: str, aliases: Iterable[str]) -> None:
        """Declare that ``aliases`` resolve to ``canonical_uri``."""
        with self._lock:
            self._alias_to_canonical[canonical_uri] = canonical_uri
            for alias in aliases:
                if alias:
                    self._alias_to_canonical[alias] = canonical_uri

    def canonicalise(self, uri: str) -> str:
        with self._lock:
            return self._alias_to_canonical.get(uri, uri)

    # ------------------------------------------------------------------
    # Lock API
    # ------------------------------------------------------------------

    def acquire(self, uri: str, chain_id: str) -> SingletonLease:
        """Acquire the lock for ``uri`` in ``chain_id``.

        Re-acquiring the same (uri, chain_id) pair is idempotent. Re-acquiring
        with a different chain raises :class:`HardwareSingletonInUseError`.
        """
        canonical = self.canonicalise(uri)
        with self._lock:
            held_by = self._held.get(canonical)
            if held_by is not None and held_by != chain_id:
                raise HardwareSingletonInUseError(canonical, held_by)
            self._held[canonical] = chain_id
        return SingletonLease(canonical_uri=canonical, chain_id=chain_id)

    def release(self, uri: str, chain_id: str | None = None) -> bool:
        """Release the lock for ``uri``.

        With ``chain_id`` provided, releases only if the lock is currently
        held by that chain (no-op otherwise — protects against late teardown
        callbacks releasing a chain that has since taken over).
        Returns True iff a lock was released.
        """
        canonical = self.canonicalise(uri)
        with self._lock:
            held_by = self._held.get(canonical)
            if held_by is None:
                return False
            if chain_id is not None and held_by != chain_id:
                return False
            del self._held[canonical]
            return True

    def is_held(self, uri: str) -> bool:
        canonical = self.canonicalise(uri)
        with self._lock:
            return canonical in self._held

    def held_by(self, uri: str) -> str | None:
        canonical = self.canonicalise(uri)
        with self._lock:
            return self._held.get(canonical)

    def snapshot(self) -> Mapping[str, str]:
        """Return a {canonical_uri: chain_id} snapshot of all current holders."""
        with self._lock:
            return dict(self._held)


# ----------------------------------------------------------------------------
# Process-wide singleton
# ----------------------------------------------------------------------------

_GLOBAL_LOCK = HardwareSingletonLock()


def get_hardware_singleton_lock() -> HardwareSingletonLock:
    return _GLOBAL_LOCK
