"""
Event Replay and Debugging

Replay recorded events for debugging and testing.
Includes event recording, filtering, and replay capabilities.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Callable
import asyncio

from app.lcd_models.lcd_event import LCDEvent

logger = logging.getLogger(__name__)


class EventRecorder:
    """
    Records events to file for debugging and replay.
    """
    
    def __init__(self, record_dir: str = "/var/log/map2/events"):
        self.record_dir = Path(record_dir)
        self.record_dir.mkdir(parents=True, exist_ok=True)
        
        # Current session file
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        self.session_file = self.record_dir / f"session_{timestamp}.jsonl"
        
        self.recording = False
        
    def start(self):
        """Start recording events"""
        self.recording = True
        logger.info(f"Started event recording to {self.session_file}")
    
    def stop(self):
        """Stop recording events"""
        self.recording = False
        logger.info(f"Stopped event recording")
    
    def record(self, event: LCDEvent):
        """Record an event to file"""
        if not self.recording:
            return
        
        try:
            # Append to JSONL file
            with open(self.session_file, 'a') as f:
                f.write(json.dumps(event.to_dict()) + '\n')
        except Exception as e:
            logger.error(f"Error recording event: {e}")
    
    def get_session_file(self) -> Path:
        """Get current session file path"""
        return self.session_file
    
    def list_sessions(self) -> List[Path]:
        """List all recorded sessions"""
        return sorted(self.record_dir.glob("session_*.jsonl"), reverse=True)


class EventReplayer:
    """
    Replays recorded events for debugging and testing.
    """
    
    def __init__(self):
        self.replaying = False
        self._replay_task = None
    
    async def replay_file(
        self,
        file_path: Path,
        event_handler: Callable,
        speed: float = 1.0,
        start_index: int = 0,
        limit: Optional[int] = None
    ):
        """
        Replay events from a file.
        
        Args:
            file_path: Path to JSONL event file
            event_handler: Async function to call with each event
            speed: Playback speed (1.0 = real-time, 2.0 = 2x faster)
            start_index: Start from event number
            limit: Max events to replay
        """
        if not file_path.exists():
            logger.error(f"File not found: {file_path}")
            return
        
        try:
            self.replaying = True
            logger.info(f"Starting replay of {file_path} at {speed}x speed")
            
            with open(file_path, 'r') as f:
                events = [json.loads(line) for line in f]
            
            # Apply filtering
            events = events[start_index:]
            if limit:
                events = events[:limit]
            
            # Replay events
            for i, event_dict in enumerate(events):
                if not self.replaying:
                    break
                
                # Convert to LCDEvent
                event_dict['timestamp'] = datetime.fromisoformat(event_dict['timestamp'])
                event = LCDEvent.from_dict(event_dict)
                
                # Call handler
                await event_handler(event)
                
                # Calculate delay
                if i < len(events) - 1:
                    next_event_dict = events[i + 1]
                    next_time = datetime.fromisoformat(next_event_dict['timestamp'])
                    current_time = event.timestamp
                    
                    delay = (next_time - current_time).total_seconds() / speed
                    if delay > 0:
                        await asyncio.sleep(min(delay, 1.0))  # Cap at 1s
                
                logger.debug(f"Replayed event {i+1}/{len(events)}: {event.title}")
            
            logger.info(f"Replay completed: {len(events)} events")
            
        except Exception as e:
            logger.error(f"Error replaying events: {e}")
        
        finally:
            self.replaying = False
    
    def stop(self):
        """Stop current replay"""
        self.replaying = False


class EventDebugger:
    """
    Provides debugging tools for event analysis.
    """
    
    @staticmethod
    def analyze_file(file_path: Path) -> Dict:
        """Analyze an event recording file"""
        if not file_path.exists():
            return {}
        
        try:
            events = []
            with open(file_path, 'r') as f:
                for line in f:
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
            
            # Analyze
            analysis = {
                'total_events': len(events),
                'by_type': {},
                'by_severity': {},
                'by_node': {},
                'time_span': None,
                'event_rate': 0.0
            }
            
            if events:
                for event in events:
                    # Count by type
                    etype = event.get('event_type', 'unknown')
                    analysis['by_type'][etype] = analysis['by_type'].get(etype, 0) + 1
                    
                    # Count by severity
                    severity = event.get('severity', 'unknown')
                    analysis['by_severity'][severity] = analysis['by_severity'].get(severity, 0) + 1
                    
                    # Count by node
                    node = event.get('source_node', 'unknown')
                    analysis['by_node'][node] = analysis['by_node'].get(node, 0) + 1
                
                # Time span
                first_time = datetime.fromisoformat(events[0]['timestamp'])
                last_time = datetime.fromisoformat(events[-1]['timestamp'])
                span = (last_time - first_time).total_seconds()
                analysis['time_span'] = span
                
                if span > 0:
                    analysis['event_rate'] = len(events) / span
            
            return analysis
        
        except Exception as e:
            logger.error(f"Error analyzing file: {e}")
            return {}
    
    @staticmethod
    def filter_events(
        file_path: Path,
        event_type: Optional[str] = None,
        severity: Optional[str] = None,
        node: Optional[str] = None
    ) -> List[Dict]:
        """Filter events from a file"""
        if not file_path.exists():
            return []
        
        try:
            filtered = []
            with open(file_path, 'r') as f:
                for line in f:
                    try:
                        event = json.loads(line)
                        
                        if event_type and event.get('event_type') != event_type:
                            continue
                        if severity and event.get('severity') != severity:
                            continue
                        if node and event.get('source_node') != node:
                            continue
                        
                        filtered.append(event)
                    except json.JSONDecodeError:
                        continue
            
            return filtered
        
        except Exception as e:
            logger.error(f"Error filtering events: {e}")
            return []
    
    @staticmethod
    def export_csv(file_path: Path, output_path: Path):
        """Export events to CSV"""
        import csv
        
        try:
            events = []
            with open(file_path, 'r') as f:
                for line in f:
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
            
            if not events:
                logger.warning("No events to export")
                return
            
            # Determine headers
            headers = set()
            for event in events:
                headers.update(event.keys())
            headers = sorted(list(headers))
            
            # Write CSV
            with open(output_path, 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=headers)
                writer.writeheader()
                for event in events:
                    writer.writerow(event)
            
            logger.info(f"Exported {len(events)} events to {output_path}")
        
        except Exception as e:
            logger.error(f"Error exporting to CSV: {e}")
