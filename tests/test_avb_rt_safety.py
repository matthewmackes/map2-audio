"""
AVB Real-Time Safety Validation Tests

Tests to ensure AVB audio code adheres to real-time safety constraints:
- No heap allocations in RT paths
- No locks/mutexes in audio callback
- No blocking system calls
- Bounded execution time
- Proper memory barriers and atomics

These tests require:
1. AVB hardware available
2. Debug build with instrumentation
3. CAP_SYS_PTRACE for malloc interception

Usage:
    pytest tests/test_avb_rt_safety.py -v
    pytest -m avb_rt_safety         # Run only RT safety tests
    pytest -m "avb and not avb_rt_safety"  # Run AVB tests except RT safety
"""

import pytest
import asyncio
import os
import sys
import ctypes
import time
from typing import Dict, List, Optional

# Mark all tests in this module as AVB RT safety tests
pytestmark = [pytest.mark.avb, pytest.mark.avb_rt_safety]


# ============================================================================
# Fixtures & Helpers
# ============================================================================

@pytest.fixture
async def avb_available(api_client) -> bool:
    """Check if AVB is available and active."""
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


@pytest.fixture
def check_debug_build():
    """Check if this is a debug build with RT instrumentation."""
    # In production, this would check for specific debug symbols or env vars
    # For now, we just warn if HAS_AVB_RT_INSTRUMENTATION is not set
    if not os.environ.get("HAS_AVB_RT_INSTRUMENTATION"):
        pytest.skip("RT instrumentation not available (need debug build)")


@pytest.fixture
def check_ptrace_capability():
    """Check if we have CAP_SYS_PTRACE for malloc interception."""
    try:
        # Check /proc/self/status for CapEff capabilities
        with open("/proc/self/status", "r") as f:
            for line in f:
                if line.startswith("CapEff:"):
                    cap_eff = int(line.split()[1], 16)
                    # CAP_SYS_PTRACE = 19, bit mask = 1 << 19
                    if cap_eff & (1 << 19):
                        return True
        return False
    except Exception:
        return False


# ============================================================================
# Memory Allocation Tests
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.skipif(
    sys.platform != "linux",
    reason="Malloc instrumentation requires Linux"
)
async def test_no_rt_allocations(api_client, skip_if_avb_unavailable, check_debug_build):
    """
    Test that no heap allocations occur in RT audio callback.

    Requires debug build with malloc hooks enabled.
    """
    # Request instrumentation start
    response = await api_client.post("/api/avb/debug/start_malloc_trace", json={
        "duration_ms": 5000,
        "trace_rt_threads": True
    })

    if response is None or "error" in response:
        pytest.skip("Malloc tracing not available")

    # Wait for trace to complete
    await asyncio.sleep(6)

    # Get results
    trace = await api_client.get("/api/avb/debug/malloc_trace")
    assert trace is not None, "Failed to retrieve malloc trace"

    # Check for RT thread allocations
    rt_allocations = trace.get("rt_allocations", [])
    assert len(rt_allocations) == 0, \
        f"RT allocations detected: {rt_allocations}"


@pytest.mark.asyncio
async def test_ringbuffer_no_allocations(api_client, skip_if_avb_unavailable):
    """
    Test that ring buffer operations don't allocate memory.

    This is a behavioral test - monitors memory usage during stream operation.
    """
    # Start a test stream
    stream_config = {
        "stream_id": "test-rt-safety-stream",
        "direction": "talker",
        "channels": 2,
        "sample_rate": 48000,
        "destination_mac": "91:e0:f0:00:fe:01"
    }

    response = await api_client.post("/api/avb/streams", json=stream_config)
    if response is None or "error" in response:
        pytest.skip("Cannot create test stream")

    try:
        # Get initial memory stats
        initial_stats = await api_client.get(f"/api/avb/streams/{stream_config['stream_id']}/stats")
        initial_mem = initial_stats.get("memory_bytes", 0)

        # Let stream run for 5 seconds
        await asyncio.sleep(5)

        # Get final memory stats
        final_stats = await api_client.get(f"/api/avb/streams/{stream_config['stream_id']}/stats")
        final_mem = final_stats.get("memory_bytes", 0)

        # Memory should be stable (allow 1KB tolerance for rounding)
        mem_delta = abs(final_mem - initial_mem)
        assert mem_delta < 1024, \
            f"Memory increased by {mem_delta} bytes during streaming (RT allocation suspected)"

    finally:
        # Clean up stream
        await api_client.delete(f"/api/avb/streams/{stream_config['stream_id']}")


