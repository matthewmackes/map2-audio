"""
Remote bootstrap pairing-code service for adoption claims.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import socket
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import httpx

from app.services.cluster.registry import ClusterRegistry
from app.services.node_identity import NodeIdentity


class BootstrapClaimError(RuntimeError):
    """Raised when a remote bootstrap claim or finalize step fails."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _isoformat(value: datetime) -> str:
    return value.isoformat()


def _parse_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            if raw.endswith("Z"):
                raw = raw[:-1] + "+00:00"
            return datetime.fromisoformat(raw)
        except ValueError:
            return None
    return None


def _normalize_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


class AdoptionBootstrapService:
    """Manage pairing-code issuance and short-lived claim tokens."""

    SECRET_PATH = ClusterRegistry.DB_PATH.parent / "bootstrap-token-secret"

    def __init__(
        self,
        *,
        code_ttl_seconds: int = 600,
        claim_ttl_seconds: int = 300,
        token_ttl_seconds: int = 900,
        secret_path: Optional[Path] = None,
    ):
        self.code_ttl_seconds = max(60, int(code_ttl_seconds))
        self.claim_ttl_seconds = max(60, int(claim_ttl_seconds))
        self.token_ttl_seconds = max(60, int(token_ttl_seconds))
        self.secret_path = Path(secret_path or self.SECRET_PATH)
        self._lock = threading.Lock()
        self._pairing_code: Optional[str] = None
        self._pairing_code_expires_at: Optional[datetime] = None
        self._claim_tokens: Dict[str, Dict[str, Any]] = {}
        self._signing_secret = self._load_or_create_signing_secret()

    def _load_or_create_signing_secret(self) -> bytes:
        env_secret = _normalize_text(os.getenv("MAP2_BOOTSTRAP_TOKEN_SECRET"))
        if env_secret:
            return env_secret.encode("utf-8")

        self.secret_path.parent.mkdir(parents=True, exist_ok=True)
        if self.secret_path.exists():
            return self.secret_path.read_text(encoding="utf-8").strip().encode("utf-8")

        secret = secrets.token_urlsafe(48)
        self.secret_path.write_text(secret, encoding="utf-8")
        try:
            self.secret_path.chmod(0o600)
        except Exception:
            pass
        return secret.encode("utf-8")

    @staticmethod
    def _b64encode(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

    @staticmethod
    def _b64decode(value: str) -> bytes:
        padded = value + "=" * (-len(value) % 4)
        return base64.urlsafe_b64decode(padded.encode("ascii"))

    def _sign_token_payload(self, payload_segment: str) -> str:
        digest = hmac.new(self._signing_secret, payload_segment.encode("utf-8"), hashlib.sha256).digest()
        return self._b64encode(digest)

    def _parse_bootstrap_token_payload_unverified(self, bootstrap_token: str) -> Dict[str, Any]:
        try:
            payload_segment, _ = str(bootstrap_token or "").strip().split(".", 1)
        except ValueError as exc:
            raise BootstrapClaimError("Bootstrap token is malformed") from exc

        try:
            payload_bytes = self._b64decode(payload_segment)
            payload = json.loads(payload_bytes.decode("utf-8"))
        except Exception as exc:
            raise BootstrapClaimError("Bootstrap token payload is invalid") from exc

        if not isinstance(payload, dict):
            raise BootstrapClaimError("Bootstrap token payload is invalid")
        return payload

    def _build_claim_payload(
        self,
        *,
        requester_node_id: Optional[str],
        claim_source: str,
        token_subject: Optional[str] = None,
    ) -> Dict[str, Any]:
        node_id, hostname, fingerprint = self._resolve_identity()
        claim_token = secrets.token_urlsafe(18)
        expires_at = _utcnow() + timedelta(seconds=self.claim_ttl_seconds)
        self._claim_tokens[claim_token] = {
            "requester_node_id": _normalize_text(requester_node_id),
            "expires_at": expires_at,
            "node_id": node_id,
            "claim_source": claim_source,
            "token_subject": _normalize_text(token_subject),
        }
        return {
            "claim_token": claim_token,
            "token_expires_at": _isoformat(expires_at),
            "node_id": node_id,
            "hostname": hostname,
            "remote_fingerprint": fingerprint,
        }

    def _resolve_identity(self) -> tuple[str, str, str]:
        hostname = socket.gethostname() or "localhost"
        try:
            identity = NodeIdentity()
            node_id = _normalize_text(getattr(identity, "node_id", None)) or hostname
            fingerprint = _normalize_text(getattr(identity, "ssh_fingerprint", None))
            if fingerprint:
                return node_id, hostname, fingerprint
            return node_id, hostname, hashlib.sha1(f"{node_id}:{hostname}".encode("utf-8")).hexdigest()[:16]
        except Exception:
            return hostname, hostname, hashlib.sha1(hostname.encode("utf-8")).hexdigest()[:16]

    def _prune_expired_claims(self) -> None:
        now = _utcnow()
        expired = [
            token
            for token, payload in self._claim_tokens.items()
            if payload.get("expires_at") is None or payload["expires_at"] <= now
        ]
        for token in expired:
            self._claim_tokens.pop(token, None)

    def _ensure_pairing_code_locked(self) -> tuple[str, datetime]:
        now = _utcnow()
        if self._pairing_code and self._pairing_code_expires_at and self._pairing_code_expires_at > now:
            return self._pairing_code, self._pairing_code_expires_at

        self._pairing_code = f"{secrets.randbelow(1_000_000):06d}"
        self._pairing_code_expires_at = now + timedelta(seconds=self.code_ttl_seconds)
        return self._pairing_code, self._pairing_code_expires_at

    def peek_pairing_code(self) -> str:
        with self._lock:
            code, _ = self._ensure_pairing_code_locked()
            return code

    def get_status(self, *, include_pairing_code: bool = False) -> Dict[str, Any]:
        with self._lock:
            self._prune_expired_claims()
            code, expires_at = self._ensure_pairing_code_locked()
            node_id, hostname, fingerprint = self._resolve_identity()
            return {
                "node_id": node_id,
                "hostname": hostname,
                "remote_fingerprint": fingerprint,
                "pairing_required": True,
                "pairing_code_hint": f"••{code[-2:]}",
                "pairing_code_expires_at": _isoformat(expires_at),
                "pairing_code": code if include_pairing_code else None,
                "active_claims": len(self._claim_tokens),
            }

    def issue_bootstrap_token(
        self,
        *,
        issuer_api_url: str,
        target_node_id: Optional[str] = None,
        target_hostname: Optional[str] = None,
        target_api_url: Optional[str] = None,
        expires_in_seconds: Optional[int] = None,
    ) -> Dict[str, Any]:
        node_id, _, fingerprint = self._resolve_identity()
        now = _utcnow()
        expires_at = now + timedelta(seconds=max(60, int(expires_in_seconds or self.token_ttl_seconds)))
        payload = {
            "scope": "map2-bootstrap-token-v1",
            "issuer_node_id": node_id,
            "issuer_api_url": issuer_api_url.rstrip("/"),
            "issuer_fingerprint": fingerprint,
            "issued_at": _isoformat(now),
            "expires_at": _isoformat(expires_at),
            "target_node_id": _normalize_text(target_node_id),
            "target_hostname": _normalize_text(target_hostname),
            "target_api_url": _normalize_text(target_api_url),
            "token_id": secrets.token_urlsafe(10),
        }
        payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True)
        payload_segment = self._b64encode(payload_json.encode("utf-8"))
        signature_segment = self._sign_token_payload(payload_segment)
        token = f"{payload_segment}.{signature_segment}"
        return {
            "bootstrap_token": token,
            "expires_at": _isoformat(expires_at),
            "issuer_node_id": node_id,
            "issuer_api_url": issuer_api_url.rstrip("/"),
            "target_node_id": payload["target_node_id"],
            "target_hostname": payload["target_hostname"],
        }

    def _decode_bootstrap_token(self, bootstrap_token: str) -> Dict[str, Any]:
        try:
            payload_segment, signature_segment = str(bootstrap_token or "").strip().split(".", 1)
        except ValueError as exc:
            raise BootstrapClaimError("Bootstrap token is malformed") from exc

        expected_signature = self._sign_token_payload(payload_segment)
        if not hmac.compare_digest(expected_signature, signature_segment):
            raise BootstrapClaimError("Bootstrap token signature verification failed")

        try:
            payload_bytes = self._b64decode(payload_segment)
            payload = json.loads(payload_bytes.decode("utf-8"))
        except Exception as exc:
            raise BootstrapClaimError("Bootstrap token payload is invalid") from exc

        if not isinstance(payload, dict):
            raise BootstrapClaimError("Bootstrap token payload is invalid")

        if _normalize_text(payload.get("scope")) != "map2-bootstrap-token-v1":
            raise BootstrapClaimError("Bootstrap token scope is invalid")

        expires_at = _parse_datetime(payload.get("expires_at"))
        if expires_at is None or expires_at <= _utcnow():
            raise BootstrapClaimError("Bootstrap token has expired")

        return payload

    def verify_bootstrap_token(
        self,
        *,
        bootstrap_token: str,
        remote_node_id: Optional[str],
        remote_hostname: Optional[str],
    ) -> Dict[str, Any]:
        payload = self._decode_bootstrap_token(bootstrap_token)

        expected_node_id = _normalize_text(payload.get("target_node_id"))
        if expected_node_id and remote_node_id and expected_node_id != remote_node_id:
            raise BootstrapClaimError("Bootstrap token target node does not match the remote node")

        expected_hostname = _normalize_text(payload.get("target_hostname"))
        if expected_hostname and remote_hostname and expected_hostname != remote_hostname:
            raise BootstrapClaimError("Bootstrap token target hostname does not match the remote node")

        return payload

    def _verify_bootstrap_token_via_issuer(
        self,
        *,
        bootstrap_token: str,
        requester_node_id: Optional[str],
    ) -> Dict[str, Any]:
        token_payload = self._parse_bootstrap_token_payload_unverified(bootstrap_token)
        issuer_api_url = _normalize_text(token_payload.get("issuer_api_url"))
        if not issuer_api_url:
            raise BootstrapClaimError("Bootstrap token does not include an issuer API URL")

        node_id, hostname, _ = self._resolve_identity()
        verify_url = f"{issuer_api_url.rstrip('/')}/api/bootstrap/tokens/verify"
        try:
            response = httpx.post(
                verify_url,
                json={
                    "bootstrap_token": bootstrap_token,
                    "requester_node_id": _normalize_text(requester_node_id),
                    "remote_node_id": node_id,
                    "remote_hostname": hostname,
                },
                timeout=5.0,
            )
        except httpx.HTTPError as exc:
            raise BootstrapClaimError(f"Bootstrap token verification callback failed: {exc}") from exc

        if response.status_code != 200:
            detail = None
            try:
                payload = response.json()
            except Exception:
                payload = {}
            if isinstance(payload, dict):
                detail = _normalize_text(payload.get("detail") or payload.get("message"))
            raise BootstrapClaimError(detail or f"Bootstrap token verification failed with status {response.status_code}")

        payload = response.json()
        if not isinstance(payload, dict):
            raise BootstrapClaimError("Bootstrap token verification returned an invalid payload")
        return payload

    def verify_claim(
        self,
        *,
        pairing_code: Optional[str],
        bootstrap_token: Optional[str],
        requester_node_id: Optional[str],
    ) -> Dict[str, Any]:
        normalized_code = str(pairing_code or "").strip()
        normalized_bootstrap_token = str(bootstrap_token or "").strip()
        with self._lock:
            self._prune_expired_claims()
            if normalized_bootstrap_token:
                payload = self._verify_bootstrap_token_via_issuer(
                    bootstrap_token=normalized_bootstrap_token,
                    requester_node_id=requester_node_id,
                )
                claim_payload = self._build_claim_payload(
                    requester_node_id=requester_node_id,
                    claim_source="bootstrap-token",
                    token_subject=_normalize_text(payload.get("token_id")),
                )
                return claim_payload

            code, _ = self._ensure_pairing_code_locked()
            if normalized_code != code:
                raise BootstrapClaimError("Pairing code verification failed on the remote node")

            # Rotate the one-time pairing code immediately after a successful claim.
            self._pairing_code = None
            self._pairing_code_expires_at = None

            return self._build_claim_payload(
                requester_node_id=requester_node_id,
                claim_source="pairing-code",
            )

    def finalize_claim(
        self,
        *,
        claim_token: str,
        requester_node_id: Optional[str],
        adopted_node_id: Optional[str],
    ) -> Dict[str, Any]:
        normalized_token = str(claim_token or "").strip()
        with self._lock:
            self._prune_expired_claims()
            payload = self._claim_tokens.get(normalized_token)
            if payload is None:
                raise BootstrapClaimError("Remote bootstrap claim token is missing or expired")

            expected_requester = _normalize_text(payload.get("requester_node_id"))
            actual_requester = _normalize_text(requester_node_id)
            if expected_requester and actual_requester and expected_requester != actual_requester:
                raise BootstrapClaimError("Remote bootstrap claim token belongs to a different requester")

            self._claim_tokens.pop(normalized_token, None)
            node_id, hostname, fingerprint = self._resolve_identity()
            return {
                "status": "ok",
                "node_id": node_id,
                "hostname": hostname,
                "remote_fingerprint": fingerprint,
                "adopted_node_id": _normalize_text(adopted_node_id),
            }


_bootstrap_service: Optional[AdoptionBootstrapService] = None


def set_adoption_bootstrap_service(service: Optional[AdoptionBootstrapService]) -> None:
    global _bootstrap_service
    _bootstrap_service = service


def get_adoption_bootstrap_service() -> AdoptionBootstrapService:
    global _bootstrap_service
    if _bootstrap_service is None:
        _bootstrap_service = AdoptionBootstrapService()
    return _bootstrap_service
