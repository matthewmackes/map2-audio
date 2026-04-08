"""
JACK Audio Server Integration
Provides connection to JACK audio server for professional audio routing.
"""

import logging
import asyncio
import threading
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


class JACKAudioClient:
    """JACK audio server client."""

    def __init__(self, client_name: str = "MAP2-Audio"):
        """Initialize JACK audio client.
        
        Args:
            client_name: JACK client name
        """
        self.client_name = client_name
        self.is_connected = False
        self.sample_rate = 48000
        self.buffer_size = 256
        self.ports_in = []
        self.ports_out = []
        self.connected_ports = {}

    async def connect(self) -> bool:
        """Connect to JACK audio server.
        
        Returns:
            True if connected, False otherwise
        """
        try:
            # Try to import jack module
            try:
                import jack
            except ImportError:
                logger.warning("python-jack not installed, JACK integration disabled")
                return False
            
            # Create JACK client
            self.jack_client = jack.Client(self.client_name)
            
            # Get server info
            self.sample_rate = self.jack_client.samplerate
            self.buffer_size = self.jack_client.blocksize
            
            # Register ports
            self.ports_in = [
                self.jack_client.inports.register("audio_in_l"),
                self.jack_client.inports.register("audio_in_r")
            ]
            self.ports_out = [
                self.jack_client.outports.register("audio_out_l"),
                self.jack_client.outports.register("audio_out_r")
            ]
            
            # Activate client
            self.jack_client.activate()
            self.is_connected = True
            
            logger.info(f"Connected to JACK: {self.sample_rate}Hz, {self.buffer_size} samples/block")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to JACK: {e}")
            return False

    async def disconnect(self) -> bool:
        """Disconnect from JACK server.
        
        Returns:
            True if disconnected, False otherwise
        """
        try:
            if hasattr(self, 'jack_client') and self.is_connected:
                self.jack_client.deactivate()
                self.jack_client.close()
                self.is_connected = False
                logger.info("Disconnected from JACK")
            return True
        except Exception as e:
            logger.error(f"Error disconnecting from JACK: {e}")
            return False

    async def get_server_info(self) -> Dict[str, Any]:
        """Get JACK server information.
        
        Returns:
            Server info dict
        """
        if not self.is_connected:
            return {
                "connected": False,
                "message": "Not connected to JACK"
            }
        
        try:
            return {
                "connected": True,
                "sample_rate": self.sample_rate,
                "buffer_size": self.buffer_size,
                "latency": round((self.buffer_size / self.sample_rate) * 1000, 2),
                "input_ports": len(self.ports_in),
                "output_ports": len(self.ports_out),
                "connected_inputs": len([p for p in self.ports_in if p.connections]),
                "connected_outputs": len([p for p in self.ports_out if p.connections])
            }
        except Exception as e:
            logger.error(f"Error getting JACK server info: {e}")
            return {"error": str(e)}

    async def list_ports(self, port_type: str = "audio") -> Dict[str, List[str]]:
        """List available JACK ports.
        
        Args:
            port_type: "audio" or "midi"
            
        Returns:
            Dict with inputs and outputs
        """
        if not self.is_connected:
            return {"inputs": [], "outputs": [], "message": "Not connected to JACK"}
        
        try:
            import jack
            
            jack_ports = self.jack_client.get_ports(is_audio=(port_type == "audio"), is_midi=(port_type == "midi"))
            
            inputs = [str(p) for p in jack_ports if "in" in str(p).lower() or p.flags & jack.IsInput]
            outputs = [str(p) for p in jack_ports if "out" in str(p).lower() or p.flags & jack.IsOutput]
            
            return {
                "inputs": inputs,
                "outputs": outputs,
                "type": port_type
            }
        except Exception as e:
            logger.error(f"Error listing JACK ports: {e}")
            return {"error": str(e), "inputs": [], "outputs": []}

    async def connect_ports(self, source: str, destination: str) -> bool:
        """Connect two JACK ports.
        
        Args:
            source: Source port name
            destination: Destination port name
            
        Returns:
            True if connected, False otherwise
        """
        if not self.is_connected:
            return False
        
        try:
            self.jack_client.connect(source, destination)
            self.connected_ports[source] = destination
            logger.info(f"Connected {source} -> {destination}")
            return True
        except Exception as e:
            logger.error(f"Error connecting ports {source} -> {destination}: {e}")
            return False

    async def disconnect_ports(self, source: str, destination: str) -> bool:
        """Disconnect two JACK ports.
        
        Args:
            source: Source port name
            destination: Destination port name
            
        Returns:
            True if disconnected, False otherwise
        """
        if not self.is_connected:
            return False
        
        try:
            self.jack_client.disconnect(source, destination)
            if source in self.connected_ports:
                del self.connected_ports[source]
            logger.info(f"Disconnected {source} -> {destination}")
            return True
        except Exception as e:
            logger.error(f"Error disconnecting ports: {e}")
            return False

    async def get_latency_frames(self) -> int:
        """Get current latency in samples.
        
        Returns:
            Latency in frames
        """
        if not self.is_connected:
            return 0
        
        try:
            return self.jack_client.get_latency(self.jack_client.outports[0])
        except Exception as e:
            logger.error(f"Error getting JACK latency: {e}")
            return self.buffer_size  # Default estimate

    async def get_latency_ms(self) -> float:
        """Get current latency in milliseconds.
        
        Returns:
            Latency in ms
        """
        frames = await self.get_latency_frames()
        if self.sample_rate == 0:
            return 0.0
        return (frames / self.sample_rate) * 1000


# Global JACK client instance
_jack_client: Optional[JACKAudioClient] = None
_jack_client_lock = threading.Lock()


async def get_jack_client() -> JACKAudioClient:
    """Get or create global JACK client instance.
    
    Returns:
        JACKAudioClient instance
    """
    global _jack_client
    if _jack_client is None:
        with _jack_client_lock:
            if _jack_client is None:
                _jack_client = JACKAudioClient()
    return _jack_client
