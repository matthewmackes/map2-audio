"""
Metrics collection daemon - runs in separate process to prevent RT thread blocking.
This prevents psutil.cpu_percent() from blocking the real-time audio thread.
"""

import asyncio
import json
import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class MetricsDaemon:
    """Non-blocking metrics collector using /proc filesystem"""
    
    def __init__(self, metrics_file: Optional[Path] = None, update_interval: float = 10.0):
        """
        Initialize metrics daemon.
        
        Args:
            metrics_file: Path to write metrics JSON (default: /run/map2-audio/metrics.json)
            update_interval: Seconds between updates (default: 10)
        """
        self.metrics_file = metrics_file or Path("/run/map2-audio/metrics.json")
        self.update_interval = update_interval
        self.running = False
        self.task: Optional[asyncio.Task] = None
    
    async def start(self) -> None:
        """Start the metrics daemon"""
        if self.running:
            logger.warning("Metrics daemon already running")
            return
        
        self.running = True
        self.task = asyncio.create_task(self._collection_loop())
        logger.info(f"Metrics daemon started (interval: {self.update_interval}s)")
    
    async def stop(self) -> None:
        """Stop the metrics daemon"""
        if not self.running:
            return
        
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        
        logger.info("Metrics daemon stopped")
    
    async def _collection_loop(self) -> None:
        """Main collection loop (runs in background)"""
        while self.running:
            try:
                # Run collection in executor to not block event loop
                loop = asyncio.get_event_loop()
                metrics = await loop.run_in_executor(
                    None,
                    self._collect_metrics
                )
                
                # Write metrics atomically
                self._write_metrics_atomic(metrics)
                
                await asyncio.sleep(self.update_interval)
            except Exception as e:
                logger.error(f"Metrics collection error: {e}")
                await asyncio.sleep(self.update_interval)
    
    def _collect_metrics(self) -> Dict[str, Any]:
        """
        Collect metrics from /proc filesystem (non-blocking).
        Runs in thread pool, so doesn't block RT thread.
        """
        try:
            metrics = {
                'timestamp': time.time(),
                'cpu': self._read_cpu_metrics(),
                'memory': self._read_memory_metrics(),
                'disk': self._read_disk_metrics(),
            }
            return metrics
        except Exception as e:
            logger.error(f"Error collecting metrics: {e}")
            return {
                'timestamp': time.time(),
                'error': str(e)
            }
    
    @staticmethod
    def _read_cpu_metrics() -> Dict[str, Any]:
        """Read CPU metrics from /proc/stat"""
        try:
            with open('/proc/stat') as f:
                lines = f.readlines()
            
            # Parse first line (overall CPU)
            cpu_line = lines[0].split()
            user = int(cpu_line[1])
            nice = int(cpu_line[2])
            system = int(cpu_line[3])
            idle = int(cpu_line[4])
            iowait = int(cpu_line[5]) if len(cpu_line) > 5 else 0
            
            total = user + nice + system + idle + iowait
            
            return {
                'user': user,
                'nice': nice,
                'system': system,
                'idle': idle,
                'iowait': iowait,
                'total': total,
                'percent': 0 if total == 0 else 100.0 * (total - idle) / total
            }
        except Exception as e:
            logger.error(f"Error reading CPU metrics: {e}")
            return {'error': str(e)}
    
    @staticmethod
    def _read_memory_metrics() -> Dict[str, Any]:
        """Read memory metrics from /proc/meminfo"""
        try:
            with open('/proc/meminfo') as f:
                meminfo = {}
                for line in f:
                    key, value = line.split(':')
                    meminfo[key.strip()] = int(value.split()[0]) * 1024  # Convert to bytes
            
            total = meminfo.get('MemTotal', 0)
            available = meminfo.get('MemAvailable', 0)
            used = total - available
            
            return {
                'total': total,
                'available': available,
                'used': used,
                'percent': 0 if total == 0 else 100.0 * used / total,
                'buffers': meminfo.get('Buffers', 0),
                'cached': meminfo.get('Cached', 0),
            }
        except Exception as e:
            logger.error(f"Error reading memory metrics: {e}")
            return {'error': str(e)}
    
    @staticmethod
    def _read_disk_metrics() -> Dict[str, Any]:
        """Read disk metrics using /proc"""
        try:
            result = subprocess.run(
                ['df', '-B1', '/'],
                capture_output=True,
                text=True,
                timeout=2
            )
            
            if result.returncode != 0:
                return {'error': 'df command failed'}
            
            lines = result.stdout.strip().split('\n')
            if len(lines) < 2:
                return {'error': 'Unexpected df output'}
            
            parts = lines[1].split()
            total = int(parts[1])
            used = int(parts[2])
            available = int(parts[3])
            
            return {
                'total': total,
                'used': used,
                'available': available,
                'percent': 0 if total == 0 else 100.0 * used / total,
            }
        except Exception as e:
            logger.error(f"Error reading disk metrics: {e}")
            return {'error': str(e)}
    
    def _write_metrics_atomic(self, metrics: Dict[str, Any]) -> None:
        """Write metrics file atomically"""
        try:
            # Ensure directory exists
            self.metrics_file.parent.mkdir(parents=True, exist_ok=True)
            
            # Write to temporary file
            temp_file = self.metrics_file.with_suffix('.tmp')
            with open(temp_file, 'w') as f:
                json.dump(metrics, f, indent=2)
            
            # Atomic rename
            temp_file.replace(self.metrics_file)
        except Exception as e:
            logger.error(f"Error writing metrics: {e}")
    
    async def get_metrics(self) -> Dict[str, Any]:
        """Get latest metrics from file"""
        try:
            if self.metrics_file.exists():
                with open(self.metrics_file) as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error reading metrics file: {e}")
        
        return {'error': 'Metrics not available'}


# Global instance
_daemon: Optional[MetricsDaemon] = None


async def start_metrics_daemon(
    metrics_file: Optional[Path] = None,
    update_interval: float = 10.0
) -> MetricsDaemon:
    """Start global metrics daemon"""
    global _daemon
    
    if _daemon is None:
        _daemon = MetricsDaemon(metrics_file, update_interval)
        await _daemon.start()
    
    return _daemon


async def stop_metrics_daemon() -> None:
    """Stop global metrics daemon"""
    global _daemon
    
    if _daemon is not None:
        await _daemon.stop()
        _daemon = None


def get_metrics_daemon() -> Optional[MetricsDaemon]:
    """Get global metrics daemon instance"""
    return _daemon
