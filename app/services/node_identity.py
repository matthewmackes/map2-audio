"""
Node Identity and SSH Trust Configuration

Manages:
- Node ID generation (AUDIO-NODE-<ID4> / CONTROL-NODE-<ID4>)
- SSH key distribution
- Peer trust establishment
- Identity verification
"""

import subprocess
import logging
import json
import os
from pathlib import Path
from typing import Dict, List, Optional
import socket
import hashlib

logger = logging.getLogger(__name__)


class NodeIdentity:
    """
    Manages node identity in the cluster.
    
    Each node has:
    - Unique ID (AUDIO-NODE-<4-char-hex> or CONTROL-NODE-<4-char-hex>)
    - SSH public/private key pair
    - List of trusted peer nodes
    """
    
    def __init__(self, mode: str = "AUDIO-NODE", config_dir: str = "/etc/map2"):
        self.mode = mode  # AUDIO-NODE or CONTROL-NODE
        self.config_dir = Path(config_dir)
        self.identity_file = self.config_dir / "node-identity.json"
        self.ssh_dir = Path.home() / ".ssh"
        
        # Load or create identity
        self._load_or_create_identity()
    
    def _generate_node_id(self) -> str:
        """Generate unique node ID based on hostname hash"""
        hostname = socket.gethostname()
        # Hash hostname and take first 4 chars (base 16)
        hash_digest = hashlib.md5(hostname.encode()).hexdigest()[:4]
        return f"{self.mode}-{hash_digest.upper()}"
    
    def _load_or_create_identity(self):
        """Load identity from file or create new one"""
        if self.identity_file.exists():
            with open(self.identity_file, 'r') as f:
                data = json.load(f)
                self.node_id = data.get('node_id')
                self.ssh_public_key = data.get('ssh_public_key')
                self.ssh_fingerprint = data.get('ssh_fingerprint')
                self.created_at = data.get('created_at')
                logger.info(f"Loaded node identity: {self.node_id}")
        else:
            self._create_new_identity()
    
    def _create_new_identity(self):
        """Create new node identity"""
        self.node_id = self._generate_node_id()
        
        # Generate SSH key pair
        ssh_key_path = self.ssh_dir / f"map2_{self.node_id}"
        
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.ssh_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate key if doesn't exist
        if not ssh_key_path.exists():
            subprocess.run([
                'ssh-keygen',
                '-t', 'rsa',
                '-b', '4096',
                '-f', str(ssh_key_path),
                '-N', '',  # Empty passphrase
                '-C', f"map2@{self.node_id}"
            ], check=True)
            logger.info(f"Generated SSH key pair for {self.node_id}")
        
        # Read public key
        with open(f"{ssh_key_path}.pub", 'r') as f:
            self.ssh_public_key = f.read().strip()
        
        # Calculate fingerprint
        result = subprocess.run(
            ['ssh-keygen', '-l', '-f', f"{ssh_key_path}.pub"],
            capture_output=True,
            text=True
        )
        self.ssh_fingerprint = result.stdout.strip().split()[1]
        
        # Save identity
        from datetime import datetime
        identity_data = {
            'node_id': self.node_id,
            'mode': self.mode,
            'ssh_public_key': self.ssh_public_key,
            'ssh_fingerprint': self.ssh_fingerprint,
            'created_at': datetime.utcnow().isoformat()
        }
        
        with open(self.identity_file, 'w') as f:
            json.dump(identity_data, f, indent=2)
        
        logger.info(f"Created new node identity: {self.node_id}")
        logger.info(f"SSH fingerprint: {self.ssh_fingerprint}")


