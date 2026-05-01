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

import asyncio
import gc
import os
import signal
import threading
import time

_SERVICE_STOP_TIMEOUT_SECONDS = 2.0
_FORCED_EXIT_WATCHDOG_SECONDS = 5.0
_RT_GC_THRESHOLDS = (3500, 10, 10)
_shutdown_signal_handlers_installed = False
_shutdown_watchdog_started = False


def configure_gc_for_rt_workload() -> tuple[int, int, int]:
    """Raise Python GC thresholds to reduce event-loop pause frequency."""
    gc.set_threshold(*_RT_GC_THRESHOLDS)
    logger.info(
        "Configured Python GC thresholds for RT workload: %s/%s/%s",
        *_RT_GC_THRESHOLDS,
    )
    return _RT_GC_THRESHOLDS

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

async def safe_stop_service(
    logger,
    name,
    stop_coro,
    *,
    timeout_seconds: float = _SERVICE_STOP_TIMEOUT_SECONDS,
):
    try:
        if timeout_seconds > 0:
            await asyncio.wait_for(stop_coro(), timeout=timeout_seconds)
        else:
            await stop_coro()
        logger.info(f"{name} stopped successfully")
    except asyncio.TimeoutError:
        logger.warning(f"Timed out stopping {name} after {timeout_seconds:.1f}s")
    except Exception as e:
        logger.warning(f"Failed to stop {name}: {e}")


async def _run_optional_service_start(
    logger,
    name: str,
    start_coro_factory: Callable[[], Awaitable[Any]],
) -> None:
    """Start optional services in the background without delaying app readiness."""
    try:
        await start_coro_factory()
        logger.info("%s started successfully (background startup)", name)
    except asyncio.CancelledError:
        logger.debug("Background startup cancelled for %s", name)
        raise
    except Exception as e:
        logger.warning(f"{name} not started: {e}")


def defer_optional_service_start(
    logger,
    name: str,
    start_coro_factory: Callable[[], Awaitable[Any]],
) -> asyncio.Task[None]:
    task_name = f"startup:{name.strip().lower().replace(' ', '-')}"
    return asyncio.create_task(
        _run_optional_service_start(logger, name, start_coro_factory),
        name=task_name,
    )


async def cancel_background_startup_tasks(tasks: list[asyncio.Task[None]]) -> None:
    """Cancel or drain background startup helpers before shutdown."""
    for task in tasks:
        if not task.done():
            task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


def _emit_shutdown_notice(message: str) -> None:
    try:
        os.write(2, (message.rstrip() + "\n").encode("utf-8", "replace"))
    except OSError:
        pass


def _start_forced_shutdown_watchdog(signal_name: str) -> None:
    global _shutdown_watchdog_started

    if _shutdown_watchdog_started or _FORCED_EXIT_WATCHDOG_SECONDS <= 0:
        return
    _shutdown_watchdog_started = True

    def _watchdog() -> None:
        time.sleep(_FORCED_EXIT_WATCHDOG_SECONDS)
        _emit_shutdown_notice(
            f"{signal_name} shutdown watchdog forcing process exit after "
            f"{_FORCED_EXIT_WATCHDOG_SECONDS:.1f}s"
        )
        os._exit(0)

    threading.Thread(
        target=_watchdog,
        name="map2-shutdown-watchdog",
        daemon=True,
    ).start()


def _runtime_shutdown_signal_handler(
    signum: int,
    frame,
    *,
    previous_handler,
) -> None:
    signal_name = signal.Signals(signum).name
    _emit_shutdown_notice(f"{signal_name} received; starting forced-exit watchdog")
    _start_forced_shutdown_watchdog(signal_name)

    if callable(previous_handler):
        previous_handler(signum, frame)
        return

    if previous_handler == signal.SIG_DFL:
        raise SystemExit(0)


def _install_runtime_shutdown_signal_handlers() -> None:
    global _shutdown_signal_handlers_installed

    if _shutdown_signal_handlers_installed:
        return

    for sig in (signal.SIGTERM, signal.SIGINT):
        previous_handler = signal.getsignal(sig)

        def _wrapped(signum, frame, previous_handler=previous_handler):
            _runtime_shutdown_signal_handler(
                signum,
                frame,
                previous_handler=previous_handler,
            )

        signal.signal(sig, _wrapped)

    logger.info(
        "Installed runtime shutdown watchdog handlers: SIGTERM=%r SIGINT=%r",
        signal.getsignal(signal.SIGTERM),
        signal.getsignal(signal.SIGINT),
    )
    _shutdown_signal_handlers_installed = True

