from __future__ import annotations

from app.services.platform_event.presenters.lcd_presenter import LCDPresenter
from app.services.platform_event.severity import Severity

from .conftest import load_golden, make_platform_event


def test_lcd_presenter_matches_golden(golden_dir):
    presenter = LCDPresenter()
    action = presenter.present(
        make_platform_event(
            kind="workflow.progress",
            severity=Severity.WARNING,
            target_surfaces=["lcd"],
        )
    )

    assert action is not None
    assert action.to_dict() == load_golden(golden_dir / "lcd_presenter.json")
