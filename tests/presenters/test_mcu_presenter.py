from __future__ import annotations

from app.services.platform_event.presenters.mcu_presenter import MCUPresenter
from app.services.platform_event.severity import Severity

from .conftest import load_golden, make_platform_event


def test_mcu_presenter_matches_golden(golden_dir):
    presenter = MCUPresenter()
    action = presenter.present(
        make_platform_event(
            kind="workflow.progress",
            severity=Severity.WARNING,
            target_surfaces=["mcu"],
        )
    )

    assert action is not None
    assert action.to_dict() == load_golden(golden_dir / "mcu_presenter.json")
