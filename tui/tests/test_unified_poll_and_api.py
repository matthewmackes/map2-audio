from __future__ import annotations

import pytest

from tui.api import MAP2APIClient
from tui.poll_manager import PollManager


@pytest.mark.asyncio
async def test_poll_manager_only_fetches_due_subscriptions() -> None:
    calls: list[str] = []

    async def fetch_alpha():
        calls.append("alpha")
        return {"ok": True}

    async def fetch_beta():
        calls.append("beta")
        return {"ok": True}

    manager = PollManager(
        {"alpha": fetch_alpha, "beta": fetch_beta},
        cadence={"alpha": 5, "beta": 5},
    )

    assert set(manager.due(["alpha", "beta"], now=10.0)) == {"alpha", "beta"}
    await manager.fetch("alpha")
    assert manager.due(["alpha", "beta"], now=12.0) == ["beta"]
    assert calls == ["alpha"]


def test_api_client_facade_exposes_domain_methods() -> None:
    client = MAP2APIClient()
    assert callable(client.get_audio_status)
    assert callable(client.get_cluster_health)
    assert callable(client.restart_backend)
    assert callable(client.apply_node_install)
    assert callable(client.get_runtime_profile_status)
    assert callable(client.switch_runtime_profile)
    assert callable(client.verify_rt_hardening)
    assert callable(client.apply_rt_hardening)
    assert callable(client.get_cpu_isolation_status)
    assert callable(client.verify_cpu_isolation)
    assert callable(client.reset_cpu_isolation_to_mode)
    assert callable(client.apply_avb_setup)
    assert callable(client.apply_avb_ptp_setup)
