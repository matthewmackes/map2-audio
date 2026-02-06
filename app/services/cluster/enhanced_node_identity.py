"""
Enhanced Node Identity and Hardware Detection for Cluster Management

Extensions to the basic NodeIdentity service:
- UUID + MAC address combo for immutable node IDs
- Hardware capability detection  
- Automatic role assignment (AUDIO-NODE vs MANAGEMENT-NODE)
- Storage in Fedora standard /etc/map2/node.conf
"""

import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Optional, List, Dict
from dataclasses import dataclass, asdict
from datetime import datetime
import uuid
import socket

logger = logging.getLogger(__name__)


@dataclass
class NodeCapabilities:
    """Detected hardware capabilities of the node"""
    cpu_cores: int
    cpu_model: str
    total_memory_gb: int
    has_audio_interface: bool
    audio_interfaces: List[str]
    has_gpuapu: bool
    storage_gb: int
    kernel_version: str
    os_release: str
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class NodeConfig:
    """Complete node configuration"""
    node_id: str                          # UUID-MAC combo
    hostname: str
    immutable_id: str                     # Never changes
    role: str                             # AUDIO-NODE, MANAGEMENT-NODE, STANDBY-MANAGEMENT
    deployment_mode: str                  # From app/deployment/deployment.py
    capabilities: NodeCapabilities
    created_at: str
    updated_at: str
    ssh_public_key: Optional[str] = None
    ssh_fingerprint: Optional[str] = None
    mac_addresses: List[str] = None
    
    def to_dict(self) -> Dict:
        """Convert to dict for JSON serialization"""
        result = asdict(self)
        result['capabilities'] = self.capabilities.to_dict()
        return result
    
    @classmethod
    def from_dict(cls, d: Dict) -> 'NodeConfig':
        """Create from dict"""
        caps_dict = d.pop('capabilities')
        capabilities = NodeCapabilities(**caps_dict)
        return cls(capabilities=capabilities, **d)


