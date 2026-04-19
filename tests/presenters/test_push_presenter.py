from __future__ import annotations

from app.services.platform_event.presenters.push_presenter import PushPresenter
from app.services.platform_event.severity import Severity

from .conftest import load_golden, make_platform_event


def test_push_presenter_matches_golden(golden_dir):
    presenter = PushPresenter()
    action = presenter.present(
        make_platform_event(
            kind="workflow.progress",
            severity=Severity.INFO,
            target_surfaces=["push"],
        )
    )

    assert action is not None
    assert action.to_dict() == load_golden(golden_dir / "push_presenter.json")