import logging
from contextlib import asynccontextmanager
from fastapi.responses import JSONResponse
from typing import Any, Awaitable, Callable, Dict, Optional

from app.services.db_pool_manager import get_pool_manager, ConnectionPoolConfig
from app.utils.health_metrics import init_health_metrics

logger = logging.getLogger(__name__)


def _route_module_is_optional_unavailable(route_module: Any) -> bool:
    """Return True when an optional route plugin intentionally exports no router."""
    return bool(getattr(route_module, "OPTIONAL_ROUTE", False)) and not getattr(route_module, "router", None)


def _midi_cluster_enabled() -> bool:
    try:
        from app.config import config_get

        return bool(config_get("midi.cluster.enabled", False))
    except Exception:
        return False


def _resolve_cors_settings() -> tuple[list[str], bool]:
    try:
        from app.config import config_get

        raw_origins = config_get("backend.cors_origins", ["*"])
    except Exception:
        raw_origins = ["*"]

    if not isinstance(raw_origins, list):
        raw_origins = [raw_origins]

    origins = [
        str(origin).strip()
        for origin in raw_origins
        if str(origin).strip()
    ] or ["*"]
    allow_credentials = "*" not in origins
    return origins, allow_credentials


async def start_cluster_midi_services(
    logger: logging.Logger,
    *,
    node_id: str,
    hostname: str,
    api_port: int,
) -> Optional[Dict[str, Any]]:
    if not _midi_cluster_enabled():
        logger.info("Cluster MIDI services disabled (midi.cluster.enabled=false)")
        return None

    from app.services.midi_hub.cluster_clock import get_midi_cluster_clock
    from app.services.midi_hub.cluster_router import get_midi_cluster_router
    from app.services.midi_hub.hub import get_midi_hub
    from app.services.midi_hub.midi_discovery import get_midi_discovery_service
    from app.services.midi_hub.rtp_transport import get_rtp_transport

    midi_hub = get_midi_hub()
    midi_discovery = get_midi_discovery_service()
    midi_discovery.broadcast_local_node(node_id, hostname, api_port)

    rtp_transport = get_rtp_transport()
    await safe_start_service(logger, "MIDI RTP transport", rtp_transport.start)

    cluster_router = get_midi_cluster_router()
    cluster_router.set_discovery(midi_discovery)
    cluster_router.set_transport(rtp_transport)
    cluster_router.set_hub(midi_hub)
    midi_hub.cluster_router = cluster_router
    await safe_start_service(logger, "MIDI cluster router", cluster_router.start)

    cluster_clock = get_midi_cluster_clock()
    await safe_start_service(logger, "MIDI cluster clock", cluster_clock.start)

    return {
        "midi_hub": midi_hub,
        "midi_discovery": midi_discovery,
        "rtp_transport": rtp_transport,
        "cluster_router": cluster_router,
        "cluster_clock": cluster_clock,
    }