# ============================================================================
# Lock-Free Tests
# ============================================================================

@pytest.mark.asyncio
async def test_no_locks_in_rt_path(api_client, skip_if_avb_unavailable, check_debug_build):
    """
    Test that no mutexes are acquired in RT audio callback.

    Requires debug build with lock instrumentation.
    """
    # Enable lock tracing
    response = await api_client.post("/api/avb/debug/start_lock_trace", json={
        "duration_ms": 5000,
        "trace_rt_threads": True
    })

    if response is None or "error" in response:
        pytest.skip("Lock tracing not available")

    # Wait for trace to complete
    await asyncio.sleep(6)

    # Get results
    trace = await api_client.get("/api/avb/debug/lock_trace")
    assert trace is not None, "Failed to retrieve lock trace"

    # Check for RT thread locks
    rt_locks = trace.get("rt_locks", [])

    # Filter out known safe lock-free operations (atomics, spinlocks with bounded spin)
    unsafe_locks = [
        lock for lock in rt_locks
        if lock.get("type") not in ["atomic", "lockfree_queue"]
    ]

    assert len(unsafe_locks) == 0, \
        f"Unsafe locks detected in RT path: {unsafe_locks}"


@pytest.mark.asyncio
async def test_atomic_operations_only(api_client, skip_if_avb_unavailable):
    """
    Test that shared state uses atomic operations, not locks.

    Verifies that stream stats are updated lock-free.
    """
    stream_config = {
        "stream_id": "test-atomic-stream",
        "direction": "talker",
        "channels": 2,
        "sample_rate": 48000,
        "destination_mac": "91:e0:f0:00:fe:02"
    }

    response = await api_client.post("/api/avb/streams", json=stream_config)
    if response is None or "error" in response:
        pytest.skip("Cannot create test stream")

    try:
        # Rapidly poll stats (should never block if lock-free)
        start = time.time()

        for _ in range(100):
            stats = await api_client.get(f"/api/avb/streams/{stream_config['stream_id']}/stats")
            assert stats is not None

        elapsed = time.time() - start

        # 100 stat reads should complete in <1 second if lock-free
        # (would be much slower if contending with RT thread locks)
        assert elapsed < 1.0, \
            f"Stats polling too slow ({elapsed:.3f}s) - lock contention suspected"

    finally:
        await api_client.delete(f"/api/avb/streams/{stream_config['stream_id']}")


# ============================================================================
# Timing & Latency Tests
# ============================================================================

@pytest.mark.asyncio
async def test_bounded_callback_time(api_client, skip_if_avb_unavailable, check_debug_build):
    """
    Test that audio callback execution time is bounded and predictable.

    Requires debug build with timing instrumentation.
    """
    # Enable timing trace
    response = await api_client.post("/api/avb/debug/start_timing_trace", json={
        "duration_ms": 10000,
        "trace_rt_threads": True,
        "histogram_buckets": 100
    })

    if response is None or "error" in response:
        pytest.skip("Timing tracing not available")

    # Wait for trace to complete
    await asyncio.sleep(11)

    # Get results
    trace = await api_client.get("/api/avb/debug/timing_trace")
    assert trace is not None, "Failed to retrieve timing trace"

    # Analyze callback timing
    callback_times = trace.get("callback_times_us", [])
    assert len(callback_times) > 0, "No callback timing data"

    # Calculate statistics
    avg_time = sum(callback_times) / len(callback_times)
    max_time = max(callback_times)
    p99_time = sorted(callback_times)[int(len(callback_times) * 0.99)]

    # For 128 samples @ 48kHz, callback period is 2666μs
    # Callback should complete in <50% of period (1333μs)
    # P99 should be <70% of period (1866μs)
    assert avg_time < 1333, f"Average callback time {avg_time}μs exceeds 50% of period"
    assert p99_time < 1866, f"P99 callback time {p99_time}μs exceeds 70% of period"
    assert max_time < 2666, f"Max callback time {max_time}μs exceeds period (deadline miss)"


