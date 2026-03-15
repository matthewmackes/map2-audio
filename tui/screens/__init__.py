"""
Interactive TUI Screens for MAP2 Audio Platform

Uses lazy imports to speed up TUI startup - screens are only loaded when first accessed.
"""

__all__ = [
    'ChainsManagerScreen',
    'MIDIScreen',
]

# Lazy import mapping: attribute name -> (module, class_name)
_LAZY_IMPORTS = {
    'ChainsManagerScreen': ('.chains_manager_screen', 'ChainsManagerScreen'),
    'MIDIScreen': ('.midi', 'MIDIScreen'),
}

# Cache for loaded classes
_loaded = {}


def __getattr__(name: str):
    """Lazy import screen classes on first access."""
    if name in _loaded:
        return _loaded[name]

    if name in _LAZY_IMPORTS:
        module_name, class_name = _LAZY_IMPORTS[name]
        from importlib import import_module
        module = import_module(module_name, __package__)
        cls = getattr(module, class_name)
        _loaded[name] = cls
        return cls

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
