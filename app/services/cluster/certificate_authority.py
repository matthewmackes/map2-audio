"""
Distributed Certificate Authority (CA) System for Cluster mTLS

Provides:
- Self-signed root CA generation on primary management node
- Certificate Signing Request (CSR) handling
- Node certificate issuance
- Automatic renewal at 80% lifetime
- Certificate Revocation List (CRL)
- mTLS setup for all inter-node communication

Uses cryptography library for certificate management.
"""

import json
import logging
from typing import Optional, Tuple
from pathlib import Path
from datetime import datetime, timedelta, timezone
import os

try:
    from cryptography import x509
    from cryptography.x509.oid import NameOID, ExtensionOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.backends import default_backend
    CRYPTOGRAPHY_AVAILABLE = True
except ImportError:
    CRYPTOGRAPHY_AVAILABLE = False
    x509 = None  # type: ignore

logger = logging.getLogger(__name__)
if not CRYPTOGRAPHY_AVAILABLE:
    logger.info("cryptography module not installed — cluster CA disabled")


class ClusterCA:
    """
    Cluster Certificate Authority for managing mTLS certificates.

    Only runs on primary management node. Handles:
    - Root CA generation and storage
    - CSR processing
    - Node certificate issuance
    - Certificate renewal
    - CRL distribution
    """

    CA_DIR = Path("/etc/map2/ssl")
    CA_CERT_PATH = CA_DIR / "ca-cert.pem"
    CA_KEY_PATH = CA_DIR / "ca-key.pem"
    NODE_CERT_FORMAT = "{node_id}-cert.pem"
    NODE_KEY_FORMAT = "{node_id}-key.pem"
    CRL_PATH = CA_DIR / "crl.pem"

    # Certificate parameters
    ROOT_CA_VALIDITY_DAYS = 3650  # 10 years
    NODE_CERT_VALIDITY_DAYS = 365  # 1 year
    RENEWAL_THRESHOLD = 0.80  # Renew at 80% of lifetime

    def __init__(self):
        """Initialize CA system"""
        self.logger = logging.getLogger(__name__)
        self.ca_dir = self.CA_DIR
        self.ca_dir.mkdir(parents=True, exist_ok=True)
        os.chmod(self.ca_dir, 0o700)

    def has_root_ca(self) -> bool:
        """Check if root CA already exists"""
        return self.CA_CERT_PATH.exists() and self.CA_KEY_PATH.exists()

    def generate_root_ca(self) -> bool:
        """
        Generate self-signed root CA certificate and key.

        Returns:
            True if successful
        """
        try:
            if self.has_root_ca():
                self.logger.info("Root CA already exists, skipping generation")
                return True

            self.logger.info("Generating root CA certificate...")

            # Generate CA private key
            ca_key = rsa.generate_private_key(
                public_exponent=65537,
                key_size=4096,
                backend=default_backend(),
            )

            # Create CA certificate subject
            subject = issuer = x509.Name(
                [
                    x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
                    x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "State"),
                    x509.NameAttribute(NameOID.ORGANIZATION_NAME, "MAP2 Audio"),
                    x509.NameAttribute(NameOID.COMMON_NAME, "MAP2 Audio Cluster CA"),
                ]
            )

            # Build CA certificate
            ca_cert = (
                x509.CertificateBuilder()
                .subject_name(subject)
                .issuer_name(issuer)
                .public_key(ca_key.public_key())
                .serial_number(x509.random_serial_number())
                .not_valid_before(datetime.now(timezone.utc))
                .not_valid_after(
                    datetime.now(timezone.utc) + timedelta(days=self.ROOT_CA_VALIDITY_DAYS)
                )
                .add_extension(
                    x509.BasicConstraints(ca=True, path_length=None),
                    critical=True,
                )
                .add_extension(
                    x509.KeyUsage(
                        digital_signature=True,
                        key_cert_sign=True,
                        crl_sign=True,
                        key_encipherment=False,
                        content_commitment=False,
                        data_encipherment=False,
                        key_agreement=False,
                        encipher_only=False,
                        decipher_only=False,
                    ),
                    critical=True,
                )
                .sign(ca_key, hashes.SHA256(), backend=default_backend())
            )

            # Write CA certificate
            with open(self.CA_CERT_PATH, "wb") as f:
                f.write(ca_cert.public_bytes(serialization.Encoding.PEM))
            os.chmod(self.CA_CERT_PATH, 0o644)

            # Write CA private key (highly restricted)
            with open(self.CA_KEY_PATH, "wb") as f:
                f.write(
                    ca_key.private_bytes(
                        encoding=serialization.Encoding.PEM,
                        format=serialization.PrivateFormat.PKCS8,
                        encryption_algorithm=serialization.NoEncryption(),
                    )
                )
            os.chmod(self.CA_KEY_PATH, 0o600)

            self.logger.info("Root CA certificate generated successfully")
            return True

        except Exception as e:
            self.logger.error(f"Failed to generate root CA: {e}", exc_info=True)
            return False

    def issue_node_certificate(
        self, node_id: str, common_name: str, sans: Optional[list] = None
    ) -> bool:
        """
        Issue a certificate for a node.

        Args:
            node_id: Unique node identifier
            common_name: Common name for certificate
            sans: Subject Alternative Names (IP addresses, hostnames)

        Returns:
            True if successful
        """
        try:
            if not self.has_root_ca():
                self.logger.error("Root CA does not exist")
                return False

            self.logger.info(f"Issuing certificate for node: {node_id}")

            # Load CA certificate and key
            with open(self.CA_CERT_PATH, "rb") as f:
                ca_cert_data = f.read()
                ca_cert = x509.load_pem_x509_certificate(
                    ca_cert_data, backend=default_backend()
                )

            with open(self.CA_KEY_PATH, "rb") as f:
                ca_key_data = f.read()
                ca_key = serialization.load_pem_private_key(
                    ca_key_data, password=None, backend=default_backend()
                )

            # Generate node private key
            node_key = rsa.generate_private_key(
                public_exponent=65537,
                key_size=2048,
                backend=default_backend(),
            )

            # Create node certificate subject
            subject = x509.Name(
                [
                    x509.NameAttribute(NameOID.ORGANIZATION_NAME, "MAP2 Audio"),
                    x509.NameAttribute(NameOID.COMMON_NAME, common_name),
                ]
            )

            # Build subject alternative names
            san_list = []
            if sans:
                for san in sans:
                    try:
                        # Try to parse as IP address
                        from ipaddress import ip_address
                        san_list.append(x509.IPAddress(ip_address(san)))
                    except ValueError:
                        # Treat as DNS name
                        san_list.append(x509.DNSName(san))

            # Build node certificate
            cert_builder = (
                x509.CertificateBuilder()
                .subject_name(subject)
                .issuer_name(ca_cert.issuer)
                .public_key(node_key.public_key())
                .serial_number(x509.random_serial_number())
                .not_valid_before(datetime.now(timezone.utc))
                .not_valid_after(
                    datetime.now(timezone.utc) + timedelta(days=self.NODE_CERT_VALIDITY_DAYS)
                )
                .add_extension(
                    x509.BasicConstraints(ca=False, path_length=None),
                    critical=True,
                )
                .add_extension(
                    x509.KeyUsage(
                        digital_signature=True,
                        key_cert_sign=False,
                        crl_sign=False,
                        key_encipherment=True,
                        content_commitment=False,
                        data_encipherment=False,
                        key_agreement=False,
                        encipher_only=False,
                        decipher_only=False,
                    ),
                    critical=True,
                )
                .add_extension(
                    x509.ExtendedKeyUsage(
                        [
                            x509.oid.ExtendedKeyUsageOID.SERVER_AUTH,
                            x509.oid.ExtendedKeyUsageOID.CLIENT_AUTH,
                        ]
                    ),
                    critical=False,
                )
            )

            # Add SANs if provided
            if san_list:
                cert_builder = cert_builder.add_extension(
                    x509.SubjectAlternativeName(san_list),
                    critical=False,
                )

            # Sign certificate with CA key
            node_cert = cert_builder.sign(ca_key, hashes.SHA256(), backend=default_backend())

            # Write node certificate
            cert_path = self.ca_dir / self.NODE_CERT_FORMAT.format(node_id=node_id)
            with open(cert_path, "wb") as f:
                f.write(node_cert.public_bytes(serialization.Encoding.PEM))
            os.chmod(cert_path, 0o644)

            # Write node private key (restricted)
            key_path = self.ca_dir / self.NODE_KEY_FORMAT.format(node_id=node_id)
            with open(key_path, "wb") as f:
                f.write(
                    node_key.private_bytes(
                        encoding=serialization.Encoding.PEM,
                        format=serialization.PrivateFormat.PKCS8,
                        encryption_algorithm=serialization.NoEncryption(),
                    )
                )
            os.chmod(key_path, 0o600)

            self.logger.info(f"Certificate issued for node: {node_id}")
            return True

        except Exception as e:
            self.logger.error(f"Failed to issue certificate for {node_id}: {e}", exc_info=True)
            return False

    def get_certificate_expiry(self, node_id: str) -> Optional[datetime]:
        """Get certificate expiry datetime for a node"""
        try:
            cert_path = self.ca_dir / self.NODE_CERT_FORMAT.format(node_id=node_id)

            if not cert_path.exists():
                return None

            with open(cert_path, "rb") as f:
                cert = x509.load_pem_x509_certificate(f.read(), backend=default_backend())

            return cert.not_valid_after

        except Exception as e:
            self.logger.error(f"Failed to get certificate expiry: {e}")
            return None

    def should_renew_certificate(self, node_id: str) -> bool:
        """Check if node certificate should be renewed"""
        try:
            cert_path = self.ca_dir / self.NODE_CERT_FORMAT.format(node_id=node_id)

            if not cert_path.exists():
                return True

            with open(cert_path, "rb") as f:
                cert = x509.load_pem_x509_certificate(f.read(), backend=default_backend())

            # Calculate age as percentage of total lifetime
            now = datetime.now(timezone.utc)
            issued = cert.not_valid_before
            expires = cert.not_valid_after
            total_lifetime = (expires - issued).total_seconds()
            current_age = (now - issued).total_seconds()

            if total_lifetime <= 0:
                return True

            age_percentage = current_age / total_lifetime

            return age_percentage >= self.RENEWAL_THRESHOLD

        except Exception as e:
            self.logger.error(f"Failed to check renewal status: {e}")
            return False

    def get_ca_certificate(self) -> Optional[bytes]:
        """Get CA certificate PEM data"""
        try:
            if self.CA_CERT_PATH.exists():
                with open(self.CA_CERT_PATH, "rb") as f:
                    return f.read()
        except Exception as e:
            self.logger.error(f"Failed to read CA certificate: {e}")
        return None


# Global CA instance
_cluster_ca: Optional[ClusterCA] = None


def get_cluster_ca() -> ClusterCA:
    """Get or create the cluster CA singleton"""
    global _cluster_ca
    if _cluster_ca is None:
        _cluster_ca = ClusterCA()
    return _cluster_ca
