"""
SSH Trust Management API

Endpoints for:
- GET /api/ssh/keys - Get local SSH keys
- POST /api/ssh/keys/generate - Generate new SSH key pair
- POST /api/ssh/trust/add - Add peer to trusted list
- POST /api/ssh/trust/remove - Remove peer from trusted list
- GET /api/ssh/trust/status - Get trust status with peers
- POST /api/ssh/keys/distribute - Distribute public key to peer
"""

import asyncio
import logging
import subprocess
from typing import List, Dict, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path

from app.services.node_identity import NodeIdentity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ssh", tags=["SSH Trust"])


class SSHKeyResponse(BaseModel):
    """SSH key information"""
    node_id: str
    fingerprint: str
    public_key: str
    key_path: str
    created_at: Optional[str] = None


class PeerTrustResponse(BaseModel):
    """Peer trust status"""
    peer_id: str
    trusted: bool
    fingerprint: Optional[str] = None
    trusted_at: Optional[str] = None


class GenerateKeyRequest(BaseModel):
    """Request to generate new SSH key"""
    key_type: str = "rsa"
    key_bits: int = 4096


class AddTrustRequest(BaseModel):
    """Request to trust a peer"""
    peer_id: str
    peer_public_key: str


class DistributeKeyRequest(BaseModel):
    """Request to distribute public key to peer"""
    peer_id: str
    peer_host: str
    peer_user: str = "mm"


class TrustStatusResponse(BaseModel):
    """Overall SSH trust status"""
    local_node_id: str
    local_fingerprint: str
    trusted_peers: List[PeerTrustResponse]
    untrusted_peers: List[str] = []


# SSH trust configuration directory
TRUST_DIR = Path.home() / ".map2" / "ssh_trust"
AUTHORIZED_KEYS_FILE = Path.home() / ".ssh" / "authorized_keys"


def _ensure_trust_dir():
    """Create trust directory if it doesn't exist"""
    TRUST_DIR.mkdir(parents=True, exist_ok=True)


def _get_node_identity() -> NodeIdentity:
    """Get node identity"""
    return NodeIdentity()


def _read_trusted_peers() -> Dict[str, Dict]:
    """Read trusted peers from disk"""
    _ensure_trust_dir()
    
    trusted_peers = {}
    trust_file = TRUST_DIR / "trusted_peers.json"
    
    if trust_file.exists():
        import json
        with open(trust_file, 'r') as f:
            trusted_peers = json.load(f)
    
    return trusted_peers


def _write_trusted_peers(peers: Dict[str, Dict]):
    """Write trusted peers to disk"""
    _ensure_trust_dir()
    
    import json
    trust_file = TRUST_DIR / "trusted_peers.json"
    with open(trust_file, 'w') as f:
        json.dump(peers, f, indent=2)


@router.get("/keys", response_model=SSHKeyResponse)
async def get_ssh_keys():
    """Get current node's SSH keys"""
    identity = _get_node_identity()
    
    return SSHKeyResponse(
        node_id=identity.node_id,
        fingerprint=identity.ssh_fingerprint,
        public_key=identity.ssh_public_key,
        key_path=str(Path.home() / ".ssh" / f"map2_{identity.node_id}"),
        created_at=identity.created_at,
    )


@router.post("/keys/generate", response_model=SSHKeyResponse)
async def generate_ssh_keys(request: GenerateKeyRequest):
    """Generate new SSH key pair"""
    identity = _get_node_identity()
    
    ssh_key_path = Path.home() / ".ssh" / f"map2_{identity.node_id}_new"
    
    # Generate new key
    try:
        await asyncio.to_thread(subprocess.run,[
            'ssh-keygen',
            '-t', request.key_type,
            '-b', str(request.key_bits),
            '-f', str(ssh_key_path),
            '-N', '',  # Empty passphrase
            '-C', f"map2@{identity.node_id}",
        ], check=True, capture_output=True)
        
        logger.info(f"Generated new SSH key: {ssh_key_path}")
        
        # Read public key
        with open(f"{ssh_key_path}.pub", 'r') as f:
            public_key = f.read().strip()
        
        # Calculate fingerprint
        result = await asyncio.to_thread(subprocess.run,
            ['ssh-keygen', '-l', '-f', f"{ssh_key_path}.pub"],
            capture_output=True,
            text=True,
            check=True
        )
        fingerprint = result.stdout.strip().split()[1]
        
        return SSHKeyResponse(
            node_id=identity.node_id,
            fingerprint=fingerprint,
            public_key=public_key,
            key_path=str(ssh_key_path),
        )
        
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to generate SSH key: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate SSH key")


