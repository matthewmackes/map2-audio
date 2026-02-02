"""
Interactive TUI Screens for MAP2 Audio Platform

Uses lazy imports to speed up TUI startup - screens are only loaded when first accessed.
"""

__all__ = [
    'ChainsScreen',
    'ChainsScreenRefactored',
    'PluginsScreen',
    'PluginLoaderScreen',
    'MIDIScreen',
    'GuitarChainScreen',
    'SessionsScreen',
    'MetricsTab',
    'WorkflowTab',
    'AboutTab',
    'BackupTab',
    'ControlPanelScreen',
    'HealthTabScreen',
    'AutomationTab',
    'NetworkTab',
    'WWWTab',
    'StageViewScreen',
]

# Lazy import mapping: attribute name -> (module, class_name)
_LAZY_IMPORTS = {
    'ChainsScreenRefactored': ('.chains_refactored', 'ChainsScreenRefactored'),
    'ChainsScreen': ('.chains_refactored', 'ChainsScreenRefactored'),  # Alias
    'PluginsScreen': ('.plugins', 'PluginsScreen'),
    'MIDIScreen': ('.midi', 'MIDIScreen'),
    'GuitarChainScreen': ('.guitar', 'GuitarChainScreen'),
    'SessionsScreen': ('.sessions', 'SessionsScreen'),
    'MetricsTab': ('.metrics_tab', 'MetricsTab'),
    'WorkflowTab': ('.workflow_tab', 'WorkflowTab'),
    'PluginLoaderScreen': ('.plugin_loader', 'PluginLoaderScreen'),
    'AboutTab': ('.about_tab', 'AboutTab'),
    'BackupTab': ('.backup_tab', 'BackupTab'),
    'ControlPanelScreen': ('.control_panel', 'ControlPanelScreen'),
    'HealthTabScreen': ('.health_tab', 'HealthTabScreen'),
    'AutomationTab': ('.automation_tab', 'AutomationTab'),
    'NetworkTab': ('.network_tab', 'NetworkTab'),
    'WWWTab': ('.www_tab', 'WWWTab'),
    'StageViewScreen': ('.stage_view_screen', 'StageViewScreen'),
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
