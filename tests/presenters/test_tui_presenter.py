from __future__ import annotations

from app.services.platform_event.presenters.tui_presenter import TUIPresenter
from app.services.platform_event.severity import Severity

from .conftest import load_golden, make_platform_event


def test_tui_presenter_matches_golden(golden_dir):
    presenter = TUIPresenter()
    action = presenter.present(
        make_platform_event(
            kind="workflow.progress",
            severity=Severity.ERROR,
            target_surfaces=["tui"],
        )
    )

    assert action is not None
    assert action.to_dict() == load_golden(golden_dir / "tui_presenter.json")