class NodeHardwareDetector:
    """Detect hardware capabilities of current node"""
    
    @staticmethod
    def get_cpu_info() -> tuple[int, str]:
        """Return (core_count, cpu_model)"""
        try:
            # Try lscpu (Fedora standard)
            result = subprocess.run(
                ['lscpu'],
                capture_output=True,
                text=True,
                timeout=5
            )
            cores = 1
            model = "Unknown"
            
            for line in result.stdout.split('\n'):
                if line.startswith('CPU(s):'):
                    cores = int(line.split(':')[1].strip())
                elif line.startswith('Model name:'):
                    model = line.split(':')[1].strip()
            
            return cores, model
        except Exception as e:
            logger.warning(f"Failed to detect CPU: {e}")
            return os.cpu_count() or 1, "Unknown"
    
    @staticmethod
    def get_memory_gb() -> int:
        """Return total memory in GB"""
        try:
            result = subprocess.run(
                ['free', '-g'],
                capture_output=True,
                text=True,
                timeout=5
            )
            # Second line, first column
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:
                mem_str = lines[1].split()[1]
                return int(mem_str)
        except Exception as e:
            logger.warning(f"Failed to detect memory: {e}")
        return 4  # Default fallback
    
    @staticmethod
    def detect_audio_interfaces() -> tuple[bool, List[str]]:
        """Return (has_audio, list_of_interfaces)"""
        interfaces = []
        try:
            # Check for audio devices using pactl (PulseAudio)
            result = subprocess.run(
                ['pactl', 'list', 'sinks'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0 and 'Sink' in result.stdout:
                interfaces.append('PulseAudio')
            
            # Check for ALSA devices
            result = subprocess.run(
                ['aplay', '-l'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                interfaces.append('ALSA')
            
            # Check for JACK
            result = subprocess.run(
                ['jack_lsp'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                interfaces.append('JACK')
                
        except Exception as e:
            logger.debug(f"Error detecting audio interfaces: {e}")
        
        return len(interfaces) > 0, interfaces
    
    @staticmethod
    def detect_gpu() -> bool:
        """Detect if GPU/APU is present"""
        try:
            result = subprocess.run(
                ['lspci'],
                capture_output=True,
                text=True,
                timeout=5
            )
            gpu_keywords = ['NVIDIA', 'AMD', 'Intel Graphics', 'VGA compatible']
            for line in result.stdout.split('\n'):
                if any(kw in line for kw in gpu_keywords):
                    return True
        except Exception:
            pass
        return False
    
    @staticmethod
    def get_storage_gb() -> int:
        """Return available storage in /opt/map2 (GB)"""
        try:
            result = subprocess.run(
                ['df', '/opt', '-BG'],
                capture_output=True,
                text=True,
                timeout=5
            )
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:
                # Second line, second column
                size_str = lines[1].split()[1].replace('G', '')
                return int(size_str)
        except Exception as e:
            logger.warning(f"Failed to detect storage: {e}")
        return 100  # Default fallback
    
    @staticmethod
    def get_kernel_version() -> str:
        """Return kernel version"""
        try:
            result = subprocess.run(
                ['uname', '-r'],
                capture_output=True,
                text=True,
                timeout=5
            )
            return result.stdout.strip()
        except Exception:
            return "Unknown"
    
    @staticmethod
    def get_os_release() -> str:
        """Return OS/Fedora version"""
        try:
            with open('/etc/os-release', 'r') as f:
                for line in f:
                    if line.startswith('PRETTY_NAME'):
                        return line.split('=')[1].strip().strip('"')
        except Exception:
            pass
        return "Unknown"
    
    @staticmethod
    def get_mac_addresses() -> List[str]:
        """Get all MAC addresses on system"""
        macs = []
        try:
            result = subprocess.run(
                ['ip', 'link', 'show'],
                capture_output=True,
                text=True,
                timeout=5
            )
            for line in result.stdout.split('\n'):
                if 'link/ether' in line:
                    parts = line.strip().split()
                    if len(parts) > 1:
                        macs.append(parts[1])
        except Exception as e:
            logger.debug(f"Error getting MAC addresses: {e}")
        return macs
    
    @classmethod
    def detect_all(cls) -> NodeCapabilities:
        """Run all hardware detection"""
        cpu_cores, cpu_model = cls.get_cpu_info()
        total_mem = cls.get_memory_gb()
        has_audio, audio_ifaces = cls.detect_audio_interfaces()
        has_gpu = cls.detect_gpu()
        storage = cls.get_storage_gb()
        kernel = cls.get_kernel_version()
        os_rel = cls.get_os_release()
        
        return NodeCapabilities(
            cpu_cores=cpu_cores,
            cpu_model=cpu_model,
            total_memory_gb=total_mem,
            has_audio_interface=has_audio,
            audio_interfaces=audio_ifaces,
            has_gpuapu=has_gpu,
            storage_gb=storage,
            kernel_version=kernel,
            os_release=os_rel
        )


class EnhancedNodeIdentity:
    """
    Enhanced node identity with cluster awareness.
    
    Creates immutable node IDs using UUID + MAC address.
    Stores in /etc/map2/node.conf (Fedora standard).
    Auto-detects role based on hardware capabilities.
    """
    
    CONFIG_PATH = Path("/etc/map2/node.conf")
    BACKUP_CONFIG_PATH = Path("/etc/map2/node.conf.bak")
    
    def __init__(self):
        self.config: Optional[NodeConfig] = None
        self._load_or_create_config()
    
    def _generate_immutable_id(self) -> str:
        """
        Generate immutable node ID from UUID + first MAC address.
        Format: <UUID>-<MAC_FIRST_3_BYTES>
        """
        node_uuid = str(uuid.uuid4())[:8]  # First 8 chars of UUID
        
        macs = NodeHardwareDetector.get_mac_addresses()
        if macs:
            mac_prefix = macs[0][:8].replace(':', '')  # First 3 bytes
        else:
            # Fallback: hash hostname
            import hashlib
            mac_prefix = hashlib.md5(
                socket.gethostname().encode()
            ).hexdigest()[:8]
        
        return f"{node_uuid}-{mac_prefix.upper()}"
    
    def _auto_detect_role(self, capabilities: NodeCapabilities) -> str:
        """
        Auto-detect node role based on hardware.
        
        AUDIO-NODE: Has audio interfaces, 4+ cores, 8+ GB RAM
        MANAGEMENT-NODE: Otherwise (can manage cluster)
        STANDBY-MANAGEMENT: Assigned manually after role is MANAGEMENT-NODE
        """
        if capabilities.has_audio_interface:
            if capabilities.cpu_cores >= 4 and capabilities.total_memory_gb >= 8:
                return "AUDIO-NODE"
        
        return "MANAGEMENT-NODE"
    
    def _load_or_create_config(self):
        """Load config from file or create new one"""
        if self.CONFIG_PATH.exists():
            try:
                self._load_config()
                logger.info(f"Loaded node config: {self.config.node_id}")
                return
            except Exception as e:
                logger.error(f"Failed to load config: {e}")
                # Backup corrupted config
                self.CONFIG_PATH.rename(self.BACKUP_CONFIG_PATH)
        
        # Create new config
        self._create_new_config()
    
    def _load_config(self):
        """Load configuration from file"""
        with open(self.CONFIG_PATH, 'r') as f:
            data = json.load(f)
        self.config = NodeConfig.from_dict(data)
    
    def _create_new_config(self):
        """Create new node configuration"""
        logger.info("Creating new node configuration...")
        
        # Detect hardware
        capabilities = NodeHardwareDetector.detect_all()
        logger.info(f"Detected hardware: {capabilities.cpu_cores} cores, "
                   f"{capabilities.total_memory_gb} GB RAM, "
                   f"audio={capabilities.has_audio_interface}")
        
        # Generate immutable ID
        immutable_id = self._generate_immutable_id()
        
        # Auto-detect role
        role = self._auto_detect_role(capabilities)
        
        # Determine deployment mode from environment or role
        deployment_mode = os.getenv(
            "MAP2_DEPLOYMENT_MODE",
            "AUDIO-NODE" if role == "AUDIO-NODE" else "CONTROL-NODE"
        )
        
        # Read SSH public key if exists
        ssh_pub_key = None
        ssh_fingerprint = None
        from app.services.node_identity import NodeIdentity
        try:
            ni = NodeIdentity(mode=role)
            ssh_pub_key = ni.ssh_public_key
            ssh_fingerprint = ni.ssh_fingerprint
        except Exception as e:
            logger.warning(f"Could not load SSH key: {e}")
        
        # Create config
        self.config = NodeConfig(
            node_id=f"{role}-{immutable_id}",
            hostname=socket.gethostname(),
            immutable_id=immutable_id,
            role=role,
            deployment_mode=deployment_mode,
            capabilities=capabilities,
            created_at=datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat(),
            ssh_public_key=ssh_pub_key,
            ssh_fingerprint=ssh_fingerprint,
            mac_addresses=NodeHardwareDetector.get_mac_addresses(),
        )
        
        # Ensure directory exists (requires root or sudo)
        self.CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        
        # Save config with restricted permissions
        with open(self.CONFIG_PATH, 'w') as f:
            json.dump(self.config.to_dict(), f, indent=2)
        
        # Restrict permissions (readable by all, writable by root only)
        os.chmod(self.CONFIG_PATH, 0o644)
        
        logger.info(f"Created new node config: {self.config.node_id}")
        logger.info(f"Role: {role}")
        logger.info(f"Immutable ID: {immutable_id}")
    
    def get_node_id(self) -> str:
        """Get unique node ID"""
        if not self.config:
            self._load_or_create_config()
        return self.config.node_id
    
    def get_role(self) -> str:
        """Get node role (AUDIO-NODE, MANAGEMENT-NODE, STANDBY-MANAGEMENT)"""
        if not self.config:
            self._load_or_create_config()
        return self.config.role
    
    def get_capabilities(self) -> NodeCapabilities:
        """Get hardware capabilities"""
        if not self.config:
            self._load_or_create_config()
        return self.config.capabilities
    
    def promote_to_management(self):
        """Promote node from AUDIO-NODE to MANAGEMENT-NODE"""
        if not self.config:
            self._load_or_create_config()
        
        if self.config.role == "AUDIO-NODE":
            self.config.role = "MANAGEMENT-NODE"
            self.config.updated_at = datetime.utcnow().isoformat()
            self._save_config()
            logger.info(f"Promoted node to MANAGEMENT-NODE")
    
    def set_as_standby(self):
        """Mark this MANAGEMENT-NODE as standby"""
        if not self.config:
            self._load_or_create_config()
        
        if self.config.role == "MANAGEMENT-NODE":
            self.config.role = "STANDBY-MANAGEMENT"
            self.config.updated_at = datetime.utcnow().isoformat()
            self._save_config()
            logger.info(f"Marked node as STANDBY-MANAGEMENT")
    
    def _save_config(self):
        """Save configuration to file"""
        self.CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(self.CONFIG_PATH, 'w') as f:
            json.dump(self.config.to_dict(), f, indent=2)
        os.chmod(self.CONFIG_PATH, 0o644)
        logger.info(f"Saved node config to {self.CONFIG_PATH}")


# Singleton instance
_enhanced_node_identity: Optional[EnhancedNodeIdentity] = None

def get_enhanced_node_identity() -> EnhancedNodeIdentity:
    """Get or create the enhanced node identity singleton"""
    global _enhanced_node_identity
    if _enhanced_node_identity is None:
        _enhanced_node_identity = EnhancedNodeIdentity()
    return _enhanced_node_identity
