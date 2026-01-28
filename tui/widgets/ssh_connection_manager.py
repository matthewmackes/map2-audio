"""
SSH Connection Manager for MAP2 Backup System.
Manages SSH connection info, key pairs, and secure file uploads.
"""

import json
import logging
import os
import re
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

logger = logging.getLogger(__name__)


class SSHConnectionError(Exception):
    """Custom exception for SSH connection errors."""
    pass


class SSHHostKeyError(SSHConnectionError):
    """Exception raised when host key verification fails or needs user action."""
    def __init__(self, message: str, host: str = "", fingerprint: str = ""):
        super().__init__(message)
        self.host = host
        self.fingerprint = fingerprint


class SSHConnectionManager:
    """
    Manages SSH connection info and key pairs for backup uploads.

    Features:
    - Secure key pair generation
    - Input sanitization to prevent command injection
    - Host key verification handling
    - Connection testing and file uploads
    """

    # Regex patterns for input validation
    HOSTNAME_PATTERN = re.compile(r'^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$')
    USERNAME_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_\-]*$')
    PATH_PATTERN = re.compile(r'^[a-zA-Z0-9_\-\./~]+$')

    def __init__(self, config_dir: Optional[Path] = None):
        self.config_dir = config_dir or Path.home() / ".map2" / "ssh_backup"
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.key_path = self.config_dir / "id_rsa"
        self.pubkey_path = self.config_dir / "id_rsa.pub"
        self.config_file = self.config_dir / "connections.json"
        self.known_hosts_file = self.config_dir / "known_hosts"

        # Ensure known_hosts file exists
        if not self.known_hosts_file.exists():
            self.known_hosts_file.touch(mode=0o600)

    @staticmethod
    def _sanitize_hostname(hostname: str) -> str:
        """
        Sanitize and validate hostname/IP address.

        Args:
            hostname: The hostname or IP to validate

        Returns:
            Sanitized hostname

        Raises:
            ValueError: If hostname is invalid
        """
        hostname = hostname.strip()

        # Check for empty
        if not hostname:
            raise ValueError("Hostname cannot be empty")

        # Check length
        if len(hostname) > 255:
            raise ValueError("Hostname too long (max 255 characters)")

        # Check for valid characters and format
        # Allow IP addresses and hostnames
        ip_pattern = re.compile(
            r'^(\d{1,3}\.){3}\d{1,3}$|'  # IPv4
            r'^\[?[a-fA-F0-9:]+\]?$'      # IPv6
        )

        if not (SSHConnectionManager.HOSTNAME_PATTERN.match(hostname) or
                ip_pattern.match(hostname)):
            raise ValueError(
                f"Invalid hostname format: {hostname}. "
                "Use alphanumeric characters, dots, and hyphens only."
            )

        return hostname

    @staticmethod
    def _sanitize_username(username: str) -> str:
        """
        Sanitize and validate SSH username.

        Args:
            username: The username to validate

        Returns:
            Sanitized username

        Raises:
            ValueError: If username is invalid
        """
        username = username.strip()

        if not username:
            raise ValueError("Username cannot be empty")

        if len(username) > 32:
            raise ValueError("Username too long (max 32 characters)")

        if not SSHConnectionManager.USERNAME_PATTERN.match(username):
            raise ValueError(
                f"Invalid username format: {username}. "
                "Must start with letter/underscore, contain only alphanumeric, "
                "underscore, or hyphen."
            )

        return username

    @staticmethod
    def _sanitize_port(port: Any) -> int:
        """
        Sanitize and validate SSH port number.

        Args:
            port: The port to validate

        Returns:
            Validated port number

        Raises:
            ValueError: If port is invalid
        """
        try:
            port = int(port)
        except (TypeError, ValueError):
            raise ValueError(f"Invalid port: {port}. Must be a number.")

        if not (1 <= port <= 65535):
            raise ValueError(f"Port {port} out of range. Must be 1-65535.")

        return port

    @staticmethod
    def _sanitize_path(path: str) -> str:
        """
        Sanitize and validate remote destination path.

        Args:
            path: The path to validate

        Returns:
            Sanitized path

        Raises:
            ValueError: If path is invalid
        """
        path = path.strip()

        if not path:
            raise ValueError("Destination path cannot be empty")

        if len(path) > 4096:
            raise ValueError("Path too long (max 4096 characters)")

        # Check for shell metacharacters that could be dangerous
        dangerous_chars = [';', '&', '|', '$', '`', '(', ')', '{', '}',
                          '<', '>', '!', '\n', '\r', '\0']
        for char in dangerous_chars:
            if char in path:
                raise ValueError(
                    f"Path contains invalid character: '{char}'. "
                    "Use only alphanumeric characters, slashes, dots, "
                    "underscores, hyphens, and tildes."
                )

        if not SSHConnectionManager.PATH_PATTERN.match(path):
            raise ValueError(
                f"Invalid path format: {path}. "
                "Use only alphanumeric characters, slashes, dots, "
                "underscores, hyphens, and tildes."
            )

        return path

    def key_exists(self) -> bool:
        """Check if SSH key pair exists."""
        return self.key_path.exists() and self.pubkey_path.exists()

    def generate_key_pair(self, comment: str = "map2-backup") -> bool:
        """
        Generate a new SSH key pair if one doesn't exist.

        Args:
            comment: Comment to add to the key

        Returns:
            True if key was generated, False if it already existed

        Raises:
            SSHConnectionError: If key generation fails
        """
        if self.key_exists():
            logger.info("SSH key pair already exists")
            return False

        try:
            result = subprocess.run(
                [
                    "ssh-keygen",
                    "-t", "ed25519",  # Use Ed25519 (more secure than RSA)
                    "-N", "",         # No passphrase
                    "-C", comment,
                    "-f", str(self.key_path)
                ],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode != 0:
                raise SSHConnectionError(
                    f"ssh-keygen failed: {result.stderr}"
                )

            # Set secure permissions
            os.chmod(self.key_path, 0o600)
            os.chmod(self.pubkey_path, 0o644)

            logger.info("SSH key pair generated successfully")
            return True

        except subprocess.TimeoutExpired:
            raise SSHConnectionError("SSH key generation timed out")
        except FileNotFoundError:
            raise SSHConnectionError("ssh-keygen not found. Is OpenSSH installed?")
        except Exception as e:
            raise SSHConnectionError(f"Failed to generate SSH key: {e}")

    def get_public_key(self) -> Optional[str]:
        """Get the public key content."""
        if self.pubkey_path.exists():
            return self.pubkey_path.read_text().strip()
        return None

    def get_private_key_path(self) -> Path:
        """Get the path to the private key."""
        return self.key_path

    def save_connection(self, name: str, host: str, user: str,
                       port: int, dest_path: str) -> None:
        """
        Save a connection configuration.

        All inputs are sanitized before saving.

        Args:
            name: Connection name
            host: Remote hostname or IP
            user: SSH username
            port: SSH port
            dest_path: Remote destination path for backups

        Raises:
            ValueError: If any input fails validation
        """
        # Sanitize all inputs
        name = name.strip()
        if not name or not re.match(r'^[a-zA-Z0-9_\-]+$', name):
            raise ValueError("Connection name must be alphanumeric with underscores/hyphens")

        host = self._sanitize_hostname(host)
        user = self._sanitize_username(user)
        port = self._sanitize_port(port)
        dest_path = self._sanitize_path(dest_path)

        connections = self.load_connections()
        connections[name] = {
            "host": host,
            "user": user,
            "port": port,
            "dest_path": dest_path
        }

        self.config_file.write_text(json.dumps(connections, indent=2))
        logger.info(f"Saved SSH connection: {name}")

    def load_connections(self) -> Dict[str, Dict[str, Any]]:
        """Load all saved connections."""
        if self.config_file.exists():
            try:
                return json.loads(self.config_file.read_text())
            except json.JSONDecodeError:
                logger.error("Corrupted connections.json, returning empty")
                return {}
        return {}

    def remove_connection(self, name: str) -> bool:
        """
        Remove a saved connection.

        Returns:
            True if connection was removed, False if it didn't exist
        """
        connections = self.load_connections()
        if name in connections:
            del connections[name]
            self.config_file.write_text(json.dumps(connections, indent=2))
            logger.info(f"Removed SSH connection: {name}")
            return True
        return False

    def get_host_key_fingerprint(self, host: str, port: int = 22) -> Optional[str]:
        """
        Get the SSH host key fingerprint from a remote server.

        Args:
            host: Remote hostname
            port: SSH port

        Returns:
            Host key fingerprint string, or None on error
        """
        host = self._sanitize_hostname(host)
        port = self._sanitize_port(port)

        try:
            result = subprocess.run(
                [
                    "ssh-keyscan",
                    "-p", str(port),
                    "-t", "ed25519,rsa,ecdsa",
                    host
                ],
                capture_output=True,
                text=True,
                timeout=15
            )

            if result.returncode == 0 and result.stdout.strip():
                # Get fingerprint from the key
                fingerprint_result = subprocess.run(
                    ["ssh-keygen", "-lf", "-"],
                    input=result.stdout,
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if fingerprint_result.returncode == 0:
                    return fingerprint_result.stdout.strip()

            return None

        except Exception as e:
            logger.error(f"Failed to get host key fingerprint: {e}")
            return None

    def add_host_to_known_hosts(self, host: str, port: int = 22) -> Tuple[bool, str]:
        """
        Add a host's key to our known_hosts file (accept the host key).

        This is the equivalent of answering "yes" to the SSH prompt.

        Args:
            host: Remote hostname
            port: SSH port

        Returns:
            Tuple of (success, message)
        """
        host = self._sanitize_hostname(host)
        port = self._sanitize_port(port)

        try:
            # Get the host key
            result = subprocess.run(
                [
                    "ssh-keyscan",
                    "-p", str(port),
                    "-t", "ed25519,rsa,ecdsa",
                    host
                ],
                capture_output=True,
                text=True,
                timeout=15
            )

            if result.returncode != 0 or not result.stdout.strip():
                return False, f"Could not retrieve host key from {host}:{port}"

            host_keys = result.stdout.strip()

            # Read existing known_hosts
            existing_keys = ""
            if self.known_hosts_file.exists():
                existing_keys = self.known_hosts_file.read_text()

            # Check if host is already in known_hosts
            host_pattern = f"{host}" if port == 22 else f"[{host}]:{port}"
            if host_pattern in existing_keys:
                return True, f"Host {host} already in known_hosts"

            # Append new host key
            with open(self.known_hosts_file, 'a') as f:
                # Handle non-standard ports
                if port != 22:
                    # Reformat keys for non-standard port
                    formatted_keys = []
                    for line in host_keys.split('\n'):
                        if line.strip():
                            parts = line.split(' ', 1)
                            if len(parts) == 2:
                                formatted_keys.append(f"[{host}]:{port} {parts[1]}")
                    host_keys = '\n'.join(formatted_keys)

                f.write(host_keys + '\n')

            logger.info(f"Added host key for {host}:{port} to known_hosts")
            return True, f"Host key for {host} added to known_hosts"

        except subprocess.TimeoutExpired:
            return False, f"Timeout connecting to {host}:{port}"
        except Exception as e:
            logger.error(f"Failed to add host to known_hosts: {e}")
            return False, f"Error adding host key: {e}"

    def remove_host_from_known_hosts(self, host: str, port: int = 22) -> bool:
        """
        Remove a host from known_hosts (useful if host key changed).

        Args:
            host: Remote hostname
            port: SSH port

        Returns:
            True if removed, False otherwise
        """
        host = self._sanitize_hostname(host)
        port = self._sanitize_port(port)

        if not self.known_hosts_file.exists():
            return False

        try:
            host_pattern = host if port == 22 else f"[{host}]:{port}"

            lines = self.known_hosts_file.read_text().split('\n')
            new_lines = [line for line in lines
                        if not line.startswith(host_pattern)]

            if len(new_lines) < len(lines):
                self.known_hosts_file.write_text('\n'.join(new_lines))
                logger.info(f"Removed {host}:{port} from known_hosts")
                return True

            return False

        except Exception as e:
            logger.error(f"Failed to remove host from known_hosts: {e}")
            return False

    def test_connection(self, name: str,
                       accept_new_host_key: bool = False) -> Tuple[bool, str]:
        """
        Test SSH connection to a saved server.

        Args:
            name: Connection name
            accept_new_host_key: If True, automatically accept new host keys

        Returns:
            Tuple of (success, message)
        """
        connections = self.load_connections()
        if name not in connections:
            return False, f"Connection '{name}' not found"

        info = connections[name]

        # Validate stored values (in case config was manually edited)
        try:
            host = self._sanitize_hostname(info['host'])
            user = self._sanitize_username(info['user'])
            port = self._sanitize_port(info['port'])
        except ValueError as e:
            return False, f"Invalid connection config: {e}"

        # Check if we need to add the host key first
        if accept_new_host_key:
            success, msg = self.add_host_to_known_hosts(host, port)
            if not success:
                logger.warning(f"Could not add host key: {msg}")

        # Build SSH command with our custom known_hosts
        cmd = [
            "ssh",
            "-i", str(self.key_path),
            "-o", f"UserKnownHostsFile={self.known_hosts_file}",
            "-o", "StrictHostKeyChecking=yes",  # Require host in known_hosts
            "-o", "BatchMode=yes",               # No interactive prompts
            "-o", "ConnectTimeout=10",
            "-p", str(port),
            f"{user}@{host}",
            "echo", "MAP2_CONNECTION_OK"
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=15
            )

            if result.returncode == 0 and "MAP2_CONNECTION_OK" in result.stdout:
                return True, "Connection successful"

            # Check for host key issues
            stderr = result.stderr.lower()
            if "host key verification failed" in stderr:
                fingerprint = self.get_host_key_fingerprint(host, port)
                return False, (
                    f"Host key verification failed for {host}.\n"
                    f"Fingerprint: {fingerprint or 'unknown'}\n"
                    "Use 'Accept Host Key' to trust this server."
                )

            if "permission denied" in stderr:
                pubkey = self.get_public_key()
                return False, (
                    f"Authentication failed. Ensure this public key is in "
                    f"~/.ssh/authorized_keys on {host}:\n\n{pubkey}"
                )

            if "connection refused" in stderr:
                return False, f"Connection refused by {host}:{port}. Is SSH running?"

            if "no route to host" in stderr or "network is unreachable" in stderr:
                return False, f"Cannot reach {host}. Check network connectivity."

            if "connection timed out" in stderr:
                return False, f"Connection to {host}:{port} timed out."

            return False, f"Connection failed: {result.stderr.strip()}"

        except subprocess.TimeoutExpired:
            return False, f"Connection to {host}:{port} timed out"
        except FileNotFoundError:
            return False, "SSH client not found. Is OpenSSH installed?"
        except Exception as e:
            logger.error(f"SSH test connection error: {e}")
            return False, f"Connection error: {e}"

    def upload_file(self, name: str, local_path: str,
                   accept_new_host_key: bool = False) -> Tuple[bool, str]:
        """
        Upload a file to the remote server via SCP.

        Args:
            name: Connection name
            local_path: Path to local file to upload
            accept_new_host_key: If True, automatically accept new host keys

        Returns:
            Tuple of (success, message)
        """
        connections = self.load_connections()
        if name not in connections:
            return False, f"Connection '{name}' not found"

        info = connections[name]

        # Validate stored values
        try:
            host = self._sanitize_hostname(info['host'])
            user = self._sanitize_username(info['user'])
            port = self._sanitize_port(info['port'])
            dest_path = self._sanitize_path(info['dest_path'])
        except ValueError as e:
            return False, f"Invalid connection config: {e}"

        # Validate local file exists
        local_file = Path(local_path)
        if not local_file.exists():
            return False, f"Local file not found: {local_path}"

        if not local_file.is_file():
            return False, f"Not a file: {local_path}"

        # Add host key if requested
        if accept_new_host_key:
            self.add_host_to_known_hosts(host, port)

        # Build SCP command
        dest = f"{user}@{host}:{dest_path}"
        cmd = [
            "scp",
            "-i", str(self.key_path),
            "-o", f"UserKnownHostsFile={self.known_hosts_file}",
            "-o", "StrictHostKeyChecking=yes",
            "-o", "BatchMode=yes",
            "-P", str(port),
            str(local_file),
            dest
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5 minutes for large files
            )

            if result.returncode == 0:
                return True, f"Uploaded {local_file.name} to {host}:{dest_path}"

            stderr = result.stderr.lower()
            if "host key verification failed" in stderr:
                return False, (
                    f"Host key verification failed. "
                    "Use 'Accept Host Key' first."
                )

            if "permission denied" in stderr:
                return False, "Permission denied. Check SSH key authorization."

            return False, f"Upload failed: {result.stderr.strip()}"

        except subprocess.TimeoutExpired:
            return False, "Upload timed out (exceeded 5 minutes)"
        except FileNotFoundError:
            return False, "SCP not found. Is OpenSSH installed?"
        except Exception as e:
            logger.error(f"SCP upload error: {e}")
            return False, f"Upload error: {e}"
