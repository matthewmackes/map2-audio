"""
Dynamic DSP Allocation Manager
Intelligent CPU resource management with priority-based plugin selection.

Features:
- CPU budget calculation based on buffer size/sample rate
- Priority-based plugin enable/disable
- Three quality modes: Performance, Balanced, Quality
- Adaptive quality scaling
- Automatic bypass on CPU overload
- Real-time plugin selection algorithm
"""

import logging
from typing import Dict, List, Optional, Tuple
from enum import Enum
from dataclasses import dataclass

from app.utils.singleton import Singleton
from app.utils.logging_utils import get_logger

logger = get_logger(__name__)


class QualityMode(Enum):
    """DSP quality modes."""
    PERFORMANCE = "performance"  # Optimize for low latency, bypass heavy effects
    BALANCED = "balanced"        # Balance quality and CPU usage
    QUALITY = "quality"          # Use all plugins, accept higher latency


@dataclass
class PluginPriority:
    """Plugin priority configuration."""
    uri: str
    priority: int  # 1-10, where 10 is highest
    estimated_cpu_us: float = 0.0
    auto_bypass_on_overload: bool = True
    quality_level: int = 3  # 1-5, affects oversampling, IR length, etc.


class DSPManager(Singleton):
    """Dynamic DSP resource allocation manager."""
    
    def __init__(self, sample_rate: int = 48000, buffer_size: int = 256, target_cpu_percent: float = 70.0):
        """Initialize DSP manager.
        
        Args:
            sample_rate: Audio sample rate
            buffer_size: Audio buffer size
            target_cpu_percent: Target CPU utilization (0-100)
        """
        super().__init__()
        self.sample_rate = sample_rate
        self.buffer_size = buffer_size
        self.target_cpu_percent = target_cpu_percent
        
        # Calculate CPU budget
        self.buffer_time_us = (buffer_size * 1_000_000.0) / sample_rate
        self.cpu_budget_us = self.buffer_time_us * (target_cpu_percent / 100.0)
        
        # Plugin priorities
        self.plugin_priorities: Dict[str, PluginPriority] = {}
        
        # Current state
        self.current_mode = QualityMode.BALANCED
        self.active_plugins: List[str] = []
        self.bypassed_plugins: List[str] = []
        self.current_cpu_usage_us = 0.0
        
        # Priority profiles
        self.priority_profiles = self._init_priority_profiles()
        
        logger.info(f"DSP Manager initialized: {sample_rate}Hz, {buffer_size} samples")
        logger.info(f"CPU budget: {self.cpu_budget_us:.1f}μs ({target_cpu_percent}% of {self.buffer_time_us:.1f}μs)")
    
    def _init_priority_profiles(self) -> Dict[QualityMode, Dict[str, int]]:
        """Initialize priority profiles for each quality mode.
        
        Returns:
            Dict of mode -> category -> priority
        """
        return {
            QualityMode.PERFORMANCE: {
                # Low latency mode - essential processing only
                "amp": 10,
                "cabinet": 10,
                "overdrive": 9,
                "distortion": 9,
                "compressor": 8,
                "eq": 7,
                "gate": 7,
                "reverb": 3,  # Heavy, lower priority
                "delay": 4,
                "chorus": 4,
                "flanger": 4,
                "phaser": 4,
                "modulation": 4,
            },
            QualityMode.BALANCED: {
                # Balanced mode - most effects enabled
                "amp": 10,
                "cabinet": 10,
                "overdrive": 9,
                "distortion": 9,
                "compressor": 8,
                "gate": 7,
                "eq": 7,
                "reverb": 6,
                "delay": 6,
                "chorus": 6,
                "flanger": 6,
                "phaser": 6,
                "modulation": 6,
            },
            QualityMode.QUALITY: {
                # High quality mode - all effects at full quality
                "amp": 10,
                "cabinet": 10,
                "reverb": 9,
                "delay": 9,
                "overdrive": 9,
                "distortion": 9,
                "compressor": 8,
                "eq": 8,
                "gate": 8,
                "chorus": 8,
                "flanger": 8,
                "phaser": 8,
                "modulation": 8,
            }
        }
    
    def register_plugin(self, uri: str, category: str = "utility", estimated_cpu_us: float = 100.0) -> None:
        """Register a plugin for DSP management.
        
        Args:
            uri: Plugin URI
            category: Plugin category for priority lookup
            estimated_cpu_us: Estimated CPU time in microseconds
        """
        # Get priority based on current mode and category
        category_lower = category.lower()
        priority = self.priority_profiles[self.current_mode].get(category_lower, 5)
        
        self.plugin_priorities[uri] = PluginPriority(
            uri=uri,
            priority=priority,
            estimated_cpu_us=estimated_cpu_us
        )
        
        logger.debug(f"Registered plugin {uri}: priority={priority}, cpu={estimated_cpu_us:.1f}μs")
    
    def set_plugin_priority(self, uri: str, priority: int) -> bool:
        """Manually set plugin priority.
        
        Args:
            uri: Plugin URI
            priority: Priority 1-10 (10 is highest)
            
        Returns:
            True if set, False if plugin not found
        """
        if uri not in self.plugin_priorities:
            return False
        
        priority = max(1, min(10, priority))  # Clamp to 1-10
        self.plugin_priorities[uri].priority = priority
        logger.info(f"Set priority for {uri}: {priority}")
        return True
    
    def update_plugin_cpu_estimate(self, uri: str, cpu_us: float) -> None:
        """Update plugin's CPU usage estimate from profiler data.
        
        Args:
            uri: Plugin URI
            cpu_us: CPU time in microseconds
        """
        if uri in self.plugin_priorities:
            self.plugin_priorities[uri].estimated_cpu_us = cpu_us
    
    def set_quality_mode(self, mode: QualityMode) -> None:
        """Set DSP quality mode.
        
        Args:
            mode: Quality mode
        """
        self.current_mode = mode
        
        # Update priorities for all registered plugins
        for uri, plugin_prio in self.plugin_priorities.items():
            # Try to determine category from URI/name
            category = self._guess_plugin_category(uri)
            new_priority = self.priority_profiles[mode].get(category, 5)
            plugin_prio.priority = new_priority
        
        logger.info(f"Quality mode set to {mode.value}")
        
        # Re-evaluate plugin selection
        self.evaluate_chain(list(self.plugin_priorities.keys()))
    
    def _guess_plugin_category(self, uri: str) -> str:
        """Guess plugin category from URI.
        
        Args:
            uri: Plugin URI
            
        Returns:
            Category string (lowercase)
        """
        uri_lower = uri.lower()
        
        if any(x in uri_lower for x in ['amp', 'amplifier']):
            return 'amp'
        elif any(x in uri_lower for x in ['cab', 'cabinet', 'impulse']):
            return 'cabinet'
        elif any(x in uri_lower for x in ['reverb', 'verb']):
            return 'reverb'
        elif any(x in uri_lower for x in ['delay', 'echo']):
            return 'delay'
        elif any(x in uri_lower for x in ['dist', 'overdrive', 'fuzz']):
            return 'distortion'
        elif any(x in uri_lower for x in ['comp', 'limiter']):
            return 'compressor'
        elif 'eq' in uri_lower or 'equalizer' in uri_lower or 'equaliser' in uri_lower:
            return 'eq'
        elif any(x in uri_lower for x in ['chorus', 'flanger', 'phaser']):
            return 'modulation'
        else:
            return 'utility'
    
    def evaluate_chain(self, plugin_uris: List[str]) -> Tuple[List[str], List[str]]:
        """Evaluate which plugins can run within CPU budget.
        
        Uses priority-based selection to fit plugins into available CPU time.
        
        Args:
            plugin_uris: List of plugin URIs in chain
            
        Returns:
            Tuple of (active_plugins, bypassed_plugins)
        """
        # Get plugins with priorities
        plugins_with_priority = []
        for uri in plugin_uris:
            if uri in self.plugin_priorities:
                plugins_with_priority.append(self.plugin_priorities[uri])
            else:
                # Unknown plugin - register with default priority
                self.register_plugin(uri, "utility", 100.0)
                plugins_with_priority.append(self.plugin_priorities[uri])
        
        # Sort by priority (highest first)
        plugins_with_priority.sort(key=lambda p: p.priority, reverse=True)
        
        # Select plugins that fit in budget
        available_cpu = self.cpu_budget_us
        active = []
        bypassed = []
        
        for plugin in plugins_with_priority:
            estimated_cpu = plugin.estimated_cpu_us
            
            if available_cpu >= estimated_cpu:
                active.append(plugin.uri)
                available_cpu -= estimated_cpu
            else:
                # CPU budget exceeded
                if plugin.auto_bypass_on_overload:
                    bypassed.append(plugin.uri)
                    logger.warning(f"Insufficient CPU for {plugin.uri} "
                                 f"(needs {estimated_cpu:.1f}μs, have {available_cpu:.1f}μs)")
                else:
                    # Force enable even if over budget
                    active.append(plugin.uri)
                    available_cpu -= estimated_cpu
        
        self.active_plugins = active
        self.bypassed_plugins = bypassed
        self.current_cpu_usage_us = self.cpu_budget_us - available_cpu
        
        utilization = (self.current_cpu_usage_us / self.cpu_budget_us) * 100.0
        logger.info(f"DSP evaluation: {len(active)} active, {len(bypassed)} bypassed, "
                   f"{utilization:.1f}% budget used")
        
        return (active, bypassed)
    
    def get_cpu_headroom_us(self) -> float:
        """Get available CPU headroom.
        
        Returns:
            Available CPU time in microseconds
        """
        return self.cpu_budget_us - self.current_cpu_usage_us
    
    def get_cpu_utilization_percent(self) -> float:
        """Get current CPU utilization as percentage of budget.
        
        Returns:
            Utilization percentage (0-100+)
        """
        if self.cpu_budget_us == 0:
            return 0.0
        return (self.current_cpu_usage_us / self.cpu_budget_us) * 100.0
    
    def is_cpu_overloaded(self) -> bool:
        """Check if CPU is overloaded (>100% of budget).
        
        Returns:
            True if overloaded
        """
        return self.current_cpu_usage_us > self.cpu_budget_us
    
    def set_target_cpu_percent(self, target_percent: float) -> None:
        """Set target CPU utilization percentage.
        
        Args:
            target_percent: Target percentage (0-100)
        """
        self.target_cpu_percent = max(10.0, min(95.0, target_percent))
        self.cpu_budget_us = self.buffer_time_us * (self.target_cpu_percent / 100.0)
        logger.info(f"CPU budget updated: {self.cpu_budget_us:.1f}μs ({self.target_cpu_percent}%)")
    
    def update_buffer_config(self, sample_rate: int, buffer_size: int) -> None:
        """Update buffer configuration.
        
        Args:
            sample_rate: New sample rate
            buffer_size: New buffer size
        """
        self.sample_rate = sample_rate
        self.buffer_size = buffer_size
        self.buffer_time_us = (buffer_size * 1_000_000.0) / sample_rate
        self.cpu_budget_us = self.buffer_time_us * (self.target_cpu_percent / 100.0)
        
        logger.info(f"Buffer config updated: {sample_rate}Hz, {buffer_size} samples, "
                   f"{self.cpu_budget_us:.1f}μs budget")
    
    def get_status(self) -> Dict:
        """Get DSP manager status.
        
        Returns:
            Status dict
        """
        return {
            "mode": self.current_mode.value,
            "sample_rate": self.sample_rate,
            "buffer_size": self.buffer_size,
            "buffer_time_us": self.buffer_time_us,
            "target_cpu_percent": self.target_cpu_percent,
            "cpu_budget_us": self.cpu_budget_us,
            "cpu_used_us": self.current_cpu_usage_us,
            "cpu_available_us": self.get_cpu_headroom_us(),
            "utilization_percent": self.get_cpu_utilization_percent(),
            "is_overloaded": self.is_cpu_overloaded(),
            "active_plugins": len(self.active_plugins),
            "bypassed_plugins": len(self.bypassed_plugins),
            "registered_plugins": len(self.plugin_priorities)
        }
    
    def get_plugin_priorities(self) -> List[Dict]:
        """Get all plugin priorities.
        
        Returns:
            List of plugin priority dicts
        """
        priorities = []
        for uri, plugin in self.plugin_priorities.items():
            priorities.append({
                "uri": uri,
                "priority": plugin.priority,
                "estimated_cpu_us": plugin.estimated_cpu_us,
                "auto_bypass": plugin.auto_bypass_on_overload,
                "status": "active" if uri in self.active_plugins else "bypassed"
            })
        
        # Sort by priority
        priorities.sort(key=lambda p: p["priority"], reverse=True)
        return priorities


def get_dsp_manager(sample_rate: int = 48000, buffer_size: int = 256) -> DSPManager:
    """Get or create DSP manager instance."""
    manager = DSPManager.get_instance()
    # Update configuration if needed
    if manager.sample_rate != sample_rate or manager.buffer_size != buffer_size:
        manager.sample_rate = sample_rate
        manager.buffer_size = buffer_size
        manager._calculate_cpu_budget()
    return manager
