from __future__ import annotations

from pathlib import Path

import pytest

from app.services import secrets_manager as secrets_module
from app.services.secrets_manager import (
    AccessLevel,
    SecretType,
    SecretsManager,
    get_secret,
    init_secrets_manager,
    store_secret,
)


def test_secrets_manager_dependency_contract() -> None:
    if secrets_module.CRYPTOGRAPHY_AVAILABLE:
        manager = SecretsManager(
            storage_path="/tmp/map2-unused-secrets.json",
            master_password="test-master-password",
            salt_path="/tmp/map2-unused-secrets.salt",
        )
        assert manager is not None
        return

    with pytest.raises(RuntimeError, match="cryptography is required"):
        SecretsManager(
            storage_path="/tmp/map2-unused-secrets.json",
            master_password="test-master-password",
            salt_path="/tmp/map2-unused-secrets.salt",
        )


@pytest.mark.skipif(
    not secrets_module.CRYPTOGRAPHY_AVAILABLE,
    reason="cryptography optional dependency not installed",
)
def test_secrets_manager_round_trip_and_access_control(tmp_path: Path) -> None:
    storage_path = tmp_path / "secrets.json"
    salt_path = tmp_path / "secrets.salt"

    manager = SecretsManager(
        storage_path=str(storage_path),
        master_password="test-master-password",
        salt_path=str(salt_path),
    )
    manager.store_secret(
        "cluster-token",
        "secret-value",
        secret_type=SecretType.TOKEN,
        access_level=AccessLevel.INTERNAL,
    )

    assert manager.get_secret("cluster-token", requester_role="internal") == "secret-value"
    assert manager.get_secret("cluster-token", requester_role=None) is None
    assert manager.get_secret("cluster-token", requester_role="admin") == "secret-value"


@pytest.mark.skipif(
    not secrets_module.CRYPTOGRAPHY_AVAILABLE,
    reason="cryptography optional dependency not installed",
)
def test_secrets_manager_rotation_listing_and_delete(tmp_path: Path) -> None:
    storage_path = tmp_path / "secrets.json"
    salt_path = tmp_path / "secrets.salt"

    manager = SecretsManager(
        storage_path=str(storage_path),
        master_password="test-master-password",
        salt_path=str(salt_path),
    )
    manager.store_secret(
        "api-key",
        "initial-value",
        secret_type=SecretType.API_KEY,
        access_level=AccessLevel.ADMIN,
        rotation_days=1,
    )

    listed = manager.list_secrets(secret_type=SecretType.API_KEY)
    assert [secret["name"] for secret in listed] == ["api-key"]
    assert manager.rotate_secret("api-key", "rotated-value") is True
    assert manager.get_secret("api-key", requester_role="admin") == "rotated-value"
    assert manager.get_secrets_needing_rotation() == []
    assert manager.delete_secret("api-key") is True
    assert manager.get_secret("api-key", requester_role="admin") is None


@pytest.mark.skipif(
    not secrets_module.CRYPTOGRAPHY_AVAILABLE,
    reason="cryptography optional dependency not installed",
)
def test_global_secret_helpers_support_custom_storage_paths(tmp_path: Path) -> None:
    storage_path = tmp_path / "secrets.json"
    salt_path = tmp_path / "secrets.salt"

    init_secrets_manager(
        storage_path=str(storage_path),
        master_password="test-master-password",
        salt_path=str(salt_path),
    )
    store_secret(
        "shared-secret",
        "helper-value",
        secret_type=SecretType.GENERIC,
        access_level=AccessLevel.INTERNAL,
    )

    assert get_secret("shared-secret", requester_role="internal") == "helper-value"
