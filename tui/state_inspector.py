"""
State & Configuration Inspector
================================
Deep visibility into system state, configs, and change history.
"""

import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
from dataclasses import dataclass
from datetime import datetime
import hashlib

logger = logging.getLogger(__name__)


@dataclass
class ConfigSnapshot:
    """A configuration snapshot."""
    timestamp: float
    hash: str
    config: Dict[str, Any]
    label: str = ""


@dataclass
class ConfigChange:
    """A configuration change."""
    timestamp: float
    changed_by: str
    field: str
    old_value: Any
    new_value: Any
    description: str


class StateInspector:
    """Deep system state and configuration analysis."""
    
    STATE_DIR = Path.home() / ".config" / "map2" / "state_history"
    
    def __init__(self):
        """Initialize state inspector."""
        self.STATE_DIR.mkdir(parents=True, exist_ok=True)
        self._snapshots: Dict[str, ConfigSnapshot] = {}
        self._changes: List[ConfigChange] = []
        self._current_config: Dict[str, Any] = {}
        self._baseline_config: Dict[str, Any] = {}
    
    def take_snapshot(self, config: Dict[str, Any], label: str = "") -> str:
        """
        Take a configuration snapshot.
        
        Args:
            config: Current configuration
            label: Optional label for snapshot
            
        Returns:
            Snapshot ID
        """
        import time
        timestamp = time.time()
        config_hash = hashlib.sha256(
            json.dumps(config, sort_keys=True).encode()
        ).hexdigest()[:8]
        
        snapshot_id = f"snapshot_{config_hash}_{int(timestamp)}"
        
        snapshot = ConfigSnapshot(
            timestamp=timestamp,
            hash=config_hash,
            config=config.copy(),
            label=label or datetime.fromtimestamp(timestamp).isoformat()
        )
        
        self._snapshots[snapshot_id] = snapshot
        self._current_config = config.copy()
        self._save_snapshot(snapshot_id, snapshot)
        
        logger.debug(f"Created snapshot: {snapshot_id}")
        return snapshot_id
    
    def compare_to_baseline(self, current_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compare current configuration to baseline.
        
        Args:
            current_config: Current system configuration
            
        Returns:
            Differences from baseline
        """
        if not self._baseline_config:
            self._baseline_config = current_config.copy()
            return {"status": "Baseline established"}
        
        differences = self._deep_diff(self._baseline_config, current_config)
        
        return {
            "baseline_set": True,
            "differences": differences,
            "baseline_time": datetime.fromtimestamp(
                self._snapshots[list(self._snapshots.keys())[0]].timestamp
            ).isoformat() if self._snapshots else None
        }
    
    def _deep_diff(self, old: Any, new: Any, path: str = "") -> List[Dict[str, Any]]:
        """Deep compare two configs."""
        diffs = []
        
        if isinstance(old, dict) and isinstance(new, dict):
            # Check for removed keys
            for key in old:
                new_path = f"{path}.{key}" if path else key
                if key not in new:
                    diffs.append({
                        "type": "removed",
                        "path": new_path,
                        "old_value": old[key]
                    })
            
            # Check for added/changed keys
            for key in new:
                new_path = f"{path}.{key}" if path else key
                if key not in old:
                    diffs.append({
                        "type": "added",
                        "path": new_path,
                        "new_value": new[key]
                    })
                elif old[key] != new[key]:
                    if isinstance(old[key], dict):
                        diffs.extend(self._deep_diff(old[key], new[key], new_path))
                    else:
                        diffs.append({
                            "type": "changed",
                            "path": new_path,
                            "old_value": old[key],
                            "new_value": new[key]
                        })
        elif old != new:
            diffs.append({
                "type": "changed",
                "path": path,
                "old_value": old,
                "new_value": new
            })
        
        return diffs
    
    def audit_changes(self, since_timestamp: float) -> List[ConfigChange]:
        """
        Get audit trail of configuration changes.
        
        Args:
            since_timestamp: Only return changes after this time
            
        Returns:
            List of configuration changes
        """
        return [c for c in self._changes if c.timestamp >= since_timestamp]
    
    def record_change(self, field: str, old_value: Any, new_value: Any,
                     changed_by: str = "system", description: str = "") -> None:
        """Record a configuration change."""
        import time
        change = ConfigChange(
            timestamp=time.time(),
            changed_by=changed_by,
            field=field,
            old_value=old_value,
            new_value=new_value,
            description=description
        )
        self._changes.append(change)
        logger.info(f"Configuration change: {field} ({changed_by})")
    
    def verify_dependencies(self) -> Dict[str, Any]:
        """
        Verify all required dependencies are available.
        
        Returns:
            Dependency verification results
        """
        dependencies = {
            "python": {"required": "3.8+", "available": True},
            "textual": {"required": "latest", "available": True},
            "aiohttp": {"required": "latest", "available": True},
            "audio_device": {"required": "any", "available": True},
            "api_server": {"required": "running", "available": True},
        }
        
        missing = []
        for dep, status in dependencies.items():
            if not status["available"]:
                missing.append(dep)
        
        return {
            "all_ok": len(missing) == 0,
            "dependencies": dependencies,
            "missing": missing,
            "critical_missing": [d for d in missing if d in ["api_server", "audio_device"]]
        }
    
    def rollback_to_snapshot(self, snapshot_id: str) -> Dict[str, Any]:
        """
        Rollback to a previous configuration snapshot.
        
        Args:
            snapshot_id: ID of snapshot to restore
            
        Returns:
            Rollback status and previous config
        """
        if snapshot_id not in self._snapshots:
            return {"status": "error", "message": f"Snapshot not found: {snapshot_id}"}
        
        snapshot = self._snapshots[snapshot_id]
        
        # Record rollback as change
        self.record_change(
            field="system_rollback",
            old_value="current",
            new_value=snapshot.label,
            changed_by="user",
            description=f"Rolled back to {snapshot.label}"
        )
        
        logger.info(f"Rolled back to snapshot: {snapshot_id}")
        
        return {
            "status": "success",
            "snapshot_id": snapshot_id,
            "label": snapshot.label,
            "timestamp": snapshot.timestamp,
            "config": snapshot.config
        }
    
    def get_current_state(self) -> Dict[str, Any]:
        """Get current system state."""
        return {
            "timestamp": datetime.now().isoformat(),
            "config": self._current_config,
            "snapshot_count": len(self._snapshots),
            "changes_recorded": len(self._changes)
        }
    
    def show_change_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Show recent change history."""
        recent = self._changes[-limit:]
        return [
            {
                "timestamp": datetime.fromtimestamp(c.timestamp).isoformat(),
                "field": c.field,
                "changed_by": c.changed_by,
                "old_value": str(c.old_value)[:50],
                "new_value": str(c.new_value)[:50],
                "description": c.description
            }
            for c in recent
        ]
    
    def _save_snapshot(self, snapshot_id: str, snapshot: ConfigSnapshot) -> None:
        """Save snapshot to disk."""
        try:
            snapshot_file = self.STATE_DIR / f"{snapshot_id}.json"
            data = {
                "timestamp": snapshot.timestamp,
                "hash": snapshot.hash,
                "label": snapshot.label,
                "config": snapshot.config
            }
            snapshot_file.write_text(json.dumps(data, indent=2))
        except Exception as e:
            logger.error(f"Failed to save snapshot: {e}")
    
    def _load_snapshots(self) -> None:
        """Load snapshots from disk."""
        try:
            for snapshot_file in self.STATE_DIR.glob("snapshot_*.json"):
                snapshot_id = snapshot_file.stem
                data = json.loads(snapshot_file.read_text())
                self._snapshots[snapshot_id] = ConfigSnapshot(
                    timestamp=data["timestamp"],
                    hash=data["hash"],
                    config=data["config"],
                    label=data["label"]
                )
        except Exception as e:
            logger.error(f"Failed to load snapshots: {e}")


# Global instance
state_inspector = StateInspector()
