"""
Important Disclaimer
This educational platform and its associated code, documentation, or examples
may reference trademarks, product names, brand names, manufacturers, or
commercial software/hardware.
Any such references are for identification, commentary, comparison, and
technical explanation only. This project has no affiliation with, endorsement
from, or official connection to those companies, products, or brands.
MAP2-owned code is licensed under AGPLv3 (`AGPL-3.0-only`). Educational intent
statements describe project goals and do not add restrictions beyond AGPLv3.
Third-party components remain under their original licenses.
"""

"""
FastAPI Application Factory
Main entry point with router registration and lifecycle management.
Utility functions for error handling and service startup/shutdown.
"""

def log_and_raise_critical(logger, message, exc: Exception = None):
    """Log a critical error and raise."""
    import traceback
    if exc:
        logger.critical(f"{message}: {exc}", exc_info=True)
        logger.critical(traceback.format_exc())
    else:
        logger.critical(message)
    raise RuntimeError(message)

async def safe_start_service(logger, name, start_coro):
    try:
        await start_coro()
        logger.info(f"{name} started successfully")
    except Exception as e:
        log_and_raise_critical(logger, f"Failed to start {name}", e)

async def safe_stop_service(logger, name, stop_coro):
    try:
        await stop_coro()
        logger.info(f"{name} stopped successfully")
    except Exception as e:
        logger.warning(f"Failed to stop {name}: {e}")

import logging
from contextlib import asynccontextmanager
from fastapi.responses import JSONResponse

