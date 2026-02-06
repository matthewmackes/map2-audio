"""
MAP2 Audio Cluster - Node Onboarding Portal

Interactive web-based wizard for onboarding new nodes to the cluster.
Guides users through discovery, configuration, and integration.
"""

from typing import Dict, List, Optional
from dataclasses import dataclass
from enum import Enum
from datetime import datetime
from fastapi import APIRouter, HTTPException, WebSocket
from pydantic import BaseModel
import asyncio
import logging

logger = logging.getLogger(__name__)


class OnboardingStep(Enum):
    """Onboarding wizard steps."""
    WELCOME = "welcome"
    DISCOVERY = "discovery"
    NETWORK_CONFIG = "network_config"
    AUDIO_CONFIG = "audio_config"
    SECURITY = "security"
    VERIFICATION = "verification"
    COMPLETE = "complete"


class OnboardingStatus(Enum):
    """Status of onboarding process."""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    FAILED = "failed"
    COMPLETED = "completed"


# =========================================================================
# Pydantic Models for API
# =========================================================================

class OnboardingSessionCreate(BaseModel):
    """Create new onboarding session."""
    node_name: str
    node_type: str = "audio"  # audio, management, hybrid


class NetworkConfig(BaseModel):
    """Network configuration."""
    hostname: str
    ip_address: Optional[str] = None
    subnet_mask: Optional[str] = None
    gateway: Optional[str] = None
    dns_servers: List[str] = []
    use_dhcp: bool = True


class AudioDeviceConfig(BaseModel):
    """Audio device configuration."""
    device_id: str
    device_name: str
    sample_rate: int = 48000
    buffer_size: int = 256
    channels_in: int = 2
    channels_out: int = 2


class SecurityConfig(BaseModel):
    """Security configuration."""
    enable_tls: bool = True
    auto_generate_certs: bool = True
    firewall_enabled: bool = True
    ssh_keys: List[str] = []


class StepData(BaseModel):
    """Data for a specific step."""
    step: str
    data: Dict


@dataclass
class OnboardingSession:
    """Onboarding session state."""
    session_id: str
    node_name: str
    node_type: str
    current_step: OnboardingStep
    status: OnboardingStatus
    created_at: str
    updated_at: str
    completed_steps: List[OnboardingStep]
    config_data: Dict
    errors: List[str]
    
    def to_dict(self) -> Dict:
        return {
            "session_id": self.session_id,
            "node_name": self.node_name,
            "node_type": self.node_type,
            "current_step": self.current_step.value,
            "status": self.status.value,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "completed_steps": [step.value for step in self.completed_steps],
            "config_data": self.config_data,
            "errors": self.errors,
            "progress_percent": self.get_progress_percent()
        }
    
    def get_progress_percent(self) -> int:
        """Calculate progress percentage."""
        total_steps = len(OnboardingStep) - 1  # Exclude COMPLETE
        completed = len(self.completed_steps)
        return int((completed / total_steps) * 100)


