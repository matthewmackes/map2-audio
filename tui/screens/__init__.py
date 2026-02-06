"""
Interactive TUI Screens for MAP2 Audio Platform

Uses lazy imports to speed up TUI startup - screens are only loaded when first accessed.
"""

# Cluster screens
try:
    from .cluster_node_dashboard import ClusterNodeDashboard, NodeMetricsPanel
    from .flow_assignment_matrix import FlowAssignmentMatrix, MatrixCell, CellData
    from .node_recommendation_screen import NodeRecommendationScreen
    from .failover_controller_screen import FailoverControllerScreen
    from .cluster_diagnostics_screen import ClusterDiagnosticsScreen
    from .help_screen import HelpScreen
    from .batch_operations_screen import BatchOperationsScreen
except ImportError:
    pass

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
    'ClusterNodeDashboard',
    'NodeMetricsPanel',
    'FlowAssignmentMatrix',
    'MatrixCell',
    'CellData',
    'NodeRecommendationScreen',
    'FailoverControllerScreen',
    'ClusterDiagnosticsScreen',
    'HelpScreen',
    'BatchOperationsScreen',
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
