"""
Web Services Configuration API Routes
Comprehensive web server and API management
"""

import asyncio
import logging
import subprocess
import os
import time
import secrets
import psutil
import json
import threading
from typing import List, Dict, Any, Optional
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.utils.time import utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/www", tags=["www"])

# Access logs are kept in memory and appended to disk for restart persistence.
_access_logs: List[Dict[str, Any]] = []
_max_logs = 1000
_startup_time = utc_now()
_request_count = 0
_api_key: Optional[str] = None
_access_log_lock = threading.RLock()
_state_dir = Path.home() / ".map2"
_access_log_path = _state_dir / "access_logs.jsonl"
_www_config_path = _state_dir / "www_config.json"
_api_key_path = _state_dir / "api_key"


# ==================== Models ====================

class BackendConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8080
    workers: int = 1
    debug: bool = False


class CORSConfig(BaseModel):
    enabled: bool = True
    origins: List[str] = ["*"]
    credentials: bool = False


class ConfigUpdate(BaseModel):
    type: str
    config: Dict[str, Any]


# ==================== Helper Functions ====================

def _persist_access_log(log_entry: Dict[str, Any]) -> None:
    """Append access log entry to disk (best-effort)."""
    try:
        _access_log_path.parent.mkdir(parents=True, exist_ok=True)
        with _access_log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(log_entry, separators=(",", ":")) + "\n")
    except Exception as e:
        logger.debug(f"Failed to persist access log: {e}")