class NodeOnboardingPortal:
    """
    Interactive node onboarding portal.
    
    Provides step-by-step wizard for adding new nodes to cluster.
    """
    
    def __init__(self):
        """Initialize onboarding portal."""
        self.sessions: Dict[str, OnboardingSession] = {}
        self.router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])
        
        # Register routes
        self._register_routes()
    
    def _register_routes(self):
        """Register FastAPI routes."""
        
        @self.router.post("/sessions")
        async def create_session(session_data: OnboardingSessionCreate):
            """Create new onboarding session."""
            return self.create_session(session_data.node_name, session_data.node_type)
        
        @self.router.get("/sessions/{session_id}")
        async def get_session(session_id: str):
            """Get onboarding session."""
            session = self.get_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            return session.to_dict()
        
        @self.router.post("/sessions/{session_id}/step")
        async def submit_step(session_id: str, step_data: StepData):
            """Submit data for current step."""
            success, message = await self.submit_step_data(
                session_id,
                OnboardingStep(step_data.step),
                step_data.data
            )
            if not success:
                raise HTTPException(status_code=400, detail=message)
            return {"status": "success", "message": message}
        
        @self.router.post("/sessions/{session_id}/cancel")
        async def cancel_session(session_id: str):
            """Cancel onboarding session."""
            if self.cancel_session(session_id):
                return {"status": "cancelled"}
            raise HTTPException(status_code=404, detail="Session not found")
        
        @self.router.get("/sessions/{session_id}/next-step")
        async def get_next_step(session_id: str):
            """Get next step in onboarding."""
            next_step = self.get_next_step(session_id)
            if not next_step:
                raise HTTPException(status_code=404, detail="Session not found")
            return self._get_step_info(next_step)
    
    def create_session(self, node_name: str, node_type: str) -> Dict:
        """
        Create new onboarding session.
        
        Args:
            node_name: Name for new node
            node_type: Type of node (audio, management, hybrid)
        
        Returns:
            Session data
        """
        import uuid
        
        session_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        session = OnboardingSession(
            session_id=session_id,
            node_name=node_name,
            node_type=node_type,
            current_step=OnboardingStep.WELCOME,
            status=OnboardingStatus.NOT_STARTED,
            created_at=now,
            updated_at=now,
            completed_steps=[],
            config_data={},
            errors=[]
        )
        
        self.sessions[session_id] = session
        
        logger.info(f"Created onboarding session {session_id} for node {node_name}")
        
        return session.to_dict()
    
    def get_session(self, session_id: str) -> Optional[OnboardingSession]:
        """Get onboarding session."""
        return self.sessions.get(session_id)
    
    async def submit_step_data(
        self, 
        session_id: str,
        step: OnboardingStep,
        data: Dict
    ) -> tuple[bool, str]:
        """
        Submit data for a step and advance to next.
        
        Args:
            session_id: Session identifier
            step: Current step
            data: Step data
        
        Returns:
            (success, message)
        """
        session = self.get_session(session_id)
        if not session:
            return False, "Session not found"
        
        # Validate step is current step
        if session.current_step != step:
            return False, f"Expected step {session.current_step.value}, got {step.value}"
        
        # Process step data
        try:
            if step == OnboardingStep.WELCOME:
                await self._process_welcome(session, data)
            elif step == OnboardingStep.DISCOVERY:
                await self._process_discovery(session, data)
            elif step == OnboardingStep.NETWORK_CONFIG:
                await self._process_network_config(session, data)
            elif step == OnboardingStep.AUDIO_CONFIG:
                await self._process_audio_config(session, data)
            elif step == OnboardingStep.SECURITY:
                await self._process_security(session, data)
            elif step == OnboardingStep.VERIFICATION:
                await self._process_verification(session, data)
            
            # Mark step as completed
            if step not in session.completed_steps:
                session.completed_steps.append(step)
            
            # Advance to next step
            next_step = self.get_next_step(session_id)
            if next_step:
                session.current_step = next_step
                session.status = OnboardingStatus.IN_PROGRESS
            else:
                session.status = OnboardingStatus.COMPLETED
            
            session.updated_at = datetime.now().isoformat()
            
            logger.info(f"Session {session_id} completed step {step.value}")
            
            return True, f"Step {step.value} completed successfully"
            
        except Exception as e:
            error_msg = f"Failed to process step {step.value}: {str(e)}"
            session.errors.append(error_msg)
            session.status = OnboardingStatus.FAILED
            logger.error(error_msg)
            return False, error_msg
    
    async def _process_welcome(self, session: OnboardingSession, data: Dict):
        """Process welcome step."""
        # Just acknowledge
        session.config_data["acknowledged"] = True
    
    async def _process_discovery(self, session: OnboardingSession, data: Dict):
        """Process discovery step - scan for existing cluster."""
        # Simulate cluster discovery
        discovered_nodes = data.get("discovered_nodes", [])
        cluster_found = len(discovered_nodes) > 0
        
        session.config_data["cluster_discovered"] = cluster_found
        session.config_data["discovered_nodes"] = discovered_nodes
        
        if cluster_found:
            logger.info(f"Discovered {len(discovered_nodes)} cluster nodes")
    
    async def _process_network_config(self, session: OnboardingSession, data: Dict):
        """Process network configuration."""
        network_config = NetworkConfig(**data)
        session.config_data["network"] = network_config.dict()
        logger.info(f"Network configured: {network_config.hostname}")
    
    async def _process_audio_config(self, session: OnboardingSession, data: Dict):
        """Process audio device configuration."""
        audio_devices = [AudioDeviceConfig(**device) for device in data.get("devices", [])]
        session.config_data["audio_devices"] = [d.dict() for d in audio_devices]
        logger.info(f"Configured {len(audio_devices)} audio devices")
    
    async def _process_security(self, session: OnboardingSession, data: Dict):
        """Process security configuration."""
        security_config = SecurityConfig(**data)
        session.config_data["security"] = security_config.dict()
        logger.info("Security configuration applied")
    
    async def _process_verification(self, session: OnboardingSession, data: Dict):
        """Process verification step - final checks."""
        # Simulate verification
        await asyncio.sleep(1)  # Simulate verification time
        
        all_checks_passed = all([
            "network" in session.config_data,
            "audio_devices" in session.config_data,
            "security" in session.config_data
        ])
        
        session.config_data["verification_passed"] = all_checks_passed
        
        if not all_checks_passed:
            raise ValueError("Verification failed - missing required configuration")
        
        logger.info(f"Verification passed for node {session.node_name}")
    
    def get_next_step(self, session_id: str) -> Optional[OnboardingStep]:
        """Get next step for session."""
        session = self.get_session(session_id)
        if not session:
            return None
        
        # Define step order
        step_order = [
            OnboardingStep.WELCOME,
            OnboardingStep.DISCOVERY,
            OnboardingStep.NETWORK_CONFIG,
            OnboardingStep.AUDIO_CONFIG,
            OnboardingStep.SECURITY,
            OnboardingStep.VERIFICATION,
            OnboardingStep.COMPLETE
        ]
        
        try:
            current_index = step_order.index(session.current_step)
            if current_index < len(step_order) - 1:
                return step_order[current_index + 1]
            return None
        except ValueError:
            return None
    
    def _get_step_info(self, step: OnboardingStep) -> Dict:
        """Get information about a step."""
        step_info = {
            OnboardingStep.WELCOME: {
                "title": "Welcome to MAP2 Cluster",
                "description": "Begin setting up your new audio node",
                "fields": []
            },
            OnboardingStep.DISCOVERY: {
                "title": "Cluster Discovery",
                "description": "Scanning for existing cluster nodes...",
                "fields": [
                    {"name": "auto_discover", "type": "boolean", "label": "Auto-discover cluster"}
                ]
            },
            OnboardingStep.NETWORK_CONFIG: {
                "title": "Network Configuration",
                "description": "Configure network settings for this node",
                "fields": [
                    {"name": "hostname", "type": "text", "label": "Hostname", "required": True},
                    {"name": "use_dhcp", "type": "boolean", "label": "Use DHCP"},
                    {"name": "ip_address", "type": "text", "label": "IP Address"},
                    {"name": "subnet_mask", "type": "text", "label": "Subnet Mask"},
                    {"name": "gateway", "type": "text", "label": "Gateway"}
                ]
            },
            OnboardingStep.AUDIO_CONFIG: {
                "title": "Audio Device Configuration",
                "description": "Select and configure audio devices",
                "fields": [
                    {"name": "devices", "type": "array", "label": "Audio Devices"}
                ]
            },
            OnboardingStep.SECURITY: {
                "title": "Security Configuration",
                "description": "Configure security settings",
                "fields": [
                    {"name": "enable_tls", "type": "boolean", "label": "Enable TLS"},
                    {"name": "auto_generate_certs", "type": "boolean", "label": "Auto-generate certificates"},
                    {"name": "firewall_enabled", "type": "boolean", "label": "Enable firewall"}
                ]
            },
            OnboardingStep.VERIFICATION: {
                "title": "Verification",
                "description": "Verifying configuration...",
                "fields": []
            },
            OnboardingStep.COMPLETE: {
                "title": "Complete!",
                "description": "Your node is ready to join the cluster",
                "fields": []
            }
        }
        
        return {
            "step": step.value,
            **step_info.get(step, {})
        }
    
    def cancel_session(self, session_id: str) -> bool:
        """Cancel onboarding session."""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Cancelled onboarding session {session_id}")
            return True
        return False
    
    def get_all_sessions(self, status: Optional[OnboardingStatus] = None) -> List[Dict]:
        """Get all sessions, optionally filtered by status."""
        sessions = self.sessions.values()
        
        if status:
            sessions = [s for s in sessions if s.status == status]
        
        return [s.to_dict() for s in sessions]