from app.services.db_pool_manager import get_pool_manager, ConnectionPoolConfig
from app.utils.health_metrics import init_health_metrics

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app):
    """
    FastAPI application lifespan.
    Handles startup and shutdown of all services asynchronously.
    Prevents blocking the RT thread during initialization.
    """
    try:
        # ===== STARTUP =====
        logger.info("Starting MAP2 Audio Platform services...")
        
        # Initialize health metrics
        init_health_metrics()
        logger.info("Health metrics initialized")
        
        # Initialize database connection pool
        logger.info("Initializing database connection pool...")
        import os
        
        pool_manager = get_pool_manager()
        from app.database import get_default_database_url
        database_url = get_default_database_url(async_mode=True)
        pool_manager.initialize(
            database_url,
            ConnectionPoolConfig(pool_size=10, max_overflow=20)
        )
        logger.info(f"Database URL configured: {database_url}")
        await safe_start_service(logger, "Database tables", pool_manager.ensure_tables_created)
        
        # Validate audio engine configuration BEFORE starting services
        import os
        if os.getenv("MAP2_TEST_MODE", "false").lower() in ("1", "true", "yes"):
            logger.info("Skipping audio engine validation in test mode")
        else:
            logger.info("Validating audio engine configuration...")
            from app.services.audio_engine_validator import validate_audio_engine
            try:
                if not validate_audio_engine():
                    # Don't fail startup - log warnings but continue
                    logger.warning(
                        "Audio engine configuration has issues. "
                        "The system will continue but may have degraded audio functionality. "
                        "See logs above for details."
                    )
            except Exception as e:
                logger.error(f"Audio engine validation error: {e}. Continuing with degraded audio support.")
        
        from app.services.metrics_daemon import start_metrics_daemon, stop_metrics_daemon
        from app.services.service_orchestrator import get_orchestrator
        from app.services.websocket_manager import ws_manager
        from app.services.realtime_parameter_bridge import rt_parameter_bridge
        from app.services.parameter_routing import connect_parameter_routing, disconnect_parameter_routing
        from app.services.plugin_preset_lifecycle import get_preset_lifecycle
        from app.services.metering_broadcast import start_metering_broadcast, stop_metering_broadcast
        from app.services.midi_broadcast import start_midi_broadcast, stop_midi_broadcast
        from app.database import checkpoint_database
        from app.services.lcd_manager import LCDManager
        from app.services.event_producers import (
            AudioEventProducer,
            SystemHealthProducer,
            NetworkEventProducer,
            PluginEventProducer,
            DatabaseEventProducer,
        )
        from app.services.lcd_event_persistence import LCDEventPersistence, set_lcd_persistence
        from app.services.mdns_discovery import MDNSPeerDiscovery
        from app.services.node_identity import NodeIdentity
        from app.database_session import get_session
        from app.routes.lcd_events import init_lcd_routes
        avb_router = None

        # Initialize deployment configuration
        logger.info("Initializing deployment configuration...")
        from app.deployment.deployment import initialize_deployment_config, get_deployment_config
        import os
        
        # Set initial mode from environment
        deployment_mode = os.getenv("MAP2_DEPLOYMENT_MODE", "AUDIO-NODE").upper()
        
        # Initialize config (will create ~/.map2/deployment.json if not exists)
        initialize_deployment_config()
        deployment_config = get_deployment_config()
        logger.info(f"Deployment mode: {deployment_config.mode.value}")

        # Initialize frontend-only graceful degradation integration.
        try:
            from app.services.frontend_degradation import initialize_frontend_degradation
            initialize_frontend_degradation(os.getenv("MAP2_REMOTE_BACKEND_URL"))
        except Exception as e:
            logger.warning(f"Failed to initialize frontend degradation: {e}")
        
        # Initialize LCD Event System
        logger.info("Initializing LCD Event System...")
        use_mock_lcd = os.getenv("MAP2_USE_MOCK_LCD", "true").lower() in ("1", "true", "yes")
        api_port = int(os.getenv("MAP2_API_PORT", "8080"))

        identity = NodeIdentity(mode=deployment_mode)
        node_id = identity.node_id
        node_label = identity.node_id

        # Persistence layer
        lcd_persistence = LCDEventPersistence(get_session)
        set_lcd_persistence(lcd_persistence)
        await safe_start_service(logger, "LCD Event Persistence", lcd_persistence.start)

        # mDNS discovery
        mdns_discovery = MDNSPeerDiscovery(node_id, deployment_mode, port=api_port)

        # LCD manager
        lcd_manager = LCDManager(
            node_id,
            node_label,
            use_mock_lcd=use_mock_lcd,
            persistence=lcd_persistence,
            mdns_discovery=mdns_discovery,
        )
        await safe_start_service(logger, "LCD Manager", lcd_manager.start)
        
        # Initialize event producers
        audio_producer = AudioEventProducer(lcd_manager.event_bus)
        system_producer = SystemHealthProducer(lcd_manager.event_bus)
        network_producer = NetworkEventProducer(lcd_manager.event_bus)
        plugin_producer = PluginEventProducer(lcd_manager.event_bus)
        database_producer = DatabaseEventProducer(lcd_manager.event_bus)

        # Wire mDNS discoveries into network monitoring
        import asyncio

        def _mdns_peer_callback(action: str, peer_node_id: str, info: dict):
            if action == 'discovered':
                peer_http = f"http://{info.get('host')}:{info.get('port')}"
                asyncio.create_task(network_producer.register_peer(peer_node_id, peer_http))

        mdns_discovery.subscribe(_mdns_peer_callback)
        
        await safe_start_service(logger, "Audio Event Producer", audio_producer.start)
        await safe_start_service(logger, "System Health Producer", system_producer.start)
        await safe_start_service(logger, "Network Event Producer", network_producer.start)
        await safe_start_service(logger, "Plugin Event Producer", plugin_producer.start)
        await safe_start_service(logger, "Database Event Producer", database_producer.start)
        
        # System startup event
        import time
        boot_time = time.time() - __import__('psutil').boot_time()
        await system_producer.on_startup_complete(boot_time)

        # Start metrics daemon
        await safe_start_service(logger, "Metrics daemon", start_metrics_daemon)

        orchestrator = get_orchestrator()
        orchestrator.set_websocket_manager(ws_manager)
        # Start all services in dependency order
        results = await orchestrator.start_all()

        # Start real-time parameter bridge
        await safe_start_service(logger, "Real-time parameter bridge", rt_parameter_bridge.start)
        # Connect parameter routing
        await safe_start_service(logger, "Parameter routing", connect_parameter_routing)
        # Start plugin preset lifecycle manager
        preset_lifecycle = get_preset_lifecycle()
        await safe_start_service(logger, "Plugin preset lifecycle manager", preset_lifecycle.startup)
        # Start metering broadcast service (spectrum, LUFS, CPU via WebSocket)
        await safe_start_service(logger, "Metering broadcast service", start_metering_broadcast)
        # Start MIDI broadcast service (real-time MIDI events via WebSocket)
        await safe_start_service(logger, "MIDI broadcast service", start_midi_broadcast)
        # Attach MIDI v2 service to MidiHub consumer stream (program-change handling).
        try:
            from app.services.midi_service import midi_service

            midi_service.attach_midi_hub(asyncio.get_running_loop())
            logger.info("MIDI v2 service attached to MidiHub")
        except Exception as exc:
            logger.warning(f"Failed to attach MIDI v2 service to MidiHub: {exc}")

        # Start PipeWire crash recovery watchdog (opt-in only).
        # In current production builds this path can trigger unsafe low-level
        # engine restarts and destabilize the backend when JACK probes misfire.
        enable_pw_recovery = os.getenv("MAP2_ENABLE_PIPEWIRE_RECOVERY", "true").lower() in {
            "1", "true", "yes", "on"
        }
        if enable_pw_recovery:
            try:
                from app.services.pipewire_recovery import get_pipewire_recovery_service
                pw_recovery = get_pipewire_recovery_service()
                # Connect to JUCE engine if available
                try:
                    from app.services.juce_engine_service import get_audio_engine
                    from app.services.avb.avb_service import get_avb_service

                    engine_svc = get_audio_engine()
                    # PipeWire recovery expects service-level controls and can
                    # safely handle async/sync wrappers.
                    pw_recovery.set_engine(engine_svc)

                    engine = getattr(engine_svc, "_engine", None)
                    if engine is not None:
                        # AVB service still needs the low-level engine object.
                        get_avb_service().set_engine(engine)
                except Exception:
                    pass
                await safe_start_service(logger, "PipeWire recovery watchdog", pw_recovery.start)
            except Exception as e:
                logger.warning(f"PipeWire recovery watchdog not started: {e}")
        else:
            logger.info("PipeWire recovery watchdog disabled (MAP2_ENABLE_PIPEWIRE_RECOVERY not enabled)")

        # Start cluster monitoring services (only in multi-node modes)
        heartbeat = None
        failover = None
        cluster_enabled = os.getenv("MAP2_CLUSTER_ENABLED", "false").lower() == "true"
        
        if cluster_enabled:
            from app.services.cluster.heartbeat_monitor import get_heartbeat_monitor
            from app.services.cluster.failover_monitor import get_failover_monitor
            from app.services.cluster.raft_consensus import initialize_raft_consensus, get_raft_consensus
            from app.services.cluster.config_distributor import initialize_config_distributor, get_config_distributor
            from app.services.cluster.registry import get_cluster_registry
            
            heartbeat = get_heartbeat_monitor()
            failover = get_failover_monitor()
            registry = get_cluster_registry()
            
            # Initialize and start config distributor (if Git repo configured)
            git_config_repo = os.getenv("MAP2_CONFIG_GIT_REPO")
            if git_config_repo:
                logger.info("Initializing configuration distributor...")
                config_dist = initialize_config_distributor(git_config_repo)
                await safe_start_service(logger, "Configuration distributor", config_dist.start)
            else:
                logger.debug("Configuration distributor disabled (MAP2_CONFIG_GIT_REPO not set)")
            
            await safe_start_service(logger, "Heartbeat monitor", heartbeat.start)
            await safe_start_service(logger, "Failover monitor", failover.start)
        else:
            logger.info("Cluster services disabled (single-node ALL-IN-ONE mode)")

        # Bind AVB router discovery lifecycle to backend startup/shutdown.
        try:
            from app.services.avb.avb_router import get_avb_router

            avb_router = get_avb_router()
            await safe_start_service(logger, "AVB router discovery", avb_router.start)
        except Exception as e:
            logger.warning(f"AVB router discovery not started: {e}")

        # ── Biamp Tesira Forte AVB Fleet ─────────────────────────────────────
        tesira_fleet = None
        tesira_ptp = None
        try:
            from app.config import config_get as _cfg_get
            if _cfg_get("tesira.enabled", False):
                from app.services.tesira import get_tesira_fleet, get_tesira_discovery
                from app.services.tesira.ptp_coordinator import TesiraPTPCoordinator
                from app.services.tesira.preset_interlock import TesiraPresetInterlock
                tesira_fleet = get_tesira_fleet()
                await safe_start_service(logger, "Tesira Fleet", tesira_fleet.start)
                tesira_ptp = TesiraPTPCoordinator(tesira_fleet)
                await safe_start_service(logger, "Tesira PTP Coordinator", tesira_ptp.start)
                tesira_interlock = TesiraPresetInterlock(tesira_fleet)
                tesira_fleet.set_preset_interlock(tesira_interlock)
                preset_lifecycle.register_listener(
                    "preset_loaded", tesira_interlock.on_preset_loaded_event
                )
                # Discovery service is stateless — just instantiate the singleton
                get_tesira_discovery()
                logger.info("Tesira Forte AVB integration started")
            else:
                logger.debug("Tesira integration disabled (tesira.enabled=false)")
        except Exception as e:
            logger.warning(f"Tesira fleet not started: {e}")

        running = sum(1 for v in results.values() if v)
        total = len(results)
        logger.info(f"✅ Startup complete: {running}/{total} services running")

        yield  # Server runs here

        # ===== SHUTDOWN =====
        logger.info("Stopping MAP2 Audio Platform services...")

        if tesira_ptp is not None:
            await safe_stop_service(logger, "Tesira PTP Coordinator", tesira_ptp.stop)
        if tesira_fleet is not None:
            await safe_stop_service(logger, "Tesira Fleet", tesira_fleet.stop)

        if avb_router is not None:
            await safe_stop_service(logger, "AVB router discovery", avb_router.stop)
        
        # Stop configuration distributor
        if cluster_enabled:
            try:
                from app.services.cluster.config_distributor import get_config_distributor
                config_dist = get_config_distributor()
                await safe_stop_service(logger, "Configuration distributor", config_dist.stop)
            except (RuntimeError, ImportError):
                logger.debug("Config distributor not initialized")
            
            # Stop cluster consensus
            try:
                from app.services.cluster.raft_consensus import get_raft_consensus
                raft = get_raft_consensus()
                await safe_stop_service(logger, "Raft consensus", raft.stop)
            except (RuntimeError, ImportError):
                logger.debug("Raft consensus not initialized")
            
            # Stop cluster monitoring
            if failover:
                await safe_stop_service(logger, "Failover monitor", failover.stop)
            if heartbeat:
                await safe_stop_service(logger, "Heartbeat monitor", heartbeat.stop)
        
        await safe_stop_service(logger, "MIDI broadcast service", stop_midi_broadcast)
        await safe_stop_service(logger, "Metering broadcast service", stop_metering_broadcast)
        try:
            from app.services.midi_service import midi_service

            midi_service.detach_midi_hub()
        except Exception:
            pass
        
        # Stop LCD system
        await safe_stop_service(logger, "Database Event Producer", database_producer.stop)
        await safe_stop_service(logger, "Plugin Event Producer", plugin_producer.stop)
        await safe_stop_service(logger, "Network Event Producer", network_producer.stop)
        await safe_stop_service(logger, "System Health Producer", system_producer.stop)
        await safe_stop_service(logger, "Audio Event Producer", audio_producer.stop)
        await safe_stop_service(logger, "LCD Manager", lcd_manager.stop)
        await safe_stop_service(logger, "LCD Event Persistence", lcd_persistence.stop)
        
        # Close database pool
        pool_manager = get_pool_manager()
        await safe_stop_service(logger, "Database connection pool", pool_manager.close)
        await safe_stop_service(logger, "Plugin preset lifecycle manager", preset_lifecycle.shutdown)
        await safe_stop_service(logger, "Parameter routing", disconnect_parameter_routing)
        await safe_stop_service(logger, "Real-time parameter bridge", rt_parameter_bridge.stop)
        await safe_stop_service(logger, "Metrics daemon", stop_metrics_daemon)
        await safe_stop_service(logger, "Orchestrator services", orchestrator.stop_all)
        await safe_stop_service(logger, "Database checkpoint", checkpoint_database)
        logger.info("✅ Shutdown complete")
    except Exception as e:
        import traceback
        logger.critical(f"FATAL: Application lifespan error: {type(e).__name__}: {e}")
        logger.critical(f"Full traceback:\n{traceback.format_exc()}")
        raise


