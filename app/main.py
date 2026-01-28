
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
        from app.services.metrics_daemon import start_metrics_daemon, stop_metrics_daemon
        from app.services.service_orchestrator import get_orchestrator
        from app.services.websocket_manager import ws_manager
        from app.services.realtime_parameter_bridge import rt_parameter_bridge
        from app.services.parameter_routing import connect_parameter_routing, disconnect_parameter_routing
        from app.services.plugin_preset_lifecycle import get_preset_lifecycle
        from app.services.metering_broadcast import start_metering_broadcast, stop_metering_broadcast
        from app.database import checkpoint_database

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

        running = sum(1 for v in results.values() if v)
        total = len(results)
        logger.info(f"✅ Startup complete: {running}/{total} services running")

        yield  # Server runs here

        # ===== SHUTDOWN =====
        logger.info("Stopping MAP2 Audio Platform services...")
        await safe_stop_service(logger, "Metering broadcast service", stop_metering_broadcast)
        await safe_stop_service(logger, "Plugin preset lifecycle manager", preset_lifecycle.shutdown)
        await safe_stop_service(logger, "Parameter routing", disconnect_parameter_routing)
        await safe_stop_service(logger, "Real-time parameter bridge", rt_parameter_bridge.stop)
        await safe_stop_service(logger, "Metrics daemon", stop_metrics_daemon)
        await safe_stop_service(logger, "Orchestrator services", orchestrator.stop_all)
        await safe_stop_service(logger, "Database checkpoint", checkpoint_database)
        logger.info("✅ Shutdown complete")
    except Exception as e:
        log_and_raise_critical(logger, "Error in application lifespan", e)


def create_app():
    """Create and configure FastAPI application."""
    try:
        from fastapi import FastAPI
        from fastapi.middleware.cors import CORSMiddleware

        app = FastAPI(
            title="MAP2 Audio Platform",
            description="Professional audio processing with LV2 plugins and MIDI routing",
            version="1.24.25.1",
            lifespan=lifespan  # Use async lifespan instead of startup/shutdown events
        )

        # CORS middleware
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # Import and register routes individually to avoid cascade failures
        # Audio engine routes are provided via the 'engine' module (JUCE-based)
        route_modules = ['services', 'audio', 'plugins', 'midi', 'chains', 'health', 'metrics', 'nam', 'ir', 'guitar', 'websocket', 'websocket_rt', 'automation', 'history', 'midi_learn', 'performance', 'plugin_scanner', 'sessions', 'presets', 'plugin_presets', 'packages', 'profiling', 'reverb', 'impulse_response', 'folders', 'system', 'dsp', 'latency', 'usb_devices', 'system_tests', 'engine', 'network', 'www', 'backup', 'dashboard', 'preset_migration', 'delay', 'autotune', 'triplespread', 'plugin_packages', 'valentine', 'zlequalizer', 'snapshots', 'freeverb3', 'spectrum', 'cpu_metrics', 'loudness', 'sidechain', 'vst3_routes', 'vst3_packages']

        for route_name in route_modules:
            try:
                route_module = __import__(f'app.routes.{route_name}', fromlist=['router'])
                if hasattr(route_module, 'router') and route_module.router:
                    app.include_router(route_module.router)
                    logger.info(f"Registered route: {route_name}")
            except ImportError as e:
                logger.debug(f"Route {route_name} not available: {e}")
            except Exception as e:
                logger.warning(f"Failed to load route {route_name}: {e}")

        # LCD routes (optional)
        try:
            from app.routes import lcd
            if lcd.router:
                app.include_router(lcd.router)
                logger.info("LCD routes registered")
        except ImportError:
            logger.debug("LCD routes not available")

        # HTTP GET handlers
        from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
        from fastapi.staticfiles import StaticFiles
        import os

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
        from app.config import ConfigManager

        config = ConfigManager()
        app = create_app()
        
        if app:
            host = config.get("backend.host", "0.0.0.0")
            import socket
            import logging
            port = config.get("backend.port", 8080)
            logger = logging.getLogger("map2.main")
            # Check if port is available
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(("0.0.0.0", port)) == 0:
                    logger.error(f"Port {port} is already in use. Please free the port or change the configuration.")
                    raise RuntimeError(f"Port {port} is already in use. Please free the port or change the configuration.")
            logger.info(f"Starting MAP2 Audio Engine on port {port}")
            # ...existing code...
            uvicorn.run(app, host=host, port=port, log_level="info")
        else:
            logger.error("Failed to create app")
    except Exception as e:
        logger.error(f"Failed to start server: {e}")


if __name__ == "__main__":
    main()
else:
    # For uvicorn module loading (e.g., uvicorn app.main:app)
    app = create_app()
