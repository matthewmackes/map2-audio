from __future__ import annotations

from app.utils.singleton import Singleton


class _InnerSingleton(Singleton):
    def __init__(self) -> None:
        self.value = 42


class _OuterSingleton(Singleton):
    def __init__(self) -> None:
        self.inner = _InnerSingleton.get_instance()


def test_singleton_supports_nested_singleton_initialization() -> None:
    Singleton._instances.pop(_InnerSingleton, None)
    Singleton._instances.pop(_OuterSingleton, None)

    outer = _OuterSingleton.get_instance()

    assert outer.inner is _InnerSingleton.get_instance()
    assert outer.inner.value == 42