@pytest.mark.asyncio
async def test_consistent_latency(api_client, skip_if_avb_unavailable):
    """
    Test that AVB stream latency is consistent over time.

    High jitter indicates RT violations.
    """
    stream_config = {
        "stream_id": "test-latency-stream",
        "direction": "talker",
        "channels": 2,
        "sample_rate": 48000,
        "destination_mac": "91:e0:f0:00:fe:03"
    }

    response = await api_client.post("/api/avb/streams", json=stream_config)
    if response is None or "error" in response:
        pytest.skip("Cannot create test stream")

    try:
        # Collect latency samples over 10 seconds
        latencies = []

        for _ in range(20):  # 20 samples @ 0.5s intervals
            await asyncio.sleep(0.5)
            stats = await api_client.get(f"/api/avb/streams/{stream_config['stream_id']}/stats")
            if stats and "latency_us" in stats:
                latencies.append(stats["latency_us"])

        assert len(latencies) >= 10, "Insufficient latency samples"

        # Calculate jitter (standard deviation)
        avg_latency = sum(latencies) / len(latencies)
        variance = sum((x - avg_latency) ** 2 for x in latencies) / len(latencies)
        jitter = variance ** 0.5

        # Jitter should be <100μs for healthy RT system
        assert jitter < 100, \
            f"High latency jitter detected: {jitter:.1f}μs (indicates RT violations)"

    finally:
        await api_client.delete(f"/api/avb/streams/{stream_config['stream_id']}")


# ============================================================================
# System Call Tests
# ============================================================================

@pytest.mark.asyncio
async def test_no_blocking_syscalls(api_client, skip_if_avb_unavailable, check_debug_build):
    """
    Test that RT audio callback doesn't make blocking system calls.

    Requires debug build with syscall tracing (strace-like instrumentation).
    """
    # Enable syscall tracing
    response = await api_client.post("/api/avb/debug/start_syscall_trace", json={
        "duration_ms": 5000,
        "trace_rt_threads": True
    })

    if response is None or "error" in response:
        pytest.skip("Syscall tracing not available")

    # Wait for trace to complete
    await asyncio.sleep(6)

    # Get results
    trace = await api_client.get("/api/avb/debug/syscall_trace")
    assert trace is not None, "Failed to retrieve syscall trace"

    # Check for blocking syscalls in RT threads
    rt_syscalls = trace.get("rt_syscalls", [])

    # Allowed RT-safe syscalls
    allowed_syscalls = {
        "clock_gettime",  # CLOCK_MONOTONIC is RT-safe
        "gettimeofday",   # Generally RT-safe
        "sendto",         # With MSG_DONTWAIT
        "recvfrom",       # With MSG_DONTWAIT
    }

    # Filter blocking syscalls
    blocking_syscalls = [
        sc for sc in rt_syscalls
        if sc.get("name") not in allowed_syscalls or sc.get("blocking", False)
    ]

    assert len(blocking_syscalls) == 0, \
        f"Blocking syscalls detected in RT path: {blocking_syscalls}"


# ============================================================================
# Memory Barrier Tests
# ============================================================================

