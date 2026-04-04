"""installer.backend — system interaction drivers."""
from .executor import CommandExecutor, CommandResult, ExecutorError
from .system   import detect_system, SystemInfo, AudioDevice
from .packages import PackageManager
from .services import ServiceManager
from .pipewire import PipeWireConfig
from .grub     import GRUBConfig
from .build    import JUCEBuilder, FrontendBuilder, PythonEnvBuilder
from .cluster_manager import ClusterManagerInstaller, resolve_cluster_manager_role
from .verifier import PostInstallVerifier, CheckResult, CheckStatus

__all__ = [
    "CommandExecutor", "CommandResult", "ExecutorError",
    "detect_system", "SystemInfo", "AudioDevice",
    "PackageManager", "ServiceManager", "PipeWireConfig",
    "GRUBConfig", "JUCEBuilder", "FrontendBuilder", "PythonEnvBuilder",
    "ClusterManagerInstaller", "resolve_cluster_manager_role",
    "PostInstallVerifier", "CheckResult", "CheckStatus",
]
