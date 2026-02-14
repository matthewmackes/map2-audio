"""
AVB/TSN Integration Tests

Tests for AVB network audio functionality.
Automatically skipped when AVB hardware is unavailable.

Usage:
    pytest tests/test_avb_integration.py           # Run AVB tests (skips if unavailable)
    pytest -m avb                                   # Run only AVB-marked tests
    pytest -m "not avb"                             # Run all tests except AVB
"""

import pytest
import asyncio
from typing import Dict, Any

# Mark all tests in this module as AVB tests
pytestmark = pytest.mark.avb


@pytest.fixture
async def avb_available(api_client) -> bool:
    """Check if AVB is available on this system."""
    try:
        response = await api_client.get("/api/avb/status")
        if response is None:
            return False
        return response.get("enabled", False) and response.get("available", False)
    except Exception:
        return False


@pytest.fixture
async def skip_if_avb_unavailable(avb_available):
    """Skip test if AVB is not available."""
    if not avb_available:
        pytest.skip("AVB not available (hardware or config disabled)")


# ============================================================================
# AVB Status Tests
# ============================================================================

@pytest.mark.asyncio
async def test_avb_status_endpoint_exists(api_client):
    """Test that AVB status endpoint is accessible."""
    response = await api_client.get("/api/avb/status")
    assert response is not None, "AVB status endpoint should return data"
    assert "enabled" in response
    assert "available" in response


@pytest.mark.asyncio
async def test_avb_status_when_disabled(api_client):
    """Test AVB status returns correct structure when disabled."""
    response = await api_client.get("/api/avb/status")
    assert response is not None

    # Should return valid structure even when disabled
    assert isinstance(response.get("enabled"), bool)
    assert isinstance(response.get("available"), bool)

    if not response["enabled"]:
        assert "reason" in response or "ptp" in response


@pytest.mark.asyncio
async def test_avb_status_with_config(api_client, skip_if_avb_unavailable):
    """Test AVB status includes configuration when enabled."""
    response = await api_client.get("/api/avb/status")
    assert response["enabled"] is True
    assert response["available"] is True

    # Should have config section
    assert "config" in response
    config = response["config"]
    assert "ptp_domain" in config
    assert "ptp_priority1" in config
    assert "max_streams" in config


# ============================================================================
# PTP Status Tests
# ============================================================================

@pytest.mark.asyncio
async def test_ptp_status_endpoint(api_client):
    """Test PTP status endpoint returns valid data."""
    response = await api_client.get("/api/avb/ptp/status")
    assert response is not None
    assert "available" in response


@pytest.mark.asyncio
async def test_ptp_status_when_available(api_client, skip_if_avb_unavailable):
    """Test PTP status includes sync data when available."""
    response = await api_client.get("/api/avb/ptp/status")

    if response.get("available"):
        # Should have PTP sync data
        assert "state" in response
        assert "offset_ns" in response

        # Offset should be numeric
        assert isinstance(response["offset_ns"], (int, float))


@pytest.mark.asyncio
async def test_ptp_offset_bounds(api_client, skip_if_avb_unavailable):
    """Test PTP clock offset is within reasonable bounds."""
    response = await api_client.get("/api/avb/ptp/status")

    if response.get("available") and "offset_ns" in response:
        offset = abs(response["offset_ns"])

        # Good sync should be <1μs (1000ns)
        # Warning at <10μs (10000ns)
        # Critical at >100μs (100000ns)
        assert offset < 1_000_000, f"PTP offset too high: {offset}ns (>1ms is critical)"

        if offset < 1000:
            pytest.mark.quality = "excellent"
        elif offset < 10000:
            pytest.mark.quality = "good"
        elif offset < 100000:
            pytest.mark.quality = "acceptable"


# ============================================================================
# TSN Qdisc Tests
# ============================================================================

@pytest.mark.asyncio
async def test_tsn_status_endpoint(api_client):
    """Test TSN qdisc status endpoint."""
    response = await api_client.get("/api/avb/tsn/status")
    assert response is not None
    assert "available" in response