@pytest.mark.asyncio
async def test_proper_memory_barriers(api_client, skip_if_avb_unavailable, check_debug_build):
    """
    Test that lock-free code uses proper memory barriers.

    This is a best-effort test - full validation requires ThreadSanitizer.
    """
    # Check if engine was built with ThreadSanitizer
    config = await api_client.get("/api/system/build_config")

    if config and config.get("sanitizers", {}).get("thread"):
        # Engine has TSan - we can trust it caught issues at build time
        pytest.skip("ThreadSanitizer enabled - runtime barrier tests unnecessary")

    # Without TSan, we do behavioral stress testing
    # Create multiple streams to stress lock-free paths
    stream_ids = []

    try:
        for i in range(4):
            stream_config = {
                "stream_id": f"test-barrier-stream-{i}",
                "direction": "talker" if i % 2 == 0 else "listener",
                "channels": 2,
                "sample_rate": 48000,
                "destination_mac": f"91:e0:f0:00:fe:{10 + i:02x}"
            }

            response = await api_client.post("/api/avb/streams", json=stream_config)
            if response and "error" not in response:
                stream_ids.append(stream_config["stream_id"])

        # Rapidly query all stream stats concurrently
        # If memory barriers are missing, we might see torn reads
        for iteration in range(50):
            tasks = [
                api_client.get(f"/api/avb/streams/{stream_id}/stats")
                for stream_id in stream_ids
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Check all results are valid (not torn/corrupted)
            for result in results:
                if isinstance(result, dict):
                    # Sanity checks on stat values
                    if "packets_sent" in result:
                        assert result["packets_sent"] >= 0
                    if "latency_us" in result:
                        assert 0 <= result["latency_us"] < 100000

            await asyncio.sleep(0.05)  # 50ms between iterations

    finally:
        # Clean up
        for stream_id in stream_ids:
            await api_client.delete(f"/api/avb/streams/{stream_id}")


# ============================================================================
# Priority Inversion Tests
# ============================================================================

@pytest.mark.asyncio
async def test_no_priority_inversion(api_client, skip_if_avb_unavailable, check_debug_build):
    """
    Test that RT threads don't experience priority inversion.

    Requires debug build with priority monitoring.
    """
    # Enable priority trace
    response = await api_client.post("/api/avb/debug/start_priority_trace", json={
        "duration_ms": 10000
    })

    if response is None or "error" in response:
        pytest.skip("Priority tracing not available")

    # Wait for trace to complete
    await asyncio.sleep(11)

    # Get results
    trace = await api_client.get("/api/avb/debug/priority_trace")
    assert trace is not None, "Failed to retrieve priority trace"

    # Check for priority inversions
    inversions = trace.get("priority_inversions", [])

    # Priority inversions are serious RT violations
    assert len(inversions) == 0, \
        f"Priority inversions detected: {inversions}"


# ============================================================================
# Cache Line Alignment Tests
# ============================================================================

@pytest.mark.asyncio
async def test_atomic_alignment(api_client, skip_if_avb_unavailable, check_debug_build):
    """
    Test that atomic variables are properly cache-line aligned.

    Misaligned atomics can cause false sharing and performance degradation.
    """
    # Query memory layout info
    response = await api_client.get("/api/avb/debug/memory_layout")

    if response is None or "error" in response:
        pytest.skip("Memory layout inspection not available")

    # Check atomic variable alignments
    atomics = response.get("atomic_variables", [])

    for atomic in atomics:
        address = atomic.get("address", 0)
        size = atomic.get("size", 0)
        name = atomic.get("name", "unknown")

        # Atomic variables should be aligned to cache line (typically 64 bytes)
        assert address % 64 == 0, \
            f"Atomic variable '{name}' not cache-line aligned (address: 0x{address:x})"

        # Variables that are frequently accessed should be in separate cache lines
        # (this is a heuristic - would need profiling data for definitive check)


# ============================================================================
# Stress Tests
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.slow
async def test_sustained_rt_performance(api_client, skip_if_avb_unavailable):
    """
    Stress test: Run AVB streams for extended period, verify RT constraints maintained.

    This test runs for 60 seconds and is marked as slow.
    """
    stream_config = {
        "stream_id": "test-stress-stream",
        "direction": "talker",
        "channels": 8,  # Higher channel count for stress
        "sample_rate": 48000,
        "destination_mac": "91:e0:f0:00:fe:20"
    }

    response = await api_client.post("/api/avb/streams", json=stream_config)
    if response is None or "error" in response:
        pytest.skip("Cannot create test stream")

    try:
        start_time = time.time()
        max_latency = 0
        xrun_count_start = 0

        # Get initial xrun count
        initial_stats = await api_client.get(f"/api/avb/streams/{stream_config['stream_id']}/stats")
        if initial_stats:
            xrun_count_start = initial_stats.get("xruns", 0)

        # Run for 60 seconds
        while time.time() - start_time < 60:
            await asyncio.sleep(1)

            stats = await api_client.get(f"/api/avb/streams/{stream_config['stream_id']}/stats")
            if stats and "latency_us" in stats:
                max_latency = max(max_latency, stats["latency_us"])

        # Get final stats
        final_stats = await api_client.get(f"/api/avb/streams/{stream_config['stream_id']}/stats")
        xrun_count_end = final_stats.get("xruns", 0)
        xrun_delta = xrun_count_end - xrun_count_start

        # Assert RT constraints held for 60 seconds
        assert max_latency < 5000, \
            f"Latency exceeded 5ms during stress test: {max_latency}μs"

        # Allow up to 5 xruns during 60-second stress test
        # (some xruns can occur during startup/shutdown)
        assert xrun_delta <= 5, \
            f"Too many xruns during stress test: {xrun_delta}"

    finally:
        await api_client.delete(f"/api/avb/streams/{stream_config['stream_id']}")


# ============================================================================
# Documentation Tests
# ============================================================================

@pytest.mark.asyncio
async def test_rt_safety_documentation(api_client):
    """
    Test that RT safety constraints are documented.

    This is a meta-test ensuring code includes proper documentation.
    """
    # Check if API exposes RT safety documentation
    docs = await api_client.get("/api/avb/rt_safety_docs")

    if docs is None:
        pytest.skip("RT safety documentation not available via API")

    # Verify documentation covers key topics
    required_topics = [
        "memory_allocation",
        "lock_free_operations",
        "timing_constraints",
        "system_calls",
        "priority_inversion"
    ]

    documented_topics = docs.get("topics", [])

    for topic in required_topics:
        assert topic in documented_topics, \
            f"RT safety documentation missing topic: {topic}"