async def stop_cluster_midi_services(logger: logging.Logger, services: Optional[Dict[str, Any]]) -> None:
    if not services:
        return

    cluster_clock = services.get("cluster_clock")
    if cluster_clock is not None:
        await safe_stop_service(logger, "MIDI cluster clock", cluster_clock.stop)

    cluster_router = services.get("cluster_router")
    if cluster_router is not None:
        await safe_stop_service(logger, "MIDI cluster router", cluster_router.stop)

    rtp_transport = services.get("rtp_transport")
    if rtp_transport is not None:
        await safe_stop_service(logger, "MIDI RTP transport", rtp_transport.stop)

    midi_hub = services.get("midi_hub")
    if midi_hub is not None:
        midi_hub.cluster_router = None

    midi_discovery = services.get("midi_discovery")
    if midi_discovery is not None:
        try:
            midi_discovery.stop()
            logger.info("MIDI discovery stopped successfully")
        except Exception as e:
            logger.warning(f"Failed to stop MIDI discovery: {e}")


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
        configure_gc_for_rt_workload()
        
        # Initialize health metrics
        init_health_metrics()
        logger.info("Health metrics initialized")
        
        # Initialize database connection pool
        logger.info("Initializing database connection pool...")
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
        from app.services.snapshot_runtime_state_service import (
            start_snapshot_runtime_heartbeat,
            stop_snapshot_runtime_heartbeat,
        )
        from app.database import checkpoint_database
        from app.services.lcd_manager import LCDManager, set_lcd_manager as set_global_lcd_manager
        from app.services.event_producers import (
            AudioEventProducer,
            SystemHealthProducer,
            NetworkEventProducer,
            PluginEventProducer,
            DatabaseEventProducer,
        )
        from app.services.platform_event.bus import get_platform_event_bus
        from app.services.mdns_discovery import MDNSPeerDiscovery
        from app.services.node_identity import NodeIdentity
        avb_router = None
        cluster_midi_services = None
        config_reloader = None
        openapi_schema_sync = None
        avb_event_sync = None
        push_surface_manager = None
        launch_control_surface_service = None
        midi_commander_surface_service = None
        background_start_tasks: list[asyncio.Task[None]] = []

        # Initialize deployment configuration
        logger.info("Initializing deployment configuration...")
        from app.deployment.authority import (
            get_deployment_mode_authority,
            resolve_deployment_mode,
        )
        from app.deployment.deployment import initialize_deployment_config, get_deployment_config

        # T2437: resolve the canonical mode through the authority chain
        # (explicit override → MAP2_DEPLOYMENT_MODE → /etc/map2/mode.json
        # → legacy ~/.map2/deployment.json → fallback). Log the provenance
        # so boot diagnostics show which layer won.
        authority = get_deployment_mode_authority()
        canonical_mode = resolve_deployment_mode(authority=authority, fallback="AUDIO-NODE")
        logger.info(
            "Deployment mode resolved: %s (authority_file=%s exists=%s)",
            canonical_mode,
            authority.path,
            authority.exists(),
        )

        # Initialize legacy config (creates ~/.map2/deployment.json if not exists).
        # Still needed because many services read DeploymentConfig directly;
        # retiring the legacy mirror fully is deferred until every consumer is
        # migrated to resolve_deployment_mode().
        initialize_deployment_config()
        deployment_config = get_deployment_config()
        logger.info(f"Legacy DeploymentConfig mode: {deployment_config.mode.value}")

        # Initialize runtime config watching so local file edits can fan out
        # through canonical PlatformEvents without requiring an API call first.
        try:
            from app.services.config_hot_reload import get_or_init_config_reloader

            config_reloader = get_or_init_config_reloader(watch=True)
            logger.info("Configuration hot-reloader initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize configuration hot-reloader: {e}")

        # Initialize frontend-only graceful degradation integration.
        try:
            from app.services.frontend_degradation import initialize_frontend_degradation
            initialize_frontend_degradation(os.getenv("MAP2_REMOTE_BACKEND_URL"))
        except Exception as e:
            logger.warning(f"Failed to initialize frontend degradation: {e}")

        try:
            from app.services.openapi_schema_sync import get_openapi_schema_sync_service

            openapi_schema_sync = get_openapi_schema_sync_service()
            await safe_start_service(
                logger,
                "OpenAPI schema sync",
                lambda: openapi_schema_sync.start(app),
            )
        except Exception as e:
            logger.warning(f"Failed to initialize OpenAPI schema sync: {e}")
        
        # Initialize LCD Event System
        logger.info("Initializing LCD Event System...")
        use_mock_lcd = os.getenv("MAP2_USE_MOCK_LCD", "true").lower() in ("1", "true", "yes")
        api_port = int(os.getenv("MAP2_API_PORT", "8080"))

        identity = NodeIdentity(mode=canonical_mode)
        node_id = identity.node_id
        node_label = identity.node_id

        # mDNS discovery
        mdns_discovery = MDNSPeerDiscovery(node_id, canonical_mode, port=api_port)
        platform_event_bus = get_platform_event_bus()
        try:
            from app.services.ws_federation import get_ws_federator

            await safe_start_service(
                logger,
                "Platform event federation",
                lambda: get_ws_federator().start_platform_event_mesh(),
            )
        except Exception as e:
            logger.warning(f"Failed to initialize platform event federation: {e}")

        # LCD manager
        lcd_manager = LCDManager(
            node_id,
            node_label,
            use_mock_lcd=use_mock_lcd,
            mdns_discovery=mdns_discovery,
            platform_event_bus=platform_event_bus,
        )
        await safe_start_service(logger, "LCD Manager", lcd_manager.start)
        set_global_lcd_manager(lcd_manager)
        
        # Initialize event producers
        audio_producer = AudioEventProducer(platform_event_bus, node_label=node_label)
        system_producer = SystemHealthProducer(platform_event_bus, node_label=node_label)
        network_producer = NetworkEventProducer(platform_event_bus, node_label=node_label)
        plugin_producer = PluginEventProducer(platform_event_bus, node_label=node_label)
        database_producer = DatabaseEventProducer(platform_event_bus, node_label=node_label)

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

        try:
            from app.services.webhook_dispatcher_service import get_webhook_dispatcher_service

            webhook_dispatcher = get_webhook_dispatcher_service()
            await safe_start_service(
                logger, "Outbound Webhook Dispatcher", webhook_dispatcher.start
            )
        except Exception as e:
            logger.warning(f"Failed to start outbound webhook dispatcher: {e}")

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
        try:
            from app.services.avb_event_sync import get_avb_event_sync_service

            avb_event_sync = get_avb_event_sync_service()
            await safe_start_service(logger, "AVB websocket sync", avb_event_sync.start)
        except Exception as e:
            logger.warning(f"Failed to initialize AVB websocket sync: {e}")

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
        # Start authoritative snapshot runtime heartbeat broadcaster.
        await safe_start_service(logger, "Snapshot runtime heartbeat", start_snapshot_runtime_heartbeat)
        # T2454 slice 1: 30s reconciler loop that walks the operator-pinned
        # snapshot set and self-heals warm-cache state (evicts orphans,
        # re-warms drifted/cold pins). Cancelled cleanly on shutdown.
        try:
            from app.services.snapshot.preload_reconciler import get_preload_reconciler

            preload_reconciler = get_preload_reconciler()
            preload_reconciler.start()
        except Exception as exc:
            logger.warning("Failed to start snapshot preload reconciler: %s", exc)
        # Attach MIDI v2 service to MidiHub consumer stream (program-change handling).
        try:
            from app.services.midi_service import midi_service

            midi_service.attach_midi_hub(asyncio.get_running_loop())
            logger.info("MIDI v2 service attached to MidiHub")
        except Exception as exc:
            logger.warning(f"Failed to attach MIDI v2 service to MidiHub: {exc}")

        try:
            from app.services.launch_control_surface import get_launch_control_surface_service

            launch_control_surface_service = get_launch_control_surface_service()
            await safe_start_service(logger, "Launch Control surface service", launch_control_surface_service.start)
        except Exception as exc:
            logger.warning(f"Failed to initialize Launch Control surface service: {exc}")

        try:
            from app.services.midi_commander_surface import get_midi_commander_surface_service

            midi_commander_surface_service = get_midi_commander_surface_service()
            await safe_start_service(logger, "MIDI Commander surface service", midi_commander_surface_service.start)
        except Exception as exc:
            logger.warning(f"Failed to initialize MIDI Commander surface service: {exc}")

        try:
            from app.config import config_get as _config_get
            from app.services.push_surface import PushSurfaceConfig, get_push_surface_manager

            push_surface_enabled = (
                bool(_config_get("push_surface.enabled", False))
                or bool(PushSurfaceConfig.load().enabled)
                or os.getenv("MAP2_PUSH_SURFACE_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
            )
            if push_surface_enabled:
                push_surface_manager = get_push_surface_manager()
                await safe_start_service(logger, "Push surface manager", push_surface_manager.start)
            else:
                logger.debug("Push surface manager disabled (push_surface.enabled=false)")
        except Exception as exc:
            logger.warning(f"Failed to initialize Push surface manager: {exc}")

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
                except Exception as exc:
                    logger.debug("PipeWire recovery engine wiring skipped", exc_info=exc)
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

        # T2480-3 + 2026-05-01 fix: install the inbound MIDI traffic bridge
        # unconditionally (originally placed inside start_cluster_midi_services
        # but skipped when midi.cluster.enabled=false — which is the default
        # in single-node ALL-IN-ONE mode and meant the Brain Setup task's
        # Test phase visualizer never received live events).
        try:
            from app.services.midi_hub.inbound_traffic_bridge import (
                install_inbound_midi_traffic_bridge,
            )
            install_inbound_midi_traffic_bridge()
        except Exception as e:
            logger.warning(f"Failed to install inbound MIDI traffic bridge: {e}")

        cluster_midi_services = await start_cluster_midi_services(
            logger,
            node_id=node_id,
            hostname=os.uname().nodename,
            api_port=api_port,
        )

        # Bind AVB router discovery lifecycle to backend startup/shutdown.
        try:
            from app.services.avb.avb_router import get_avb_router

            avb_router = get_avb_router()
            background_start_tasks.append(
                defer_optional_service_start(logger, "AVB router discovery", avb_router.start)
            )
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

                async def _start_tesira_background() -> None:
                    nonlocal tesira_ptp

                    await tesira_fleet.start()
                    tesira_ptp = TesiraPTPCoordinator(tesira_fleet)
                    await tesira_ptp.start()
                    tesira_interlock = TesiraPresetInterlock(tesira_fleet)
                    tesira_fleet.set_preset_interlock(tesira_interlock)
                    preset_lifecycle.register_listener(
                        "preset_loaded", tesira_interlock.on_preset_loaded_event
                    )
                    # Discovery service is stateless — just instantiate the singleton
                    get_tesira_discovery()
                    logger.info("Tesira Forte AVB integration started")

                background_start_tasks.append(
                    defer_optional_service_start(logger, "Tesira Fleet", _start_tesira_background)
                )
            else:
                logger.debug("Tesira integration disabled (tesira.enabled=false)")
        except Exception as e:
            logger.warning(f"Tesira fleet not started: {e}")

        # ── State Authority reconciliation scheduler ────────────────────────
        # Layer 1 local self-heal every 5s + optional Layer 2 cluster
        # coordination when this node is management. Scheduler captured on
        # app.state so /api/state-authority/reconciliation/metrics can read
        # its live metrics.
        state_authority_scheduler = None
        try:
            from app.services.state_authority_reconciliation_scheduler import (
                ReconciliationSchedulerConfig,
                StateAuthorityReconciliationScheduler,
            )
            from app.services.state_authority_reconciliation_service import (
                StateAuthorityReconciliationService,
            )

            async def _live_payload_producer():
                try:
                    from app.services.snapshot_runtime_service import (
                        get_authoritative_live_state,
                    )
                    producer = getattr(get_authoritative_live_state, "__call__", None)
                    if producer is None:
                        return None
                    result = get_authoritative_live_state()
                    if asyncio.iscoroutine(result):
                        return await result
                    return result
                except Exception as exc:  # noqa: BLE001
                    logger.debug("Reconciliation live-payload producer failed: %s", exc)
                    return None

            async def _local_reconcile(payload, tolerance, apply_corrections):
                svc = StateAuthorityReconciliationService()
                # Owner: no session binding is required by the service as implemented.
                return await svc.reconcile_live_snapshot_payload(
                    payload,
                    tolerance=tolerance,
                    apply_corrections=apply_corrections,
                )

            from app.config import config_get as _cfg_get
            is_management = bool(_cfg_get("cluster.is_management_node", False))

            # Layer 2 cluster reconciler — composed from peer discovery +
            # per-node observed state + tier handlers. Defensive: if any
            # dependency isn't wired, cluster_reconciler stays None and the
            # scheduler runs Layer 1 only.
            cluster_reconciler_callable = None
            if is_management:
                try:
                    from app.services.state_authority_cluster_reconciler import (
                        ClusterReconciler,
                    )
                    from app.services.state_authority_cluster_transport import (
                        fetch_observed_snapshot,
                        list_cluster_node_ids,
                        push_node_parameters,
                        redeploy_asset_to_node,
                        trigger_node_reactivation,
                    )

                    async def _cluster_desired_state():
                        try:
                            return await _live_payload_producer()
                        except Exception:
                            return None

                    # Apply corrections is gated on config so operators can
                    # start in observe-only mode before enabling auto-fix.
                    apply_cluster_corrections = bool(
                        _cfg_get("state_authority.apply_cluster_corrections", False)
                    )
                    cluster_tolerance = float(
                        _cfg_get("state_authority.cluster_tolerance", 0.01) or 0.01
                    )

                    cluster_reconciler_obj = ClusterReconciler(
                        desired_state=_cluster_desired_state,
                        observed_state=fetch_observed_snapshot,
                        list_nodes=list_cluster_node_ids,
                        push_params=push_node_parameters,
                        trigger_reactivation=trigger_node_reactivation,
                        redeploy_asset=redeploy_asset_to_node,
                        tolerance=cluster_tolerance,
                        apply_corrections=apply_cluster_corrections,
                    )

                    async def _cluster_reconciler_callable():
                        return await cluster_reconciler_obj.reconcile()

                    cluster_reconciler_callable = _cluster_reconciler_callable
                    logger.info(
                        "State Authority cluster reconciler composed "
                        "(apply_corrections=%s, tolerance=%s)",
                        apply_cluster_corrections,
                        cluster_tolerance,
                    )
                except Exception as exc:
                    logger.debug("Cluster reconciler composition skipped: %s", exc)

            # Platform event emitter adapter — flows reconciliation outcomes
            # through the canonical PlatformEventBus per the CLAUDE.md rule
            # ("bus.emit() is the only permitted cross-system event entrypoint").
            async def _emit_state_authority_event(
                kind: str, severity: str, context: dict
            ) -> None:
                try:
                    from app.services.platform_event.bus import get_platform_event_bus
                    from app.services.platform_event.envelope import PlatformEvent

                    bus = get_platform_event_bus()
                    layer = str(context.get("layer") or "local")
                    title = f"Reconciliation {layer}"
                    message = str(context.get("report", {}).get("status", kind))[:200]
                    event = PlatformEvent(
                        kind=kind,
                        severity=severity,
                        source_node=node_id or "local",
                        source_service="state_authority_reconciliation_scheduler",
                        title=title[:40],
                        message=message or layer,
                        context=dict(context),
                        priority=0.3 if severity == "info" else 0.6,
                    )
                    await bus.emit(event)
                except Exception as exc:  # noqa: BLE001
                    logger.debug(
                        "State Authority reconciliation event emit skipped: %s", exc
                    )

            state_authority_scheduler = StateAuthorityReconciliationScheduler(
                config=ReconciliationSchedulerConfig(is_management_node=is_management),
                live_payload_producer=_live_payload_producer,
                local_reconciler=_local_reconcile,
                cluster_reconciler=cluster_reconciler_callable,
                event_emitter=_emit_state_authority_event,
            )
            app.state.state_authority_scheduler = state_authority_scheduler
            await safe_start_service(
                logger,
                "State Authority reconciliation scheduler",
                state_authority_scheduler.start,
            )
        except Exception as exc:
            logger.warning(
                "State Authority reconciliation scheduler not started: %s", exc
            )

        # T2459-G15 — start the controller-host supervisor + the Hardware
        # Store hot-plug connection bus from the async lifespan context.
        # These were previously called from `create_app` (sync), which
        # caused a SyntaxError on backend boot.
        try:
            from app.services.controller_host_service import get_controller_host_service
            controller_host = get_controller_host_service()
            await controller_host.start()
            logger.info(
                "ControllerHostService supervisor started (status=%s)",
                controller_host.status,
            )
        except Exception as exc:
            logger.warning("ControllerHostService supervisor not started: %s", exc)

        try:
            from app.services.controllers.connection_event_bus import (
                get_connection_event_bus,
            )
            connection_bus = get_connection_event_bus()
            await connection_bus.start()
            logger.info("ConnectionEventBus started for Hardware Store /api/devices/ws")
        except Exception as exc:
            logger.warning("ConnectionEventBus not started: %s", exc)

        running = sum(1 for v in results.values() if v)
        total = len(results)
        logger.info("Startup complete: %s/%s services running", running, total)
        _install_runtime_shutdown_signal_handlers()

        yield  # Server runs here

        # ===== SHUTDOWN =====
        logger.info("Stopping MAP2 Audio Platform services...")
        await cancel_background_startup_tasks(background_start_tasks)

        # T2459 — Stop the controller-host supervisor + clear active mappings.
        try:
            from app.services.controllers import get_controller_service
            from app.services.controller_host_service import get_controller_host_service
            from app.services.controllers.connection_event_bus import (
                get_connection_event_bus,
            )
            await safe_stop_service(
                logger,
                "Hardware Store connection event bus",
                get_connection_event_bus().stop,
            )
            await safe_stop_service(
                logger,
                "Controller host supervisor",
                get_controller_host_service().stop,
            )
            get_controller_service().stop()
        except Exception as exc:
            logger.debug("Controller subsystem stop skipped: %s", exc)

        if state_authority_scheduler is not None:
            await safe_stop_service(
                logger,
                "State Authority reconciliation scheduler",
                state_authority_scheduler.stop,
            )

        if tesira_ptp is not None:
            await safe_stop_service(logger, "Tesira PTP Coordinator", tesira_ptp.stop)
        if tesira_fleet is not None:
            await safe_stop_service(logger, "Tesira Fleet", tesira_fleet.stop)
        if avb_event_sync is not None:
            await safe_stop_service(logger, "AVB websocket sync", avb_event_sync.stop)
        if openapi_schema_sync is not None:
            await safe_stop_service(logger, "OpenAPI schema sync", openapi_schema_sync.stop)

        if config_reloader is not None and config_reloader.watch_enabled:
            try:
                config_reloader.stop_watching()
                logger.info("Configuration hot-reloader stopped")
            except Exception as e:
                logger.warning(f"Failed to stop configuration hot-reloader: {e}")

        if avb_router is not None:
            await safe_stop_service(logger, "AVB router discovery", avb_router.stop)

        await stop_cluster_midi_services(logger, cluster_midi_services)
        
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
        await safe_stop_service(logger, "Snapshot runtime heartbeat", stop_snapshot_runtime_heartbeat)
        # T2454 slice 1: stop the preload reconciler and let in-flight
        # warming complete (5s timeout inside `stop()`).
        try:
            from app.services.snapshot.preload_reconciler import get_preload_reconciler

            await safe_stop_service(
                logger,
                "Snapshot preload reconciler",
                get_preload_reconciler().stop,
            )
        except Exception as exc:
            logger.debug("Preload reconciler stop skipped: %s", exc)
        await safe_stop_service(logger, "Metering broadcast service", stop_metering_broadcast)
        if push_surface_manager is not None:
            await safe_stop_service(logger, "Push surface manager", push_surface_manager.stop)
        if launch_control_surface_service is not None:
            await safe_stop_service(logger, "Launch Control surface service", launch_control_surface_service.stop)
        if midi_commander_surface_service is not None:
            await safe_stop_service(logger, "MIDI Commander surface service", midi_commander_surface_service.stop)
        try:
            from app.services.midi_service import midi_service

            midi_service.detach_midi_hub()
        except Exception as exc:
            logger.debug("MIDI service detach skipped during shutdown", exc_info=exc)
        
        # Stop LCD system
        await safe_stop_service(logger, "Database Event Producer", database_producer.stop)
        await safe_stop_service(logger, "Plugin Event Producer", plugin_producer.stop)
        await safe_stop_service(logger, "Network Event Producer", network_producer.stop)
        await safe_stop_service(logger, "System Health Producer", system_producer.stop)
        await safe_stop_service(logger, "Audio Event Producer", audio_producer.stop)
        await safe_stop_service(logger, "LCD Manager", lcd_manager.stop)
        set_global_lcd_manager(None)
        
        await safe_stop_service(logger, "Plugin preset lifecycle manager", preset_lifecycle.shutdown)
        await safe_stop_service(logger, "Parameter routing", disconnect_parameter_routing)
        await safe_stop_service(logger, "Real-time parameter bridge", rt_parameter_bridge.stop)
        await safe_stop_service(logger, "Metrics daemon", stop_metrics_daemon)
        from app.middleware.cluster_proxy import close_all_cluster_proxy_clients
        await safe_stop_service(logger, "Cluster proxy clients", close_all_cluster_proxy_clients)
        await safe_stop_service(logger, "Orchestrator services", orchestrator.stop_all)
        await safe_stop_service(logger, "Database checkpoint", checkpoint_database)
        pool_manager = get_pool_manager()
        await safe_stop_service(logger, "Database connection pool", pool_manager.close)
        logger.info("Shutdown complete")
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
        from app.middleware.api_auth import APIAuthMiddleware
        from app.utils.api_contract import generate_operation_id, install_contract_openapi
        from app.utils.platform_version import get_platform_version

        app = FastAPI(
            title="MAP2 Audio Platform",
            description="Professional audio processing with LV2 plugins and MIDI routing",
            version=get_platform_version(),
            lifespan=lifespan,  # Use async lifespan instead of startup/shutdown events
            generate_unique_id_function=generate_operation_id,
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

        cors_origins, cors_allow_credentials = _resolve_cors_settings()

        # CORS middleware
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=cors_allow_credentials,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        # Cluster API proxy middleware (transparent node targeting)
        from app.middleware.cluster_proxy import ClusterProxyMiddleware
        app.add_middleware(ClusterProxyMiddleware)

        # API Observatory traffic capture (bounded ring buffer + WS events).
        from app.middleware.traffic_capture import TrafficCaptureMiddleware
        app.add_middleware(
            TrafficCaptureMiddleware,
            enabled=os.getenv("MAP2_TRAFFIC_CAPTURE", "true").lower() in {"1", "true", "yes", "on"},
        )

        # Capture request durations for route-group percentile observability.
        from app.middleware.request_logging import RequestLoggingMiddleware
        app.add_middleware(RequestLoggingMiddleware, enabled=False)

        # Auth must be outermost so proxied requests cannot bypass role checks.
        app.add_middleware(APIAuthMiddleware)

        # Keep legacy MIDI route modules importable during the deprecation window.
        # Runtime registration flows through app.routes.midi (T2459-H5).
        from app.routes import midi_v2 as _legacy_midi_v2
        from app.routes import midi_hub as _legacy_midi_hub
        from app.routes import midi_cluster as _legacy_midi_cluster
        from app.routes import midi_learn as _legacy_midi_learn
        from app.routes import midi_commander_surface as _legacy_midi_commander_surface
        from app.routes import enriched_midi_physical_surfaces as _legacy_enriched_midi_physical_surfaces

        _ = (
            _legacy_midi_v2,
            _legacy_midi_hub,
            _legacy_midi_cluster,
            _legacy_midi_learn,
            _legacy_midi_commander_surface,
            _legacy_enriched_midi_physical_surfaces,
        )

        # Import and register routes individually to avoid cascade failures
        # Audio engine routes are provided via the 'engine' module (JUCE-based)
        route_modules = ['services', 'audio', 'audio_state', 'plugins', 'plugin_appearances', 'midi', 'chains', 'effects_loops', 'health', 'metrics', 'nam', 'nam_models', 'ir', 'guitar', 'websocket', 'websocket_rt', 'automation', 'history', 'performance', 'runtime_profiles', 'plugin_scanner', 'sessions', 'plugin_presets', 'preset_exchange', 'packages', 'profiling', 'reverb', 'impulse_response', 'folders', 'system', 'dsp', 'latency_v2', 'usb_devices', 'system_tests', 'engine', 'network', 'www', 'backup', 'dashboard', 'preset_migration', 'plugin_packages', 'unified_snapshots', 'spectrum', 'cpu_metrics', 'loudness', 'sidechain', 'upload', 'core_plugins', 'soundfonts', 'synthforge', 'mpx1', 'dynamics', 'filters', 'parallel', 'plugin_tags', 'delay', 'modulation', 'pitch', 'shoegaze', 'lexi_love', 'h3000', 'peavey5150', 'tweedbassman', 'passionfx', 'cluster_snapshots', 'cluster_health', 'cluster_health_extended', 'cluster_plugin_inventory', 'cluster_admin', 'bootstrap', 'adoption', 'platform_events', 'webhooks', 'platform_remediation', 'cluster_nodes', 'cluster_update', 'cluster_update_hybrid', 'raft_api', 'config_api', 'push_surface', 'maschine', 'mcu_surface', 'launch_control_surface', 'transport', 'brain', 'drums', 'pipewire', 'audio_path', 'special_settings', 'audio_diagnostics', 'shopping', 'graceful_degradation', 'expression', 'dev_proxy', 'api_observatory', 'intelfx', 'ground_control_pro', 'nodes', 'branding', 'state_authority', 'state_authority_corrections', 'device_hero_images']
        route_load_failures = []

        for route_name in route_modules:
            try:
                route_module = __import__(f'app.routes.{route_name}', fromlist=['router'])
                if hasattr(route_module, 'router') and route_module.router:
                    app.include_router(route_module.router)
                    logger.info(f"Registered route: {route_name}")
                elif _route_module_is_optional_unavailable(route_module):
                    logger.info(f"Optional route not registered: {route_name}")
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

        # T2482-P3.1: MIDI Services canonical authority routes
        # (/api/midi/bindings, GET/POST/PATCH/DELETE/disable/enable).
        # Per the four-services discipline these are the only public
        # entry points for MIDI binding CRUD post-Phase-3.
        try:
            from app.services.midi.routes import router as midi_services_router
            app.include_router(midi_services_router)
            logger.info("MIDI Services routes registered (T2482-P3.1)")
        except Exception as e:
            logger.warning(f"Failed to load MIDI Services routes: {e}")
        
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

        # Register Authority doctor routes (T2431-J)
        try:
            from app.routes import authority_doctor
            if authority_doctor.router:
                app.include_router(authority_doctor.router)
                logger.info("Authority doctor routes registered")
        except Exception as e:
            logger.warning(f"Failed to load authority doctor routes: {e}")

        # Register SSH trust routes
        try:
            from app.routes import ssh_trust
            if ssh_trust.router:
                app.include_router(ssh_trust.router)
                logger.info("SSH trust routes registered")
        except Exception as e:
            logger.warning(f"Failed to load SSH trust routes: {e}")

        # Register SSH bridge WebSocket route (T2419-B)
        try:
            from app.routes import ssh_bridge as ssh_bridge_routes
            if ssh_bridge_routes.router:
                app.include_router(ssh_bridge_routes.router)
                logger.info("SSH bridge WS route registered at /ws/ssh")
        except Exception as e:
            logger.warning(f"Failed to load SSH bridge route: {e}")
        
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

        # T2459 — Controller / Mapping / Device-Pack subsystem.
        # ProfileRegistry walks device-packs/ at startup; broken packs are
        # logged + skipped (must NOT block backend boot, per
        # docs/architecture/CONTROLLER_LAYER.md §3.2).
        try:
            from app.routes import devices as devices_routes
            from app.services.controllers import get_controller_service
            from app.services.controller_host_service import get_controller_host_service
            controller_service = get_controller_service()
            controller_service.start()
            app.include_router(devices_routes.router)
            logger.info("Controller / Device-Pack routes registered (T2459)")

            # Supervisor for the separate map2-controller-host process +
            # the Hardware Store connection event bus are started in the
            # async lifespan context (see the T2459 startup block in
            # `lifespan` above). `create_app` is a sync function, so the
            # `await` calls were a startup-blocking syntax error.
            #
            # Worklist: T2459-G15 (this fix).
        except Exception as e:
            logger.warning(f"Failed to load Controller / Device-Pack subsystem: {e}")

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

        install_contract_openapi(app)
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