def create_app():
    """Create and configure FastAPI application."""
    try:
        from fastapi import FastAPI
        from fastapi.middleware.cors import CORSMiddleware
        import os

        app = FastAPI(
            title="MAP2 Audio Platform",
            description="Professional audio processing with LV2 plugins and MIDI routing",
            version="1.24.25.1",
            lifespan=lifespan  # Use async lifespan instead of startup/shutdown events
        )

        # Disable uvicorn access logs by default to avoid request-path logging
        # contention during high-rate WebSocket/HTTP soak tests.
        disable_access_log = os.getenv("MAP2_DISABLE_UVICORN_ACCESS_LOG", "true").lower() in {
            "1", "true", "yes", "on"
        }
        if disable_access_log:
            access_logger = logging.getLogger("uvicorn.access")
            access_logger.disabled = True
            access_logger.propagate = False

        # CORS middleware
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # Capture request durations for route-group percentile observability.
        from app.middleware.request_logging import RequestLoggingMiddleware
        app.add_middleware(RequestLoggingMiddleware, enabled=False)

        # Import and register routes individually to avoid cascade failures
        # Audio engine routes are provided via the 'engine' module (JUCE-based)
        route_modules = ['services', 'audio', 'plugins', 'midi', 'midi_v2', 'midi_hub', 'chains', 'effects_loops', 'health', 'metrics', 'nam', 'nam_models', 'ir', 'guitar', 'websocket', 'websocket_rt', 'automation', 'history', 'midi_learn', 'performance', 'runtime_profiles', 'plugin_scanner', 'sessions', 'presets', 'plugin_presets', 'preset_exchange', 'packages', 'profiling', 'reverb', 'impulse_response', 'folders', 'system', 'dsp', 'latency', 'usb_devices', 'system_tests', 'engine', 'network', 'www', 'backup', 'dashboard', 'preset_migration', 'plugin_packages', 'snapshots', 'spectrum', 'cpu_metrics', 'loudness', 'sidechain', 'upload', 'core_plugins', 'soundfonts', 'synthforge', 'mpx1', 'dynamics', 'filters', 'parallel', 'plugin_tags', 'delay', 'modulation', 'pitch', 'shoegaze', 'lexi_love', 'h3000', 'peavey5150', 'tweedbassman', 'passionfx', 'flow_snapshots', 'cluster_flows', 'cluster_health', 'cluster_admin', 'cluster_nodes', 'cluster_update', 'cluster_update_hybrid', 'raft_api', 'config_api', 'flow_failover', 'drums', 'pipewire', 'audio_path', 'auth', 'special_settings', 'audio_diagnostics', 'shopping', 'graceful_degradation']
        route_load_failures = []

        for route_name in route_modules:
            try:
                route_module = __import__(f'app.routes.{route_name}', fromlist=['router'])
                if hasattr(route_module, 'router') and route_module.router:
                    app.include_router(route_module.router)
                    logger.info(f"Registered route: {route_name}")
                else:
                    route_load_failures.append((route_name, "router missing or None"))
            except Exception as e:
                route_load_failures.append((route_name, str(e)))

        if route_load_failures:
            formatted_failures = "; ".join(
                f"{name} ({error})" for name, error in route_load_failures
            )
            strict_route_loading = os.getenv("MAP2_STRICT_ROUTE_LOADING", "true").lower() in ("1", "true", "yes")
            logger.error(
                "Route registration failures detected: %s",
                formatted_failures,
            )
            if strict_route_loading:
                raise RuntimeError(f"Route registration failures: {formatted_failures}")

        # LCD routes (optional)
        try:
            from app.routes import lcd
            if lcd.router:
                app.include_router(lcd.router)
                logger.info("LCD routes registered")
        except ImportError:
            logger.debug("LCD routes not available")
        
        # Register LCD event routes
        try:
            from app.routes import lcd_events
            if lcd_events.router:
                app.include_router(lcd_events.router)
                logger.info("LCD event routes registered")
                # Note: init_lcd_routes would need to be called from lifespan context
                # where lcd_manager is available. Skipping here to avoid NameError.
        except Exception as e:
            logger.warning(f"Failed to load LCD event routes: {e}")

        # HTTP GET handlers
        from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
        from fastapi.staticfiles import StaticFiles
        
        # Register new monitoring routes
        try:
            from app.routes import monitoring
            if monitoring.router:
                app.include_router(monitoring.router)
                logger.info("Monitoring routes registered")
        except Exception as e:
            logger.warning(f"Failed to load monitoring routes: {e}")
        
        # Register deployment routes
        try:
            from app.routes import deployment
            if deployment.router:
                app.include_router(deployment.router)
                logger.info("Deployment routes registered")
        except Exception as e:
            logger.warning(f"Failed to load deployment routes: {e}")
        
        # Register SSH trust routes
        try:
            from app.routes import ssh_trust
            if ssh_trust.router:
                app.include_router(ssh_trust.router)
                logger.info("SSH trust routes registered")
        except Exception as e:
            logger.warning(f"Failed to load SSH trust routes: {e}")
        
        # Register peer discovery routes
        try:
            from app.routes import peer_discovery
            if peer_discovery.router:
                app.include_router(peer_discovery.router)
                logger.info("Peer discovery routes registered")
        except Exception as e:
            logger.warning(f"Failed to load peer discovery routes: {e}")
        
        # Register deployment health routes
        try:
            from app.routes import deployment_health
            if deployment_health.router:
                app.include_router(deployment_health.router)
                logger.info("Deployment health routes registered")
        except Exception as e:
            logger.warning(f"Failed to load deployment health routes: {e}")

        # AVB/TSN routes (always available, return available=false when disabled)
        try:
            from app.routes import avb
            if avb.router:
                app.include_router(avb.router)
                logger.info("AVB/TSN routes registered")
        except Exception as e:
            logger.warning(f"Failed to load AVB routes: {e}")

        try:
            from app.routes import tesira as tesira_routes
            app.include_router(tesira_routes.router)
            logger.info("Tesira Forte AVB routes registered")
        except Exception as e:
            logger.warning(f"Failed to load Tesira routes: {e}")

        # Static files directory - check for web/dist first (Vite build), then static
        project_root = os.path.dirname(os.path.dirname(__file__))
        web_dist_dir = os.path.join(project_root, 'web', 'dist')
        static_dir = web_dist_dir if os.path.isdir(web_dist_dir) else os.path.join(project_root, 'static')

        # Serve static files for the web UI
        if os.path.isdir(static_dir):
            # Mount directories for Vite build (assets, img) and legacy (css)
            assets_dir = os.path.join(static_dir, 'assets')
            css_dir = os.path.join(static_dir, 'css')
            img_dir = os.path.join(static_dir, 'img')
            var_dir = os.path.join(static_dir, 'var')

            if os.path.isdir(assets_dir):
                app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
            if os.path.isdir(css_dir):
                app.mount("/css", StaticFiles(directory=css_dir), name="css")
            if os.path.isdir(img_dir):
                app.mount("/img", StaticFiles(directory=img_dir), name="img")
            if os.path.isdir(var_dir):
                app.mount("/var", StaticFiles(directory=var_dir), name="var")

            @app.get("/manifest.json")
            async def manifest_json():
                """PWA manifest for Android app."""
                manifest_path = os.path.join(static_dir, 'manifest.json')
                if os.path.exists(manifest_path):
                    return FileResponse(manifest_path, media_type="application/json")
                return JSONResponse({"name": "MAP2 Audio Platform"})

            @app.get("/favicon.ico")
            async def favicon():
                """Serve favicon."""
                favicon_path = os.path.join(static_dir, 'favicon.ico')
                if os.path.exists(favicon_path):
                    return FileResponse(favicon_path, media_type="image/x-icon")
                return JSONResponse({}, status_code=404)

            @app.get("/vite.svg")
            async def vite_svg():
                """Serve Vite logo (dev)."""
                svg_path = os.path.join(static_dir, 'vite.svg')
                if os.path.exists(svg_path):
                    return FileResponse(svg_path, media_type="image/svg+xml")
                return JSONResponse({}, status_code=404)

            @app.get("/", response_class=HTMLResponse)
            async def root_http():
                """Root HTTP endpoint - serves the web UI."""
                index_path = os.path.join(static_dir, 'index.html')
                if os.path.exists(index_path):
                    return FileResponse(index_path, media_type="text/html")
                return HTMLResponse("<html><body><h1>MAP2 Audio Platform</h1></body></html>")

            logger.info(f"Static files served from: {static_dir}")
        else:
            @app.get("/", response_class=HTMLResponse)
            async def root_http():
                """Root HTTP endpoint - fallback when no static dir."""
                return HTMLResponse("""<!DOCTYPE html>
<html><head><title>MAP2 Audio Platform</title></head>
<body><h1>MAP2 Audio Platform</h1><p>Professional Real-Time Audio Processing System</p></body>
</html>""")

        return app

    except ImportError:
        logger.error("FastAPI not available")
        return None