# =========================================================================
# WebSocket Support for Real-time Progress
# =========================================================================

class OnboardingWebSocket:
    """WebSocket handler for real-time onboarding updates."""
    
    def __init__(self, portal: NodeOnboardingPortal):
        """Initialize WebSocket handler."""
        self.portal = portal
        self.connections: Dict[str, WebSocket] = {}
    
    async def connect(self, session_id: str, websocket: WebSocket):
        """Connect WebSocket for session."""
        await websocket.accept()
        self.connections[session_id] = websocket
        logger.info(f"WebSocket connected for session {session_id}")
    
    async def disconnect(self, session_id: str):
        """Disconnect WebSocket."""
        if session_id in self.connections:
            del self.connections[session_id]
            logger.info(f"WebSocket disconnected for session {session_id}")
    
    async def send_update(self, session_id: str, data: Dict):
        """Send update to WebSocket client."""
        if session_id in self.connections:
            try:
                await self.connections[session_id].send_json(data)
            except Exception as e:
                logger.error(f"Failed to send WebSocket update: {e}")
                await self.disconnect(session_id)


# =========================================================================
# Global Instance
# =========================================================================

# Global onboarding portal
onboarding_portal = NodeOnboardingPortal()


def get_onboarding_router() -> APIRouter:
    """Get FastAPI router for onboarding endpoints."""
    return onboarding_portal.router


