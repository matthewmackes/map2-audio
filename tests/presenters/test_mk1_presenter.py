from __future__ import annotations

from app.services.platform_event.presenters.mk1_presenter import MK1EventPresenter

from .conftest import load_golden, make_platform_event


def test_mk1_presenter_matches_golden(golden_dir):
    presenter = MK1EventPresenter()
    action = presenter.present(make_platform_event(target_surfaces=["mk1"]))

    assert action is not None
    assert action.to_dict() == load_golden(golden_dir / "mk1_presenter.json")