def main():
    """Run FastAPI server."""
    try:
        import uvicorn
        import socket
        import time
        from app.config import ConfigManager

        config = ConfigManager()
        app = create_app()
        
        if app:
            host = config.get("backend.host", "0.0.0.0")
            port = config.get("backend.port", 8080)
            logger_main = logging.getLogger("map2.main")
            
            # Check if port is available (with better error handling)
            port_available = False
            max_attempts = 3
            
            for attempt in range(max_attempts):
                try:
                    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                        s.settimeout(1)
                        result = s.connect_ex(("127.0.0.1", port))
                        if result != 0:  # Connection failed = port is available
                            port_available = True
                            break
                        else:
                            logger_main.warning(f"Port {port} appears to be in use (attempt {attempt+1}/{max_attempts})")
                            if attempt < max_attempts - 1:
                                time.sleep(1)  # Wait before retrying
                except Exception as e:
                    logger_main.debug(f"Port check error (attempt {attempt+1}): {e}")
                    if attempt == max_attempts - 1:
                        raise
            
            if not port_available:
                logger_main.error(f"Port {port} is already in use after {max_attempts} attempts. Please free the port or change the configuration.")
                raise RuntimeError(f"Port {port} is already in use. Please free the port or change the configuration.")
            
            logger_main.info(f"Starting MAP2 Audio Engine on {host}:{port}")
            uvicorn.run(app, host=host, port=port, log_level="info")
        else:
            logger.error("Failed to create app")
    except Exception as e:
        logger.error(f"Failed to start server: {e}", exc_info=True)


if __name__ == "__main__":
    main()
else:
    # For uvicorn module loading (e.g., uvicorn app.main:app)
    app = create_app()
