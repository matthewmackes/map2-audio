"""
PlatformEvent LCD Surface - Performance Benchmarking

Measures:
- Event latency from creation to subscriber receipt
- Throughput in events/second
- Memory usage while emitting LCD-targeted events
- PlatformEventStore write/query performance
"""

from __future__ import annotations

import asyncio
import json
import psutil
import statistics
import tempfile
import time
from pathlib import Path
from typing import Dict, List

from app.services.platform_event.bus import PlatformEventBus
from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.factories import make_event
from app.services.platform_event.severity import Severity
from app.services.platform_event.store import PlatformEventStore


class LCDPerformanceBenchmark:
    """Run comprehensive PlatformEvent benchmarks for LCD-targeted traffic."""

    def __init__(self) -> None:
        self.results: dict[str, Dict] = {}
        self.latencies: List[float] = []
        self.process = psutil.Process()
        self._tmpdir = tempfile.TemporaryDirectory(prefix="map2-platform-event-bench-")
        self.store = PlatformEventStore(db_path=Path(self._tmpdir.name) / "platform-events.db")

    def _event(self, event_id: str, title: str, message: str) -> PlatformEvent:
        event = make_event(
            kind="lcd.system",
            severity=Severity.INFO,
            source_node="BENCH-NODE",
            source_service="benchmark",
            title=title,
            message=message,
            target_surfaces=["lcd"],
        )
        return event.model_copy(update={"event_id": event_id})

    async def benchmark_event_latency(self, num_events: int = 100) -> Dict:
        """Measure time from event creation to PlatformEvent subscriber receipt."""
        print(f"\n{'=' * 60}")
        print(f"Event Latency Benchmark ({num_events} events)")
        print(f"{'=' * 60}")

        bus = PlatformEventBus(store=self.store, enabled=True)
        received_times: dict[str, float] = {}

        def measure_receipt(event: PlatformEvent) -> None:
            received_times[event.event_id] = time.time()

        subscription = await bus.subscribe_callback(measure_receipt)
        creation_times: dict[str, float] = {}
        latencies: list[float] = []

        for index in range(num_events):
            event_id = f"bench-{index:04d}"
            creation_times[event_id] = time.time()
            await bus.emit(self._event(event_id, f"Bench Event {index}", "Performance test"))
            await asyncio.sleep(0.001)

        await asyncio.sleep(1)
        subscription.close()

        for event_id, recv_time in received_times.items():
            if event_id in creation_times:
                latencies.append((recv_time - creation_times[event_id]) * 1000)

        if not latencies:
            print("ERROR: No events received")
            return {}

        stats = {
            "min": min(latencies),
            "max": max(latencies),
            "mean": statistics.mean(latencies),
            "median": statistics.median(latencies),
            "stdev": statistics.stdev(latencies) if len(latencies) > 1 else 0,
            "p95": sorted(latencies)[int(len(latencies) * 0.95)] if latencies else 0,
            "p99": sorted(latencies)[int(len(latencies) * 0.99)] if latencies else 0,
        }

        print("Latencies (milliseconds):")
        print(f"  Min:    {stats['min']:.3f}")
        print(f"  Max:    {stats['max']:.3f}")
        print(f"  Mean:   {stats['mean']:.3f}")
        print(f"  Median: {stats['median']:.3f}")
        print(f"  StDev:  {stats['stdev']:.3f}")
        print(f"  P95:    {stats['p95']:.3f}")
        print(f"  P99:    {stats['p99']:.3f}")

        self.results["latency"] = stats
        return stats

    async def benchmark_throughput(self, duration_sec: int = 10) -> Dict:
        """Measure PlatformEvent emissions per second."""
        print(f"\n{'=' * 60}")
        print(f"Throughput Benchmark ({duration_sec} seconds)")
        print(f"{'=' * 60}")

        bus = PlatformEventBus(store=self.store, enabled=True)
        count = 0
        start_time = time.time()

        while time.time() - start_time < duration_sec:
            await bus.emit(self._event(f"tput-{count:06d}", "Throughput test", f"Event {count}"))
            count += 1

        elapsed = time.time() - start_time
        throughput = count / elapsed

        print(f"Events published: {count}")
        print(f"Duration: {elapsed:.1f}s")
        print(f"Throughput: {throughput:.1f} events/sec")

        stats = {
            "total_events": count,
            "duration_sec": elapsed,
            "events_per_sec": throughput,
        }

        self.results["throughput"] = stats
        return stats

    async def benchmark_memory(self, num_events: int = 1000) -> Dict:
        """Measure memory usage while emitting LCD-targeted PlatformEvents."""
        print(f"\n{'=' * 60}")
        print(f"Memory Benchmark ({num_events} events)")
        print(f"{'=' * 60}")

        bus = PlatformEventBus(store=self.store, enabled=True)
        mem_start = self.process.memory_info().rss / 1024 / 1024
        print(f"Baseline: {mem_start:.1f} MB")

        for index in range(num_events):
            await bus.emit(self._event(f"mem-{index:06d}", f"Memory test {index}", "x" * 100))
            if (index + 1) % 100 == 0:
                mem_current = self.process.memory_info().rss / 1024 / 1024
                print(f"After {index + 1} events: {mem_current:.1f} MB (+{mem_current - mem_start:.1f})")

        mem_end = self.process.memory_info().rss / 1024 / 1024
        mem_per_event = (mem_end - mem_start) / num_events

        print(f"Final: {mem_end:.1f} MB")
        print(f"Per-event: {mem_per_event:.3f} MB")

        stats = {
            "baseline_mb": mem_start,
            "final_mb": mem_end,
            "delta_mb": mem_end - mem_start,
            "per_event_kb": mem_per_event * 1024,
        }

        self.results["memory"] = stats
        return stats

    async def benchmark_database(self, num_events: int = 100) -> Dict:
        """Measure PlatformEventStore write and replay-query performance."""
        print(f"\n{'=' * 60}")
        print(f"Database Benchmark ({num_events} events)")
        print(f"{'=' * 60}")

        events = [
            self._event(f"db-{index:06d}", f"DB test {index}", "Performance test")
            for index in range(num_events)
        ]

        start = time.time()
        self.store.load_replay_events(limit=10)
        warmup_time = time.time() - start

        start = time.time()
        for event in events:
            self.store.persist_event(event)
        write_time = time.time() - start

        start = time.time()
        results = self.store.load_replay_events(limit=50)
        query_time = time.time() - start

        print(f"Warmup query: {warmup_time * 1000:.1f}ms")
        print(f"Writes: {write_time:.2f}s ({num_events / write_time:.1f} events/sec)")
        print(f"Query (limit 50): {query_time * 1000:.1f}ms")
        print(f"Results retrieved: {len(results)}")

        stats = {
            "write_time_sec": write_time,
            "write_throughput": num_events / write_time,
            "query_time_ms": query_time * 1000,
            "results_count": len(results),
        }

        self.results["database"] = stats
        return stats

    async def run_all(self) -> None:
        """Run all benchmarks."""
        print("\n" + "=" * 60)
        print("MAP2 PlatformEvent LCD Surface - Performance Benchmarks")
        print("=" * 60)

        await self.benchmark_event_latency(100)
        await self.benchmark_throughput(10)
        await self.benchmark_memory(500)
        await self.benchmark_database(100)

        print(f"\n{'=' * 60}")
        print("Summary")
        print(f"{'=' * 60}")

        if "latency" in self.results:
            lat = self.results["latency"]
            print(f"Latency: {lat['mean']:.3f}ms (+/-{lat['stdev']:.3f}ms)")

        if "throughput" in self.results:
            thr = self.results["throughput"]
            print(f"Throughput: {thr['events_per_sec']:.1f} events/sec")

        if "memory" in self.results:
            mem = self.results["memory"]
            print(f"Memory overhead: {mem['per_event_kb']:.2f} KB/event")

        if "database" in self.results:
            db = self.results["database"]
            print(f"Database write: {db['write_throughput']:.1f} events/sec")

        results_file = Path("benchmark_results.json")
        with open(results_file, "w", encoding="utf-8") as handle:
            json.dump(self.results, handle, indent=2)
        print(f"\nResults saved to: {results_file}")


async def main() -> None:
    """Run benchmarks."""
    benchmark = LCDPerformanceBenchmark()
    await benchmark.run_all()


if __name__ == "__main__":
    asyncio.run(main())
