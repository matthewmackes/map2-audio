"""
LCD System Service
Runs as systemd service, connects to MAP2 backend for real-time data

Run as: python3 -m lcd.service
"""

import os
import sys
import time
import signal
import logging
from typing import Dict, Optional

import requests

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import LCD components
from lcd.manager import create_lcd_system


class MAP2LCDService:
    """MAP2 LCD system service."""
    
    def __init__(self):
        """Initialize service."""
        self.running = False
        self.manager = None
        self.backend_url = os.getenv('MAP2_BACKEND_URL', 'http://localhost:8080')
        self.simulation = os.getenv('MAP2_LCD_SIMULATION', 'false').lower() == 'true'
        
        # Setup signal handlers
        signal.signal(signal.SIGTERM, self._handle_signal)
        signal.signal(signal.SIGINT, self._handle_signal)
    
    def _handle_signal(self, signum, frame):
        """Handle shutdown signals."""
        logger.info(f"Received signal {signum}, shutting down...")
        self.stop()
        sys.exit(0)
    
    def _get_backend_data(self) -> Dict:
        """Fetch data from MAP2 backend.
        
        Returns:
            Dictionary with current system state
        """
        try:
            # Get system status
            response = requests.get(
                f"{self.backend_url}/api/status",
                timeout=0.5
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Format for LCD display
                return {
                    'sample_rate': data.get('sample_rate', 48000),
                    'buffer_size': data.get('buffer_size', 256),
                    'cpu_load': data.get('cpu_load', 0.0),
                    'active_chain': data.get('active_chain', {}).get('name', 'None'),
                    'plugins': [p.get('name', '') for p in data.get('plugins', [])],
                    'input_level_l': data.get('levels', {}).get('input_l', 0.0),
                    'input_level_r': data.get('levels', {}).get('input_r', 0.0),
                    'output_level_l': data.get('levels', {}).get('output_l', 0.0),
                    'output_level_r': data.get('levels', {}).get('output_r', 0.0),
                    'midi_device_in': data.get('midi', {}).get('device_in', 'None'),
                    'midi_device_out': data.get('midi', {}).get('device_out', 'None'),
                    'midi_active': data.get('midi', {}).get('active', False),
                    'xruns': data.get('xruns', 0),
                    'callback_us': data.get('callback_us', 0),
                    'deadline_us': data.get('deadline_us', 5333),
                }
            else:
                logger.warning(f"Backend returned {response.status_code}")
                return self._get_fallback_data()
                
        except requests.exceptions.RequestException as e:
            logger.debug(f"Backend not available: {e}")
            return self._get_fallback_data()
        except Exception as e:
            logger.error(f"Error fetching backend data: {e}")
            return self._get_fallback_data()
    
    def _get_fallback_data(self) -> Dict:
        """Get fallback data when backend unavailable.
        
        Returns:
            Dictionary with default values
        """
        return {
            'sample_rate': 48000,
            'buffer_size': 256,
            'cpu_load': 0.0,
            'active_chain': 'Backend Offline',
            'plugins': [],
            'input_level_l': 0.0,
            'input_level_r': 0.0,
            'output_level_l': 0.0,
            'output_level_r': 0.0,
            'midi_device_in': 'N/A',
            'midi_device_out': 'N/A',
            'midi_active': False,
            'xruns': 0,
            'callback_us': 0,
            'deadline_us': 5333,
        }
    
    def start(self):
        """Start LCD service."""
        logger.info("Starting MAP2 LCD Service")
        logger.info(f"Backend URL: {self.backend_url}")
        logger.info(f"Simulation mode: {self.simulation}")
        
        try:
            # Create LCD system with backend data provider
            self.manager = create_lcd_system(
                data_provider=self._get_backend_data,
                simulation=self.simulation
            )
            
            self.running = True
            logger.info("LCD system started successfully")
            
            # Keep service running
            while self.running:
                time.sleep(1)
                
                # Log status periodically
                if int(time.time()) % 60 == 0:  # Every minute
                    status = self.manager.get_status()
                    logger.info(
                        f"Status: updates={status['statistics']['updates']}, "
                        f"page_changes={status['statistics']['page_changes']}, "
                        f"errors={status['statistics']['errors']}"
                    )
            
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        except Exception as e:
            logger.error(f"Service error: {e}", exc_info=True)
            raise
        finally:
            self.stop()
    
    def stop(self):
        """Stop LCD service."""
        if self.running:
            logger.info("Stopping LCD service...")
            self.running = False
            
            if self.manager:
                self.manager.stop()
            
            logger.info("LCD service stopped")


def main():
    """Main entry point."""
    service = MAP2LCDService()
    
    try:
        service.start()
    except Exception as e:
        logger.error(f"Service failed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
