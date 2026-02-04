"""
Developer Mode Manager
======================
Python interface to the build-tune.sh script for TUI integration.

Provides:
- Check current mode (DEVELOPMENT vs STAGE)
- Toggle between modes
- Get detailed system status
- Parse script output for display
"""

import os
import subprocess
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)

# Path to the build-tune script
SCRIPT_DIR = Path(__file__).parent.parent / "scripts" / "dev"
BUILD_TUNE_SCRIPT = SCRIPT_DIR / "build-tune.sh"
STATE_FILE = Path("/tmp/juce-build-tune.state")


@dataclass
class DevModeStatus:
    """Current developer mode status."""
    is_dev_mode: bool = False
    backend_running: bool = True
    frontend_running: bool = True
    backend_pid: Optional[int] = None
    frontend_pid: Optional[int] = None
    
    # System settings
    swappiness: int = 10
    dirty_ratio: int = 20
    memory_used_mb: int = 0
    memory_total_gb: int = 0
    optimal_jobs: int = 4
    
    # CPU info
    cpu_model: str = ""
    cpu_cores: int = 0
    cpu_governor: str = "unavailable"
    turbo_boost: str = "unavailable"
    io_scheduler: str = ""
    thp_mode: str = ""
    
    # Error state
    error: Optional[str] = None
    
    # Raw output for debugging
    raw_output: str = ""