class SSHTrustManager:
    """
    Manages SSH trust relationships between cluster nodes.
    
    Handles:
    - Adding/removing trusted nodes
    - Key distribution
    - Verification
    """
    
    def __init__(self, identity: NodeIdentity, trust_dir: str = "/etc/map2/trust"):
        self.identity = identity
        self.trust_dir = Path(trust_dir)
        self.authorized_keys_file = Path.home() / ".ssh" / "authorized_keys"
        
        self.trust_dir.mkdir(parents=True, exist_ok=True)
        self._load_trusted_nodes()
    
    def _load_trusted_nodes(self):
        """Load list of trusted nodes"""
        self.trusted_nodes: Dict[str, Dict] = {}
        
        trust_list = self.trust_dir / "trusted-nodes.json"
        if trust_list.exists():
            with open(trust_list, 'r') as f:
                self.trusted_nodes = json.load(f)
            logger.info(f"Loaded {len(self.trusted_nodes)} trusted nodes")
    
    def _save_trusted_nodes(self):
        """Save trusted nodes list"""
        trust_list = self.trust_dir / "trusted-nodes.json"
        with open(trust_list, 'w') as f:
            json.dump(self.trusted_nodes, f, indent=2)
    
    def add_peer_trust(self, node_id: str, ssh_public_key: str, ssh_fingerprint: str):
        """
        Add a peer node to the trust list.
        
        Args:
            node_id: Unique node ID
            ssh_public_key: SSH public key
            ssh_fingerprint: SSH key fingerprint
        """
        self.trusted_nodes[node_id] = {
            'ssh_public_key': ssh_public_key,
            'ssh_fingerprint': ssh_fingerprint,
            'added_at': __import__('datetime').datetime.utcnow().isoformat()
        }
        
        # Add to authorized_keys
        self._add_to_authorized_keys(node_id, ssh_public_key)
        
        # Save
        self._save_trusted_nodes()
        
        logger.info(f"Added trust for peer: {node_id}")
    
    def _add_to_authorized_keys(self, node_id: str, ssh_public_key: str):
        """Add public key to authorized_keys"""
        # Format: command="...",no-pty ssh-rsa AAAA... map2@NODE-ID
        ssh_line = f'command="map2-ssh-handler {node_id}",no-pty,no-X11-forwarding {ssh_public_key}\n'
        
        self.authorized_keys_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Check if already present
        if self.authorized_keys_file.exists():
            content = self.authorized_keys_file.read_text()
            if node_id in content:
                return  # Already added
        
        # Append to file
        with open(self.authorized_keys_file, 'a') as f:
            f.write(ssh_line)
        
        # Set proper permissions
        self.authorized_keys_file.chmod(0o600)
        self.authorized_keys_file.parent.chmod(0o700)
    
    def remove_peer_trust(self, node_id: str):
        """Remove a peer from trust list"""
        if node_id in self.trusted_nodes:
            del self.trusted_nodes[node_id]
            self._save_trusted_nodes()
            
            # Remove from authorized_keys
            if self.authorized_keys_file.exists():
                content = self.authorized_keys_file.read_text()
                lines = [line for line in content.split('\n') if node_id not in line]
                self.authorized_keys_file.write_text('\n'.join(lines))
            
            logger.info(f"Removed trust for peer: {node_id}")
    
    def get_trusted_nodes(self) -> List[str]:
        """Get list of trusted node IDs"""
        return list(self.trusted_nodes.keys())
    
    def is_trusted(self, node_id: str) -> bool:
        """Check if node is trusted"""
        return node_id in self.trusted_nodes
    
    def verify_peer_identity(self, node_id: str, ssh_fingerprint: str) -> bool:
        """Verify peer identity matches trusted fingerprint"""
        if node_id not in self.trusted_nodes:
            return False
        
        trusted_fp = self.trusted_nodes[node_id].get('ssh_fingerprint')
        return trusted_fp == ssh_fingerprint


# SSH command handler for restricted remote access
SSH_HANDLER_SCRIPT = """#!/bin/bash
# Handler for MAP2 SSH commands from peer nodes
# Restricts peer access to specific operations only

PEER_NODE="${SSH_ORIGINAL_COMMAND%% *}"

case "$SSH_ORIGINAL_COMMAND" in
    "ping"|"health-check")
        # Return health status
        echo "OK $(hostname)"
        ;;
    "reboot")
        # Peer node reboot request (requires auth)
        systemctl reboot
        ;;
    "shutdown")
        # Peer node shutdown request (requires auth)
        systemctl poweroff
        ;;
    "status")
        # Return node status
        echo "NODE_ID=$(cat /etc/map2/node-identity.json | grep node_id)"
        echo "UPTIME=$(uptime -p)"
        echo "LOAD=$(cat /proc/loadavg)"
        ;;
    *)
        echo "Unknown command: $SSH_ORIGINAL_COMMAND" >&2
        exit 1
        ;;
esac
"""


def setup_ssh_handler():
    """Setup SSH command handler script"""
    handler_path = Path("/usr/local/bin/map2-ssh-handler")
    handler_path.write_text(SSH_HANDLER_SCRIPT)
    handler_path.chmod(0o755)
    logger.info("SSH handler script installed")
