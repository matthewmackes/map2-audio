"""Persistent state for the unified console."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class SessionState:
    """Persisted shell state across launches."""

    onboarding_completed: bool = False
    theme_name: str = "carbon-dark"
    last_route: str = "dashboard"
    environment: str = "local"
    workspace: str = "map2-audio"
    nav_collapsed_groups: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.nav_collapsed_groups is None:
            self.nav_collapsed_groups = []


class SessionStateStore:
    """Load and save the console's lightweight session state."""

    def __init__(self) -> None:
        self._state_dir = Path.home() / ".config" / "map2"
        self._state_dir.mkdir(parents=True, exist_ok=True)
        self._state_file = self._state_dir / "tui_state.json"

    def load(self) -> SessionState:
        if not self._state_file.exists():
            return SessionState()
        try:
            payload = json.loads(self._state_file.read_text())
            return SessionState(**payload)
        except Exception:
            return SessionState()

    def save(self, state: SessionState) -> None:
        self._state_file.write_text(json.dumps(asdict(state), indent=2))