@pytest.mark.asyncio
async def test_tsn_configuration(api_client, skip_if_avb_unavailable):
    """Test TSN qdisc configuration details."""
    response = await api_client.get("/api/avb/tsn/status")

    if response.get("available"):
        # Should have qdisc config details
        assert "interface" in response
        assert isinstance(response.get("mqprio_configured"), bool)
        assert isinstance(response.get("cbs_configured"), bool)


@pytest.mark.asyncio
async def test_tsn_cbs_parameters(api_client, skip_if_avb_unavailable):
    """Test CBS parameter calculation endpoint."""
    # Test with default parameters (48kHz stereo 24-bit)
    response = await api_client.get("/api/avb/tsn/calculate_cbs")
    assert response is not None

    assert "input" in response
    assert "cbs_parameters" in response

    params = response["cbs_parameters"]
    assert "idleslope" in params
    assert "sendslope" in params
    assert "hicredit" in params
    assert "locredit" in params

    # Verify reasonable values for stereo 48kHz audio
    # Should be around 2.3Mbps with overhead
    idleslope = params["idleslope"]
    assert idleslope > 0, "idleslope must be positive"
    assert idleslope < 100_000_000, "idleslope seems unreasonably high"


# ============================================================================
# Stream Management Tests
# ============================================================================

@pytest.mark.asyncio
async def test_streams_endpoint(api_client):
    """Test streams endpoint is accessible."""
    response = await api_client.get("/api/avb/streams")
    assert response is not None
    assert "available" in response
    assert "streams" in response


@pytest.mark.asyncio
async def test_streams_list_structure(api_client, skip_if_avb_unavailable):
    """Test stream list has correct structure."""
    response = await api_client.get("/api/avb/streams")
    assert response["available"] is True

    streams = response["streams"]
    assert isinstance(streams, list)

    # If streams exist, verify structure
    for stream in streams:
        assert "stream_id" in stream
        assert "direction" in stream
        assert stream["direction"] in ["talker", "listener"]
        assert "state" in stream
        assert "channels" in stream
        assert "sample_rate" in stream


@pytest.mark.asyncio
async def test_stream_creation_validation(api_client, skip_if_avb_unavailable):
    """Test stream creation with invalid data returns error."""
    # Try to create stream with missing fields
    response = await api_client.post("/api/avb/streams", json={
        "stream_id": "test-invalid"
        # Missing required fields
    })

    # Should return error (400 or 422)
    assert response is None or "error" in response


@pytest.mark.asyncio
async def test_nonexistent_stream_404(api_client, skip_if_avb_unavailable):
    """Test accessing nonexistent stream returns 404."""
    response = await api_client.get("/api/avb/streams/nonexistent-stream-id")

    # Should return None or error for 404
    assert response is None or "error" in response or response.get("detail") == "Stream not found"


# ============================================================================
# Discovery Tests
# ============================================================================

@pytest.mark.asyncio
async def test_discovery_endpoint(api_client):
    """Test AVB discovery endpoint."""
    response = await api_client.get("/api/avb/discovery")
    assert response is not None
    assert "enabled" in response
    assert "nodes" in response


@pytest.mark.asyncio
async def test_discovery_node_structure(api_client, skip_if_avb_unavailable):
    """Test discovered node structure."""
    response = await api_client.get("/api/avb/discovery")

    if response.get("enabled"):
        nodes = response.get("nodes", [])
        assert isinstance(nodes, list)

        for node in nodes:
            assert "node_id" in node
            assert "hostname" in node
            assert "addresses" in node
            assert isinstance(node["addresses"], list)


# ============================================================================
# Graceful Degradation Tests
# ============================================================================

@pytest.mark.asyncio
async def test_avb_disabled_returns_200(api_client):
    """Test that AVB endpoints return 200 (not 404/500) when disabled."""
    endpoints = [
        "/api/avb/status",
        "/api/avb/ptp/status",
        "/api/avb/tsn/status",
        "/api/avb/streams",
        "/api/avb/discovery",
    ]

    for endpoint in endpoints:
        response = await api_client.get(endpoint)
        # Should return data, not None (which indicates error)
        assert response is not None, f"{endpoint} should return 200 with available=false"


