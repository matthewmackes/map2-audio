import importlib
import inspect
import pkgutil

from app.services.ir_library.scraper_base import IRScraperBase
from app.services.soundfont_library.scraper_base import SFScraperBase


def _iter_scraper_classes(package_name: str, base_cls):
    package = importlib.import_module(package_name)
    package_path = getattr(package, "__path__", None)
    assert package_path is not None, f"{package_name} has no package path"

    for module_info in pkgutil.iter_modules(package_path):
        if not module_info.name.endswith("_scraper"):
            continue
        module = importlib.import_module(f"{package_name}.{module_info.name}")
        for _, cls in inspect.getmembers(module, inspect.isclass):
            if cls is base_cls:
                continue
            if issubclass(cls, base_cls):
                yield cls


def test_ir_scrapers_override_required_methods():
    classes = list(_iter_scraper_classes("app.services.ir_library", IRScraperBase))
    assert classes, "No IR scraper classes discovered"

    for cls in classes:
        assert not inspect.isabstract(cls), f"{cls.__name__} is unexpectedly abstract"
        assert cls.discover_irs is not IRScraperBase.discover_irs, (
            f"{cls.__name__} must override discover_irs"
        )
        assert cls.download_file is not IRScraperBase.download_file, (
            f"{cls.__name__} must override download_file"
        )


def test_soundfont_scrapers_override_required_methods():
    classes = list(
        _iter_scraper_classes("app.services.soundfont_library", SFScraperBase)
    )
    assert classes, "No SoundFont scraper classes discovered"

    for cls in classes:
        assert not inspect.isabstract(cls), f"{cls.__name__} is unexpectedly abstract"
        assert cls.discover_soundfonts is not SFScraperBase.discover_soundfonts, (
            f"{cls.__name__} must override discover_soundfonts"
        )
        assert cls.download_file is not SFScraperBase.download_file, (
            f"{cls.__name__} must override download_file"
        )