@router.post("/trust/add", response_model=PeerTrustResponse)
async def add_peer_trust(request: AddTrustRequest):
    """Add peer to trusted list and configure SSH access"""
    from datetime import datetime
    
    _ensure_trust_dir()
    
    try:
        # Calculate fingerprint of peer's public key
        temp_key_file = TRUST_DIR / f"temp_{request.peer_id}.pub"
        with open(temp_key_file, 'w') as f:
            f.write(request.peer_public_key)
        
        result = await asyncio.to_thread(subprocess.run,
            ['ssh-keygen', '-l', '-f', str(temp_key_file)],
            capture_output=True,
            text=True,
            check=True
        )
        fingerprint = result.stdout.strip().split()[1]
        
        # Add to authorized_keys
        auth_keys_file = AUTHORIZED_KEYS_FILE
        auth_keys_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Check if key already present
        if auth_keys_file.exists():
            with open(auth_keys_file, 'r') as f:
                existing = f.read()
            if request.peer_public_key.strip() not in existing:
                with open(auth_keys_file, 'a') as f:
                    f.write(f"\n{request.peer_public_key.strip()}\n")
        else:
            with open(auth_keys_file, 'w') as f:
                f.write(f"{request.peer_public_key.strip()}\n")
        
        # Update authorized_keys permissions (600)
        auth_keys_file.chmod(0o600)
        
        # Record in trusted peers
        trusted_peers = _read_trusted_peers()
        trusted_peers[request.peer_id] = {
            'fingerprint': fingerprint,
            'public_key': request.peer_public_key,
            'trusted_at': datetime.utcnow().isoformat(),
        }
        _write_trusted_peers(trusted_peers)
        
        # Clean up temp file
        temp_key_file.unlink()
        
        logger.info(f"Added peer {request.peer_id} to trusted list")
        
        return PeerTrustResponse(
            peer_id=request.peer_id,
            trusted=True,
            fingerprint=fingerprint,
            trusted_at=trusted_peers[request.peer_id]['trusted_at'],
        )
        
    except Exception as e:
        logger.error(f"Failed to add peer trust: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add peer trust: {e}")


@router.post("/trust/remove", response_model=PeerTrustResponse)
async def remove_peer_trust(request: Dict[str, str]):
    """Remove peer from trusted list"""
    peer_id = request.get('peer_id')
    if not peer_id:
        raise HTTPException(status_code=400, detail="peer_id required")
    
    try:
        trusted_peers = _read_trusted_peers()
        
        if peer_id not in trusted_peers:
            raise HTTPException(status_code=404, detail=f"Peer {peer_id} not found in trust list")
        
        peer_data = trusted_peers.pop(peer_id)
        _write_trusted_peers(trusted_peers)
        
        # Remove from authorized_keys
        auth_keys_file = AUTHORIZED_KEYS_FILE
        if auth_keys_file.exists():
            with open(auth_keys_file, 'r') as f:
                lines = f.readlines()
            
            filtered_lines = [
                line for line in lines
                if peer_data['public_key'].strip() not in line
            ]
            
            with open(auth_keys_file, 'w') as f:
                f.writelines(filtered_lines)
        
        logger.info(f"Removed peer {peer_id} from trusted list")
        
        return PeerTrustResponse(
            peer_id=peer_id,
            trusted=False,
            fingerprint=peer_data.get('fingerprint'),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to remove peer trust: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove peer trust: {e}")


@router.get("/trust/status", response_model=TrustStatusResponse)
async def get_trust_status():
    """Get SSH trust status"""
    identity = _get_node_identity()
    trusted_peers = _read_trusted_peers()
    
    peer_responses = [
        PeerTrustResponse(
            peer_id=peer_id,
            trusted=True,
            fingerprint=data.get('fingerprint'),
            trusted_at=data.get('trusted_at'),
        )
        for peer_id, data in trusted_peers.items()
    ]
    
    return TrustStatusResponse(
        local_node_id=identity.node_id,
        local_fingerprint=identity.ssh_fingerprint,
        trusted_peers=peer_responses,
    )


@router.post("/keys/distribute")
async def distribute_ssh_key(request: DistributeKeyRequest):
    """Distribute local public key to peer"""
    identity = _get_node_identity()
    
    try:
        # Get public key
        key_file = Path.home() / ".ssh" / f"map2_{identity.node_id}.pub"
        if not key_file.exists():
            raise HTTPException(status_code=404, detail="Local SSH key not found")
        
        with open(key_file, 'r') as f:
            public_key = f.read().strip()
        
        # Try to copy to peer's authorized_keys via SSH
        # This assumes SSH key pair is already set up between hosts
        remote_cmd = (
            f"echo '{public_key}' >> ~/.ssh/authorized_keys && "
            "chmod 600 ~/.ssh/authorized_keys"
        )
        
        result = await asyncio.to_thread(subprocess.run,
            [
                'ssh',
                f"{request.peer_user}@{request.peer_host}",
                remote_cmd,
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        
        if result.returncode != 0:
            error_msg = result.stderr or result.stdout
            raise Exception(f"SSH distribution failed: {error_msg}")
        
        logger.info(f"Distributed SSH key to {request.peer_id}@{request.peer_host}")
        
        return {
            'status': 'success',
            'message': f'Key distributed to {request.peer_id}',
            'peer_id': request.peer_id,
        }
        
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="SSH connection timeout")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to distribute SSH key: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to distribute SSH key: {e}")