def _load_access_logs() -> None:
    """Load recent access logs from disk on startup."""
    global _access_logs, _request_count

    if not _access_log_path.exists():
        return

    try:
        with _access_log_path.open("r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]

        parsed: List[Dict[str, Any]] = []
        for line in reversed(lines):
            try:
                obj = json.loads(line)
                if isinstance(obj, dict):
                    parsed.append(obj)
                    if len(parsed) >= _max_logs:
                        break
            except Exception:
                continue
        parsed.reverse()

        with _access_log_lock:
            _access_logs = parsed
            _request_count = len(parsed)
    except Exception as e:
        logger.debug(f"Failed to load access logs: {e}")

async def run_command(cmd: List[str], check: bool = True) -> subprocess.CompletedProcess:
    """Run a shell command safely."""
    try:
        result = await asyncio.to_thread(subprocess.run,
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            check=check
        )
        return result
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail=f"Command timed out")
    except subprocess.CalledProcessError as e:
        logger.error(f"Command failed: {' '.join(cmd)}: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"Command failed: {e.stderr}")


async def check_service_running(service: str) -> bool:
    """Check if a systemd service is running."""
    try:
        result = await asyncio.to_thread(subprocess.run,
            ["systemctl", "is-active", service],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.stdout.strip() == "active"
    except Exception:
        return False


def check_port_listening(port: int) -> bool:
    """Check if a port is listening."""
    try:
        for conn in psutil.net_connections(kind='inet'):
            if conn.laddr.port == port and conn.status == 'LISTEN':
                return True
    except Exception as e:
        logger.debug(f"Failed to check port {port}: {e}")
    return False


def get_process_by_port(port: int) -> Optional[psutil.Process]:
    """Get the process listening on a port."""
    try:
        for conn in psutil.net_connections(kind='inet'):
            if conn.laddr.port == port and conn.status == 'LISTEN':
                return psutil.Process(conn.pid)
    except Exception as e:
        logger.debug(f"Failed to get process for port {port}: {e}")
    return None


# ==================== Routes ====================

@router.get("/status")
async def get_www_status() -> Dict[str, Any]:
    """Get comprehensive web services status."""
    global _request_count
    project_root = Path(__file__).resolve().parents[2]
    web_root = project_root / "web" / "dist"

    from app.main import _resolve_cors_settings

    cors_origins, cors_allow_credentials = _resolve_cors_settings()

    status = {
        "backend_running": False,
        "backend_host": "0.0.0.0",
        "backend_port": 8080,
        "workers": 1,
        "debug": os.environ.get("DEBUG", "false").lower() == "true",
        "uptime": None,
        "frontend_running": False,
        "frontend_port": 3000,
        "frontend_mode": "production",
        "cpu_percent": 0,
        "memory_percent": 0,
        "memory_mb": 0,
        "total_requests": _request_count,
        "requests_per_minute": 0,
        "cors_enabled": True,
        "cors_origins": cors_origins,
        "cors_credentials": cors_allow_credentials,
        "ssl_enabled": False,
        "ssl_cert": None,
        "ssl_expires": None,
        "api_key": _api_key,
        "api_key_required": False,
        "rate_limit_enabled": False,
        "rate_limit_rpm": None,
        "rate_limit_burst": None,
        "web_root": str(web_root),
        "upload_dir": "/tmp/map2-uploads",
        "max_upload_size": 512,
    }

    try:
        # Check backend
        status["backend_running"] = check_port_listening(8080)
        if status["backend_running"]:
            proc = get_process_by_port(8080)
            if proc:
                try:
                    status["cpu_percent"] = proc.cpu_percent(interval=0.1)
                    mem_info = proc.memory_info()
                    status["memory_mb"] = mem_info.rss / (1024 * 1024)
                    status["memory_percent"] = proc.memory_percent()
                except Exception as e:
                    logger.debug(f"Failed to get backend process stats: {e}")

        # Calculate uptime
        uptime_seconds = (utc_now() - _startup_time).total_seconds()
        hours = int(uptime_seconds // 3600)
        minutes = int((uptime_seconds % 3600) // 60)
        status["uptime"] = f"{hours}h {minutes}m"

        # Calculate requests per minute
        if uptime_seconds > 0:
            status["requests_per_minute"] = (_request_count / uptime_seconds) * 60

        # Check the production web UI listener on port 3000
        status["frontend_running"] = check_port_listening(3000)

        # Check for SSL certificate
        ssl_cert_path = Path("/etc/ssl/certs/map2.crt")
        if ssl_cert_path.exists():
            status["ssl_enabled"] = True
            status["ssl_cert"] = str(ssl_cert_path)
            # Get expiry date (would need openssl)
            try:
                result = await run_command([
                    "openssl", "x509", "-enddate", "-noout", "-in", str(ssl_cert_path)
                ], check=False)
                if result.returncode == 0:
                    status["ssl_expires"] = result.stdout.strip().split('=')[1]
            except Exception as e:
                logger.debug(f"Failed to get SSL expiry: {e}")

    except Exception as e:
        logger.error(f"Failed to get WWW status: {e}")

    return status


@router.get("/endpoints")
async def get_api_endpoints() -> Dict[str, List[Dict[str, Any]]]:
    """Get list of API endpoints with statistics."""
    from app.main import app

    endpoints = []

    for route in app.routes:
        if hasattr(route, 'methods') and hasattr(route, 'path'):
            for method in route.methods:
                if method in ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']:
                    endpoints.append({
                        "method": method,
                        "path": route.path,
                        "description": route.name or "",
                        "request_count": 0,
                        "avg_response_time": None
                    })

    return {"endpoints": endpoints}


@router.get("/logs")
async def get_access_logs(limit: int = 50) -> Dict[str, List[Dict[str, Any]]]:
    """Get recent access logs."""
    with _access_log_lock:
        return {"logs": _access_logs[-limit:]}


@router.delete("/logs")
async def clear_access_logs() -> Dict[str, str]:
    """Clear access logs."""
    global _access_logs
    with _access_log_lock:
        _access_logs = []
    try:
        _access_log_path.parent.mkdir(parents=True, exist_ok=True)
        _access_log_path.write_text("", encoding="utf-8")
    except Exception as e:
        logger.debug(f"Failed to clear persisted access logs: {e}")
    return {"status": "cleared"}


@router.get("/websocket/stats")
async def get_websocket_stats() -> Dict[str, Any]:
    """Get WebSocket server statistics."""
    try:
        from app.services.websocket_manager import ws_manager
        return ws_manager.get_stats()
    except Exception as e:
        logger.error(f"Failed to get WebSocket stats: {e}")
        return {
            "active_connections": 0,
            "total_messages": 0,
            "messages_per_second": 0,
            "subscriptions": []
        }


@router.post("/restart/{service}")
async def restart_service(service: str) -> Dict[str, str]:
    """Restart a web service."""
    if service not in ["backend", "frontend"]:
        raise HTTPException(status_code=400, detail=f"Invalid service: {service}")

    try:
        if service == "backend":
            # Find and restart the uvicorn process
            # This is typically done by a process manager like systemd
            result = await run_command(["systemctl", "restart", "map2-backend"], check=False)
            if result.returncode != 0:
                # Try a graceful restart signal
                for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                    try:
                        cmdline = proc.info.get('cmdline', [])
                        if cmdline and 'uvicorn' in ' '.join(cmdline) and '8080' in ' '.join(cmdline):
                            # Send SIGHUP for graceful restart
                            os.kill(proc.info['pid'], 1)
                            return {"status": "restarting", "service": service}
                    except Exception:
                        continue
                return {"status": "not_managed", "service": service, "message": "Backend is not managed by systemd"}

        elif service == "frontend":
            result = await run_command(["systemctl", "restart", "map2-frontend"], check=False)
            if result.returncode != 0:
                return {"status": "not_managed", "service": service, "message": "Frontend is not managed by systemd"}

        return {"status": "restarted", "service": service}

    except Exception as e:
        logger.error(f"Failed to restart {service}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config")
async def update_config(update: ConfigUpdate) -> Dict[str, str]:
    """Update web server configuration."""
    config_path = _www_config_path

    try:
        import json

        # Load existing config
        existing_config = {}
        if config_path.exists():
            with open(config_path) as f:
                existing_config = json.load(f)

        # Update the specific section
        existing_config[update.type] = update.config

        # Save config
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, 'w') as f:
            json.dump(existing_config, f, indent=2)

        return {"status": "updated", "type": update.type}

    except Exception as e:
        logger.error(f"Failed to update config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api-key/generate")
async def generate_api_key() -> Dict[str, str]:
    """Generate a new API key."""
    global _api_key
    _api_key = secrets.token_urlsafe(32)

    # Save to config
    config_path = _api_key_path
    try:
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, 'w') as f:
            f.write(_api_key)
    except Exception as e:
        logger.warning(f"Failed to persist API key: {e}")

    return {"status": "generated", "api_key": _api_key}


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """Quick health check for web services."""
    return {
        "status": "healthy",
        "backend": check_port_listening(8080),
        "frontend": check_port_listening(3000),
        "timestamp": utc_now().isoformat()
    }


# ==================== Middleware Helper ====================

def log_request(method: str, path: str, status_code: int, response_time: float, client_ip: str):
    """Log an API request (called from middleware)."""
    global _access_logs, _request_count

    log_entry = {
        "timestamp": utc_now().isoformat(),
        "method": method,
        "path": path,
        "status_code": status_code,
        "response_time": response_time,
        "client_ip": client_ip
    }

    with _access_log_lock:
        _request_count += 1
        _access_logs.append(log_entry)

        # Keep only the last N logs
        if len(_access_logs) > _max_logs:
            _access_logs = _access_logs[-_max_logs:]

    _persist_access_log(log_entry)


# Load API key on startup
def _load_api_key():
    global _api_key
    config_path = _api_key_path
    if config_path.exists():
        try:
            with open(config_path) as f:
                _api_key = f.read().strip()
        except Exception:
            pass

_load_api_key()
_load_access_logs()
