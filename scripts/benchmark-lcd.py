"""
LCD Event System - Performance Benchmarking

Measures:
- Event latency (creation to display)
- Throughput (events/second)
- Memory usage
- Database query performance
- WebSocket broadcast speed
- Multi-node propagation
"""

import asyncio
import time
import psutil
import statistics
from typing import List, Dict
from datetime import datetime
import json
from pathlib import Path

from app.services.lcd_manager import LCDManager
from app.services.lcd_event_bus import LCDEventBus
from app.lcd_models.lcd_event import LCDEvent, EventType, EventSeverity


class LCDPerformanceBenchmark:
    """Run comprehensive performance benchmarks."""
    
    def __init__(self):
        self.results = {}
        self.latencies: List[float] = []
        self.process = psutil.Process()
    
    async def benchmark_event_latency(self, num_events: int = 100) -> Dict:
        """Measure time from event creation to display."""
        print(f"\n{'='*60}")
        print(f"Event Latency Benchmark ({num_events} events)")
        print(f"{'='*60}")
        
        bus = LCDEventBus("BENCH-NODE", "benchmark")
        await bus.start()
        
        received_times = {}
        
        def measure_receipt(event):
            received_times[event.event_id] = time.time()
        
        bus.subscribe(measure_receipt)
        
        # Create events and measure time
        creation_times = {}
        latencies = []
        
        for i in range(num_events):
            event_id = f"bench-{i:04d}"
            creation_times[event_id] = time.time()
            
            event = LCDEvent(
                event_id=event_id,
                timestamp=datetime.now(),
                source_node="BENCH-NODE",
                event_type=EventType.SYSTEM,
                severity=EventSeverity.INFO,
                title=f"Bench Event {i}",
                message="Performance test"
            )
            
            await bus.publish(event)
            await asyncio.sleep(0.001)  # Small delay between events
        
        # Wait for all receipts
        await asyncio.sleep(1)
        
        # Calculate latencies
        for event_id, recv_time in received_times.items():
            if event_id in creation_times:
                latency = (recv_time - creation_times[event_id]) * 1000  # ms
                latencies.append(latency)
        
        await bus.stop()
        
        # Statistics
        if latencies:
            stats = {
                "min": min(latencies),
                "max": max(latencies),
                "mean": statistics.mean(latencies),
                "median": statistics.median(latencies),
                "stdev": statistics.stdev(latencies) if len(latencies) > 1 else 0,
                "p95": sorted(latencies)[int(len(latencies) * 0.95)] if latencies else 0,
                "p99": sorted(latencies)[int(len(latencies) * 0.99)] if latencies else 0,
            }
            
            print(f"Latencies (milliseconds):")
            print(f"  Min:    {stats['min']:.3f}")
            print(f"  Max:    {stats['max']:.3f}")
            print(f"  Mean:   {stats['mean']:.3f}")
            print(f"  Median: {stats['median']:.3f}")
            print(f"  StDev:  {stats['stdev']:.3f}")
            print(f"  P95:    {stats['p95']:.3f}")
            print(f"  P99:    {stats['p99']:.3f}")
            
            self.results['latency'] = stats
            return stats
        else:
            print("ERROR: No events received")
            return {}
    
    async def benchmark_throughput(self, duration_sec: int = 10) -> Dict:
        """Measure events per second."""
        print(f"\n{'='*60}")
        print(f"Throughput Benchmark ({duration_sec} seconds)")
        print(f"{'='*60}")
        
        bus = LCDEventBus("BENCH-NODE", "benchmark")
        await bus.start()
        
        count = 0
        start_time = time.time()
        
        # Publish events as fast as possible
        while time.time() - start_time < duration_sec:
            event = LCDEvent(
                event_id=f"tput-{count:06d}",
                timestamp=datetime.now(),
                source_node="BENCH-NODE",
                event_type=EventType.SYSTEM,
                severity=EventSeverity.INFO,
                title="Throughput test",
                message=f"Event {count}"
            )
            
            await bus.publish(event)
            count += 1
        
        elapsed = time.time() - start_time
        throughput = count / elapsed
        
        print(f"Events published: {count}")
        print(f"Duration: {elapsed:.1f}s")
        print(f"Throughput: {throughput:.1f} events/sec")
        
        await bus.stop()
        
        stats = {
            "total_events": count,
            "duration_sec": elapsed,
            "events_per_sec": throughput
        }
        
        self.results['throughput'] = stats
        return stats
    
    async def benchmark_memory(self, num_events: int = 1000) -> Dict:
        """Measure memory usage with growing event queue."""
        print(f"\n{'='*60}")
        print(f"Memory Benchmark ({num_events} events)")
        print(f"{'='*60}")
        
        bus = LCDEventBus("BENCH-NODE", "benchmark")
        await bus.start()
        
        # Get baseline
        mem_start = self.process.memory_info().rss / 1024 / 1024  # MB
        print(f"Baseline: {mem_start:.1f} MB")
        
        # Add events
        for i in range(num_events):
            event = LCDEvent(
                event_id=f"mem-{i:06d}",
                timestamp=datetime.now(),
                source_node="BENCH-NODE",
                event_type=EventType.SYSTEM,
                severity=EventSeverity.INFO,
                title=f"Memory test {i}",
                message="x" * 100  # Add some message content
            )
            
            await bus.publish(event)
            
            if (i + 1) % 100 == 0:
                mem_current = self.process.memory_info().rss / 1024 / 1024
                print(f"After {i+1} events: {mem_current:.1f} MB (+{mem_current-mem_start:.1f})")
        
        mem_end = self.process.memory_info().rss / 1024 / 1024
        mem_per_event = (mem_end - mem_start) / num_events
        
        print(f"Final: {mem_end:.1f} MB")
        print(f"Per-event: {mem_per_event:.3f} MB")
        
        await bus.stop()
        
        stats = {
            "baseline_mb": mem_start,
            "final_mb": mem_end,
            "delta_mb": mem_end - mem_start,
            "per_event_kb": mem_per_event * 1024
        }
        
        self.results['memory'] = stats
        return stats
    
    async def benchmark_database(self, num_events: int = 100) -> Dict:
        """Measure database write performance."""
        print(f"\n{'='*60}")
        print(f"Database Benchmark ({num_events} events)")
        print(f"{'='*60}")
        
        try:
            from app.services.lcd_event_persistence import LCDEventPersistence
            from app.database_session import get_session
            
            persistence = LCDEventPersistence(get_session)
            await persistence.start()
            
            # Measure write time
            events = []
            for i in range(num_events):
                events.append({
                    "event_id": f"db-{i:06d}",
                    "timestamp": datetime.now().isoformat(),
                    "source_node": "BENCH-NODE",
                    "event_type": "system",
                    "severity": "info",
                    "title": f"DB test {i}",
                    "message": "Performance test",
                    "icon": "•",
                    "color": "white",
                    "broadcast": True,
                    "target_nodes": [],
                    "ttl": 300,
                    "context": {}
                })
            
            start = time.time()
            await persistence.get_recent_events(limit=10)  # Warm up
            warmup_time = time.time() - start
            
            start = time.time()
            for event in events:
                await persistence.persist_event(event)
            
            await asyncio.sleep(2)  # Wait for batch
            write_time = time.time() - start
            
            # Query benchmark
            start = time.time()
            results = await persistence.get_recent_events(limit=50)
            query_time = time.time() - start
            
            await persistence.stop()
            
            print(f"Writes: {write_time:.2f}s ({num_events/write_time:.1f} events/sec)")
            print(f"Query (limit 50): {query_time*1000:.1f}ms")
            print(f"Results retrieved: {len(results)}")
            
            stats = {
                "write_time_sec": write_time,
                "write_throughput": num_events / write_time,
                "query_time_ms": query_time * 1000,
                "results_count": len(results)
            }
            
            self.results['database'] = stats
            return stats
            
        except Exception as e:
            print(f"Database benchmark skipped: {e}")
            return {}
    
    async def run_all(self):
        """Run all benchmarks."""
        print("\n" + "="*60)
        print("MAP2 LCD Event System - Performance Benchmarks")
        print("="*60)
        
        await self.benchmark_event_latency(100)
        await self.benchmark_throughput(10)
        await self.benchmark_memory(500)
        await self.benchmark_database(100)
        
        # Summary
        print(f"\n{'='*60}")
        print("Summary")
        print(f"{'='*60}")
        
        if 'latency' in self.results:
            lat = self.results['latency']
            print(f"Latency: {lat['mean']:.3f}ms (±{lat['stdev']:.3f}ms)")
        
        if 'throughput' in self.results:
            thr = self.results['throughput']
            print(f"Throughput: {thr['events_per_sec']:.1f} events/sec")
        
        if 'memory' in self.results:
            mem = self.results['memory']
            print(f"Memory overhead: {mem['per_event_kb']:.2f} KB/event")
        
        if 'database' in self.results:
            db = self.results['database']
            print(f"Database write: {db['write_throughput']:.1f} events/sec")
        
        # Save results
        results_file = Path("benchmark_results.json")
        with open(results_file, 'w') as f:
            json.dump(self.results, f, indent=2)
        print(f"\nResults saved to: {results_file}")


async def main():
    """Run benchmarks."""
    benchmark = LCDPerformanceBenchmark()
    await benchmark.run_all()


if __name__ == "__main__":
    asyncio.run(main())