# =========================================================================
# Example Usage
# =========================================================================

if __name__ == "__main__":
    import asyncio
    
    async def test_onboarding():
        """Test onboarding flow."""
        portal = NodeOnboardingPortal()
        
        # Create session
        session = portal.create_session("audio-node-01", "audio")
        session_id = session["session_id"]
        
        print(f"✓ Created session: {session_id}")
        print(f"  Progress: {session['progress_percent']}%")
        
        # Step 1: Welcome
        success, msg = await portal.submit_step_data(
            session_id,
            OnboardingStep.WELCOME,
            {"acknowledged": True}
        )
        print(f"✓ Welcome: {msg}")
        
        # Step 2: Discovery
        success, msg = await portal.submit_step_data(
            session_id,
            OnboardingStep.DISCOVERY,
            {"discovered_nodes": ["mgmt-01", "audio-02"]}
        )
        print(f"✓ Discovery: {msg}")
        
        # Step 3: Network
        success, msg = await portal.submit_step_data(
            session_id,
            OnboardingStep.NETWORK_CONFIG,
            {
                "hostname": "audio-node-01",
                "use_dhcp": True
            }
        )
        print(f"✓ Network: {msg}")
        
        # Step 4: Audio
        success, msg = await portal.submit_step_data(
            session_id,
            OnboardingStep.AUDIO_CONFIG,
            {
                "devices": [
                    {
                        "device_id": "hw:0",
                        "device_name": "USB Audio",
                        "sample_rate": 48000,
                        "buffer_size": 256,
                        "channels_in": 2,
                        "channels_out": 2
                    }
                ]
            }
        )
        print(f"✓ Audio: {msg}")
        
        # Step 5: Security
        success, msg = await portal.submit_step_data(
            session_id,
            OnboardingStep.SECURITY,
            {
                "enable_tls": True,
                "auto_generate_certs": True,
                "firewall_enabled": True
            }
        )
        print(f"✓ Security: {msg}")
        
        # Step 6: Verification
        success, msg = await portal.submit_step_data(
            session_id,
            OnboardingStep.VERIFICATION,
            {}
        )
        print(f"✓ Verification: {msg}")
        
        # Check final status
        final_session = portal.get_session(session_id)
        print(f"\n✅ Onboarding complete!")
        print(f"  Status: {final_session.status.value}")
        print(f"  Progress: {final_session.get_progress_percent()}%")
    
    asyncio.run(test_onboarding())
