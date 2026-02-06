"""
MAP2 Audio Cluster - Secret Management System

Centralized secret storage with encryption, rotation, and access control.
Stores API keys, database passwords, certificates, and other sensitive data.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
import json
import base64
import os
from enum import Enum
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2
import logging

logger = logging.getLogger(__name__)


class SecretType(Enum):
    """Types of secrets that can be stored."""
    API_KEY = "api_key"
    PASSWORD = "password"
    DATABASE_URL = "database_url"
    CERTIFICATE = "certificate"
    PRIVATE_KEY = "private_key"
    TOKEN = "token"
    GENERIC = "generic"


class AccessLevel(Enum):
    """Access levels for secrets."""
    PUBLIC = "public"          # Anyone can read
    INTERNAL = "internal"      # Cluster nodes only
    ADMIN = "admin"           # Admin users only
    SYSTEM = "system"          # System processes only


@dataclass
class Secret:
    """A stored secret."""
    name: str
    secret_type: SecretType
    encrypted_value: str
    access_level: AccessLevel
    created_at: str
    updated_at: str
    expires_at: Optional[str] = None
    rotation_days: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self, include_value: bool = False) -> Dict:
        """Convert to dictionary."""
        data = {
            "name": self.name,
            "type": self.secret_type.value,
            "access_level": self.access_level.value,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "expires_at": self.expires_at,
            "rotation_days": self.rotation_days,
            "metadata": self.metadata
        }
        if include_value:
            data["encrypted_value"] = self.encrypted_value
        return data
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'Secret':
        """Create from dictionary."""
        return cls(
            name=data["name"],
            secret_type=SecretType(data["type"]),
            encrypted_value=data["encrypted_value"],
            access_level=AccessLevel(data["access_level"]),
            created_at=data["created_at"],
            updated_at=data["updated_at"],
            expires_at=data.get("expires_at"),
            rotation_days=data.get("rotation_days"),
            metadata=data.get("metadata", {})
        )


class SecretEncryption:
    """
    Handles encryption/decryption of secrets.
    
    Uses Fernet (symmetric encryption) with a master key derived
    from a password using PBKDF2.
    """
    
    def __init__(self, master_password: Optional[str] = None):
        """
        Initialize encryption.
        
        Args:
            master_password: Master password for encryption key derivation
        """
        if master_password is None:
            # Try to get from environment
            master_password = os.environ.get("MAP2_SECRETS_MASTER_PASSWORD")
            if not master_password:
                raise ValueError(
                    "Master password required. Set MAP2_SECRETS_MASTER_PASSWORD "
                    "environment variable or provide master_password parameter."
                )
        
        self.master_password = master_password
        self.salt = self._get_or_create_salt()
        self.cipher = self._derive_cipher()
    
    def _get_or_create_salt(self) -> bytes:
        """Get or create encryption salt."""
        salt_file = Path("/var/lib/map2/secrets_salt")
        salt_file.parent.mkdir(parents=True, exist_ok=True)
        
        if salt_file.exists():
            with open(salt_file, 'rb') as f:
                return f.read()
        else:
            # Generate new salt
            salt = os.urandom(32)
            with open(salt_file, 'wb') as f:
                f.write(salt)
            # Secure the salt file
            os.chmod(salt_file, 0o600)
            return salt
    
    def _derive_cipher(self) -> Fernet:
        """Derive Fernet cipher from master password."""
        kdf = PBKDF2(
            algorithm=hashes.SHA256(),
            length=32,
            salt=self.salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(
            kdf.derive(self.master_password.encode())
        )
        return Fernet(key)
    
    def encrypt(self, plaintext: str) -> str:
        """Encrypt plaintext."""
        encrypted = self.cipher.encrypt(plaintext.encode())
        return base64.b64encode(encrypted).decode()
    
    def decrypt(self, encrypted_text: str) -> str:
        """Decrypt ciphertext."""
        encrypted = base64.b64decode(encrypted_text.encode())
        decrypted = self.cipher.decrypt(encrypted)
        return decrypted.decode()


class SecretsManager:
    """
    Centralized secret management.
    
    Features:
    - Encrypted storage
    - Access control
    - Secret rotation
    - Expiration
    - Audit logging
    """
    
    def __init__(
        self, 
        storage_path: str = "/var/lib/map2/secrets.json",
        master_password: Optional[str] = None
    ):
        """
        Initialize secrets manager.
        
        Args:
            storage_path: Path to encrypted secrets storage
            master_password: Master encryption password
        """
        self.storage_path = Path(storage_path)
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        
        self.encryption = SecretEncryption(master_password)
        self.secrets: Dict[str, Secret] = {}
        
        # Load existing secrets
        self._load_secrets()
    
    def _load_secrets(self) -> None:
        """Load secrets from encrypted storage."""
        if not self.storage_path.exists():
            logger.info("No existing secrets storage found")
            return
        
        try:
            with open(self.storage_path, 'r') as f:
                data = json.load(f)
            
            for secret_data in data.get("secrets", []):
                secret = Secret.from_dict(secret_data)
                self.secrets[secret.name] = secret
            
            logger.info(f"Loaded {len(self.secrets)} secrets from storage")
            
        except Exception as e:
            logger.error(f"Failed to load secrets: {str(e)}")
            raise
    
    def _save_secrets(self) -> None:
        """Save secrets to encrypted storage."""
        try:
            data = {
                "version": "1.0",
                "updated_at": datetime.now().isoformat(),
                "secrets": [
                    secret.to_dict(include_value=True)
                    for secret in self.secrets.values()
                ]
            }
            
            with open(self.storage_path, 'w') as f:
                json.dump(data, f, indent=2)
            
            # Secure the storage file
            os.chmod(self.storage_path, 0o600)
            
            logger.debug(f"Saved {len(self.secrets)} secrets to storage")
            
        except Exception as e:
            logger.error(f"Failed to save secrets: {str(e)}")
            raise
    
    def store_secret(
        self,
        name: str,
        value: str,
        secret_type: SecretType = SecretType.GENERIC,
        access_level: AccessLevel = AccessLevel.INTERNAL,
        expires_days: Optional[int] = None,
        rotation_days: Optional[int] = None,
        metadata: Optional[Dict] = None
    ) -> None:
        """
        Store a new secret or update existing one.
        
        Args:
            name: Secret identifier
            value: Secret value (will be encrypted)
            secret_type: Type of secret
            access_level: Access control level
            expires_days: Days until expiration (optional)
            rotation_days: Days between rotations (optional)
            metadata: Additional metadata
        """
        # Encrypt the value
        encrypted_value = self.encryption.encrypt(value)
        
        now = datetime.now()
        expires_at = None
        if expires_days:
            expires_at = (now + timedelta(days=expires_days)).isoformat()
        
        if name in self.secrets:
            # Update existing secret
            secret = self.secrets[name]
            secret.encrypted_value = encrypted_value
            secret.updated_at = now.isoformat()
            secret.expires_at = expires_at
            secret.rotation_days = rotation_days
            if metadata:
                secret.metadata.update(metadata)
            
            logger.info(f"Updated secret: {name}")
        else:
            # Create new secret
            secret = Secret(
                name=name,
                secret_type=secret_type,
                encrypted_value=encrypted_value,
                access_level=access_level,
                created_at=now.isoformat(),
                updated_at=now.isoformat(),
                expires_at=expires_at,
                rotation_days=rotation_days,
                metadata=metadata or {}
            )
            self.secrets[name] = secret
            
            logger.info(f"Stored new secret: {name} (type: {secret_type.value})")
        
        # Save to disk
        self._save_secrets()
    
    def get_secret(
        self, 
        name: str,
        requester_role: Optional[str] = None
    ) -> Optional[str]:
        """
        Retrieve and decrypt a secret.
        
        Args:
            name: Secret identifier
            requester_role: Role of requester (for access control)
        
        Returns:
            Decrypted secret value or None if not found/unauthorized
        """
        if name not in self.secrets:
            logger.warning(f"Secret not found: {name}")
            return None
        
        secret = self.secrets[name]
        
        # Check access level
        if not self._check_access(secret, requester_role):
            logger.warning(f"Access denied to secret {name} for role {requester_role}")
            return None
        
        # Check expiration
        if secret.expires_at:
            expires = datetime.fromisoformat(secret.expires_at)
            if datetime.now() > expires:
                logger.warning(f"Secret expired: {name}")
                return None
        
        # Decrypt and return
        try:
            return self.encryption.decrypt(secret.encrypted_value)
        except Exception as e:
            logger.error(f"Failed to decrypt secret {name}: {str(e)}")
            return None
    
    def _check_access(self, secret: Secret, requester_role: Optional[str]) -> bool:
        """Check if requester has access to secret."""
        # Public secrets - everyone can access
        if secret.access_level == AccessLevel.PUBLIC:
            return True
        
        # No role provided - deny access to protected secrets
        if requester_role is None:
            return False
        
        # Admin role - can access everything
        if requester_role == "admin":
            return True
        
        # System role - can access system and internal secrets
        if requester_role == "system":
            return secret.access_level in [AccessLevel.SYSTEM, AccessLevel.INTERNAL]
        
        # Internal role - can access internal secrets
        if requester_role == "internal":
            return secret.access_level == AccessLevel.INTERNAL
        
        return False
    
    def delete_secret(self, name: str) -> bool:
        """
        Delete a secret.
        
        Args:
            name: Secret identifier
        
        Returns:
            True if deleted
        """
        if name not in self.secrets:
            return False
        
        del self.secrets[name]
        self._save_secrets()
        
        logger.info(f"Deleted secret: {name}")
        return True
    
    def list_secrets(
        self, 
        secret_type: Optional[SecretType] = None,
        include_expired: bool = False
    ) -> List[Dict]:
        """
        List all secrets (metadata only, not values).
        
        Args:
            secret_type: Filter by type (optional)
            include_expired: Include expired secrets
        
        Returns:
            List of secret metadata
        """
        results = []
        now = datetime.now()
        
        for secret in self.secrets.values():
            # Filter by type
            if secret_type and secret.secret_type != secret_type:
                continue
            
            # Check expiration
            if not include_expired and secret.expires_at:
                expires = datetime.fromisoformat(secret.expires_at)
                if now > expires:
                    continue
            
            results.append(secret.to_dict(include_value=False))
        
        return results
    
    def rotate_secret(self, name: str, new_value: str) -> bool:
        """
        Rotate a secret to a new value.
        
        Args:
            name: Secret identifier
            new_value: New secret value
        
        Returns:
            True if rotated successfully
        """
        if name not in self.secrets:
            logger.error(f"Cannot rotate non-existent secret: {name}")
            return False
        
        secret = self.secrets[name]
        
        # Encrypt new value
        secret.encrypted_value = self.encryption.encrypt(new_value)
        secret.updated_at = datetime.now().isoformat()
        
        # Update expiration if rotation days configured
        if secret.rotation_days:
            expires = datetime.now() + timedelta(days=secret.rotation_days)
            secret.expires_at = expires.isoformat()
        
        self._save_secrets()
        
        logger.info(f"Rotated secret: {name}")
        return True
    
    def get_secrets_needing_rotation(self) -> List[str]:
        """
        Get list of secrets that need rotation.
        
        Returns:
            List of secret names
        """
        needs_rotation = []
        now = datetime.now()
        
        for name, secret in self.secrets.items():
            if not secret.rotation_days:
                continue
            
            updated = datetime.fromisoformat(secret.updated_at)
            rotation_due = updated + timedelta(days=secret.rotation_days)
            
            if now >= rotation_due:
                needs_rotation.append(name)
        
        return needs_rotation
    
    def export_secrets(self, output_path: str, password: str) -> None:
        """
        Export secrets to encrypted file.
        
        Args:
            output_path: Output file path
            password: Export encryption password
        """
        # Create new encryption with export password
        export_encryption = SecretEncryption(password)
        
        # Re-encrypt all secrets with export password
        export_data = {
            "version": "1.0",
            "exported_at": datetime.now().isoformat(),
            "secrets": []
        }
        
        for secret in self.secrets.values():
            # Decrypt with current master key
            plaintext = self.encryption.decrypt(secret.encrypted_value)
            
            # Re-encrypt with export password
            export_encrypted = export_encryption.encrypt(plaintext)
            
            secret_data = secret.to_dict(include_value=False)
            secret_data["encrypted_value"] = export_encrypted
            export_data["secrets"].append(secret_data)
        
        # Write export file
        with open(output_path, 'w') as f:
            json.dump(export_data, f, indent=2)
        
        logger.info(f"Exported {len(self.secrets)} secrets to {output_path}")


# =========================================================================
# Global Instance
# =========================================================================

# Global secrets manager (initialized by application)
secrets_manager: Optional[SecretsManager] = None


def init_secrets_manager(
    storage_path: str = "/var/lib/map2/secrets.json",
    master_password: Optional[str] = None
) -> SecretsManager:
    """
    Initialize global secrets manager.
    
    Args:
        storage_path: Path to secrets storage
        master_password: Master encryption password
    
    Returns:
        SecretsManager instance
    """
    global secrets_manager
    
    secrets_manager = SecretsManager(storage_path, master_password)
    logger.info("Secrets manager initialized")
    
    return secrets_manager


def get_secret(name: str, requester_role: Optional[str] = None) -> Optional[str]:
    """Convenience function to get secret."""
    if secrets_manager is None:
        raise RuntimeError("Secrets manager not initialized")
    return secrets_manager.get_secret(name, requester_role)


def store_secret(name: str, value: str, **kwargs) -> None:
    """Convenience function to store secret."""
    if secrets_manager is None:
        raise RuntimeError("Secrets manager not initialized")
    secrets_manager.store_secret(name, value, **kwargs)


# =========================================================================
# CLI/Testing
# =========================================================================

if __name__ == "__main__":
    import sys
    import argparse
    
    parser = argparse.ArgumentParser(description="MAP2 Secrets Manager")
    parser.add_argument("action", choices=["store", "get", "list", "delete", "rotate"])
    parser.add_argument("--name", help="Secret name")
    parser.add_argument("--value", help="Secret value")
    parser.add_argument("--type", default="generic", help="Secret type")
    parser.add_argument("--access", default="internal", help="Access level")
    parser.add_argument("--role", help="Requester role")
    parser.add_argument("--password", help="Master password")
    
    args = parser.parse_args()
    
    # Initialize manager
    manager = SecretsManager(master_password=args.password)
    
    if args.action == "store":
        if not args.name or not args.value:
            print("Error: --name and --value required for store")
            sys.exit(1)
        
        manager.store_secret(
            name=args.name,
            value=args.value,
            secret_type=SecretType(args.type),
            access_level=AccessLevel(args.access)
        )
        print(f"✓ Stored secret: {args.name}")
    
    elif args.action == "get":
        if not args.name:
            print("Error: --name required for get")
            sys.exit(1)
        
        value = manager.get_secret(args.name, args.role)
        if value:
            print(f"{args.name}: {value}")
        else:
            print(f"Secret not found or access denied: {args.name}")
            sys.exit(1)
    
    elif args.action == "list":
        secrets = manager.list_secrets()
        print(f"Secrets ({len(secrets)}):")
        for secret in secrets:
            print(f"  • {secret['name']} ({secret['type']}) - {secret['access_level']}")
    
    elif args.action == "delete":
        if not args.name:
            print("Error: --name required for delete")
            sys.exit(1)
        
        if manager.delete_secret(args.name):
            print(f"✓ Deleted secret: {args.name}")
        else:
            print(f"Secret not found: {args.name}")
            sys.exit(1)
    
    elif args.action == "rotate":
        if not args.name or not args.value:
            print("Error: --name and --value required for rotate")
            sys.exit(1)
        
        if manager.rotate_secret(args.name, args.value):
            print(f"✓ Rotated secret: {args.name}")
        else:
            print(f"Failed to rotate secret: {args.name}")
            sys.exit(1)