class DevModeManager:
    """
    Manager for Developer Mode (build optimization) state.
    
    Interfaces with the build-tune.sh script to:
    - Check if dev mode is active
    - Enable/disable dev mode
    - Get detailed system status
    """
    
    def __init__(self):
        self._last_status: Optional[DevModeStatus] = None
        self._script_path = str(BUILD_TUNE_SCRIPT)
        
    def _check_script_exists(self) -> bool:
        """Check if the build-tune script exists."""
        return BUILD_TUNE_SCRIPT.exists()
    
    def _parse_state_file(self) -> Dict[str, str]:
        """Parse the state file if it exists."""
        state = {}
        if STATE_FILE.exists():
            try:
                with open(STATE_FILE, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if '=' in line:
                            key, value = line.split('=', 1)
                            state[key] = value
            except Exception as e:
                logger.warning(f"Failed to parse state file: {e}")
        return state
    
    def is_dev_mode(self) -> bool:
        """Quick check if dev mode is currently active."""
        state = self._parse_state_file()
        return state.get("JUCE_BUILD_OPTIMIZED") == "1"
    
    def _parse_status_output(self, output: str) -> DevModeStatus:
        """Parse the status command output."""
        status = DevModeStatus()
        status.raw_output = output
        
        lines = output.split('\n')
        
        for line in lines:
            line = line.strip()
            
            # Parse CPU info
            if line.startswith("CPU:"):
                status.cpu_model = line.split(":", 1)[1].strip()
            elif line.startswith("Cores:"):
                try:
                    status.cpu_cores = int(line.split(":", 1)[1].strip())
                except ValueError:
                    pass
            elif line.startswith("Memory:"):
                # Parse "15GB (7559MB used)"
                mem_part = line.split(":", 1)[1].strip()
                if "GB" in mem_part:
                    try:
                        status.memory_total_gb = int(mem_part.split("GB")[0].strip())
                    except ValueError:
                        pass
                if "MB used" in mem_part:
                    try:
                        used_part = mem_part.split("(")[1].split("MB")[0]
                        status.memory_used_mb = int(used_part)
                    except (ValueError, IndexError):
                        pass
            elif line.startswith("Optimal -j:"):
                try:
                    status.optimal_jobs = int(line.split(":", 1)[1].strip())
                except ValueError:
                    pass
            
            # Parse settings
            elif line.startswith("CPU Governor:"):
                status.cpu_governor = line.split(":", 1)[1].strip()
            elif line.startswith("Turbo Boost:"):
                status.turbo_boost = line.split(":", 1)[1].strip()
            elif line.startswith("I/O Scheduler:"):
                status.io_scheduler = line.split(":", 1)[1].strip()
            elif line.startswith("THP:"):
                status.thp_mode = line.split(":", 1)[1].strip()
            elif line.startswith("Swappiness:"):
                try:
                    status.swappiness = int(line.split(":", 1)[1].strip())
                except ValueError:
                    pass
            elif line.startswith("Dirty Ratio:"):
                try:
                    status.dirty_ratio = int(line.split(":", 1)[1].strip())
                except ValueError:
                    pass
            
            # Parse service status
            elif "Backend:" in line:
                if "RUNNING" in line:
                    status.backend_running = True
                    # Try to extract PID
                    if "PID:" in line:
                        try:
                            pid_part = line.split("PID:")[1].split(")")[0].strip()
                            status.backend_pid = int(pid_part)
                        except (ValueError, IndexError):
                            pass
                elif "STOPPED" in line:
                    status.backend_running = False
                    status.backend_pid = None
            elif "Frontend:" in line:
                if "RUNNING" in line:
                    status.frontend_running = True
                    if "PID:" in line:
                        try:
                            pid_part = line.split("PID:")[1].split(")")[0].strip()
                            status.frontend_pid = int(pid_part)
                        except (ValueError, IndexError):
                            pass
                elif "STOPPED" in line:
                    status.frontend_running = False
                    status.frontend_pid = None
            
            # Parse mode
            elif "Build Optimization: ACTIVE" in line:
                status.is_dev_mode = True
            elif "Build Optimization: INACTIVE" in line:
                status.is_dev_mode = False
        
        return status
    
    async def get_status(self) -> DevModeStatus:
        """Get current status asynchronously."""
        if not self._check_script_exists():
            status = DevModeStatus()
            status.error = f"Script not found: {self._script_path}"
            return status
        
        try:
            proc = await asyncio.create_subprocess_exec(
                self._script_path, "status",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            
            output = stdout.decode('utf-8', errors='replace')
            status = self._parse_status_output(output)
            
            if proc.returncode != 0:
                status.error = stderr.decode('utf-8', errors='replace')
            
            self._last_status = status
            return status
            
        except Exception as e:
            status = DevModeStatus()
            status.error = str(e)
            return status
    
    def get_status_sync(self) -> DevModeStatus:
        """Get current status synchronously."""
        if not self._check_script_exists():
            status = DevModeStatus()
            status.error = f"Script not found: {self._script_path}"
            return status
        
        try:
            result = subprocess.run(
                [self._script_path, "status"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            status = self._parse_status_output(result.stdout)
            
            if result.returncode != 0:
                status.error = result.stderr
            
            self._last_status = status
            return status
            
        except subprocess.TimeoutExpired:
            status = DevModeStatus()
            status.error = "Status check timed out"
            return status
        except Exception as e:
            status = DevModeStatus()
            status.error = str(e)
            return status
    
    async def enable_dev_mode(self) -> tuple[bool, str]:
        """
        Enable developer mode (stop services, optimize for build).
        
        Returns:
            Tuple of (success, message)
        """
        if not self._check_script_exists():
            return False, f"Script not found: {self._script_path}"
        
        try:
            # Need sudo for full optimization
            proc = await asyncio.create_subprocess_exec(
                "sudo", self._script_path, "on",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            
            output = stdout.decode('utf-8', errors='replace')
            
            if proc.returncode == 0:
                return True, "Developer mode enabled - services stopped, system optimized for builds"
            else:
                error = stderr.decode('utf-8', errors='replace')
                return False, f"Failed to enable dev mode: {error}"
                
        except Exception as e:
            return False, f"Error enabling dev mode: {e}"
    
    async def disable_dev_mode(self) -> tuple[bool, str]:
        """
        Disable developer mode (restore services, normal operation).
        
        Returns:
            Tuple of (success, message)
        """
        if not self._check_script_exists():
            return False, f"Script not found: {self._script_path}"
        
        try:
            proc = await asyncio.create_subprocess_exec(
                "sudo", self._script_path, "off",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            
            output = stdout.decode('utf-8', errors='replace')
            
            if proc.returncode == 0:
                return True, "Stage mode restored - services restarted, normal operation"
            else:
                error = stderr.decode('utf-8', errors='replace')
                return False, f"Failed to disable dev mode: {error}"
                
        except Exception as e:
            return False, f"Error disabling dev mode: {e}"
    
    async def toggle_mode(self) -> tuple[bool, str]:
        """Toggle between dev and stage mode."""
        if self.is_dev_mode():
            return await self.disable_dev_mode()
        else:
            return await self.enable_dev_mode()
    
    def get_build_command(self) -> str:
        """Get the recommended build command."""
        status = self._last_status or self.get_status_sync()
        jobs = status.optimal_jobs or 4
        return f"nice -n -10 make -j{jobs}"
    
    def get_build_command_with_ionice(self) -> str:
        """Get the recommended build command with I/O priority."""
        status = self._last_status or self.get_status_sync()
        jobs = status.optimal_jobs or 4
        return f"nice -n -10 ionice -c2 -n0 make -j{jobs}"


# Singleton instance
dev_mode_manager = DevModeManager()