@pytest.mark.asyncio
async def test_error_messages_are_descriptive(api_client):
    """Test that error messages are helpful when AVB unavailable."""
    response = await api_client.get("/api/avb/status")

    if not response.get("available"):
        # Should have descriptive reason or error
        assert "reason" in response or "error" in response.get("ptp", {})

        if "reason" in response:
            reason = response["reason"]
            assert len(reason) > 0, "Reason should not be empty"
            assert isinstance(reason, str)


# ============================================================================
# Performance Tests
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.performance
async def test_ptp_status_response_time(api_client, skip_if_avb_unavailable):
    """Test PTP status endpoint responds quickly."""
    import time

    start = time.time()
    response = await api_client.get("/api/avb/ptp/status")
    elapsed = time.time() - start

    assert response is not None
    # Should respond in under 100ms
    assert elapsed < 0.1, f"PTP status too slow: {elapsed:.3f}s"


@pytest.mark.asyncio
@pytest.mark.performance
async def test_concurrent_requests(api_client, skip_if_avb_unavailable):
    """Test multiple concurrent AVB API requests."""
    import time

    async def fetch_status():
        return await api_client.get("/api/avb/status")

    start = time.time()
    # Fire 10 concurrent requests
    results = await asyncio.gather(*[fetch_status() for _ in range(10)])
    elapsed = time.time() - start

    # All should succeed
    assert all(r is not None for r in results)
    # Should complete in under 1 second total
    assert elapsed < 1.0, f"Concurrent requests too slow: {elapsed:.3f}s"


# ============================================================================
# Edge Cases
# ============================================================================

@pytest.mark.asyncio
async def test_malformed_stream_id(api_client, skip_if_avb_unavailable):
    """Test handling of malformed stream IDs."""
    malformed_ids = [
        "",  # Empty
        " ",  # Whitespace
        "../../../etc/passwd",  # Path traversal
        "stream'; DROP TABLE streams;--",  # SQL injection attempt
    ]

    for stream_id in malformed_ids:
        response = await api_client.get(f"/api/avb/streams/{stream_id}")
        # Should handle gracefully (404 or error)
        assert response is None or "error" in response or "detail" in response


@pytest.mark.asyncio
async def test_rapid_polling(api_client, skip_if_avb_unavailable):
    """Test rapid polling doesn't cause issues."""
    # Poll PTP status 50 times rapidly
    for _ in range(50):
        response = await api_client.get("/api/avb/ptp/status")
        assert response is not None
        await asyncio.sleep(0.01)  # 10ms between requests


# ============================================================================
# Integration Tests
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.integration
async def test_full_avb_workflow(api_client, skip_if_avb_unavailable):
    """Test complete AVB workflow: status → streams → discovery."""
    # 1. Check status
    status = await api_client.get("/api/avb/status")
    assert status["available"] is True

    # 2. Check PTP sync
    ptp = await api_client.get("/api/avb/ptp/status")
    assert ptp["available"] is True

    # 3. List streams
    streams = await api_client.get("/api/avb/streams")
    assert streams["available"] is True

    # 4. Check discovery
    discovery = await api_client.get("/api/avb/discovery")
    assert "nodes" in discovery


@pytest.mark.asyncio
@pytest.mark.integration
async def test_config_consistency(api_client, skip_if_avb_unavailable):
    """Test configuration is consistent across endpoints."""
    # Get interface from status
    status = await api_client.get("/api/avb/status")
    interface_from_status = status.get("interface")

    # Get interface from TSN status
    tsn = await api_client.get("/api/avb/tsn/status")

    if tsn.get("available"):
        interface_from_tsn = tsn.get("interface")
        # Should match
        assert interface_from_status == interface_from_tsn, \
            "Interface mismatch between status endpoints"
