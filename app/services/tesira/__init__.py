"""
Biamp Tesira Forte AVB integration service package.

Provides TTP (Tesira Text Protocol) control, metering, AVB stream registration,
PTP coordination, preset interlock, and auto-discovery for up to 5 Tesira Forte
AVB units.

Usage:
    from app.services.tesira import get_tesira_fleet, get_tesira_discovery
    fleet = get_tesira_fleet()
    await fleet.start()
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.tesira.tesira_fleet import TesiraFleet
    from app.services.tesira.discovery import TesiraDiscoveryService
    from app.services.tesira.tesira_metrics import TesiraMetricsStore
    from app.services.tesira.tesira_dsp_model import TesiraDspModel
    from app.services.tesira.layout_catalog import TesiraLayoutCatalogService
    from app.services.tesira.sagevue_client import SageVueClient
    from app.services.tesira.tesira_deploy_orchestrator import TesiraDeployOrchestrator
    from app.services.tesira.tesira_design_workspace import TesiraDesignWorkspaceService
    from app.services.tesira.tesira_design_compiler import TesiraDesignCompilerService

_tesira_fleet: "TesiraFleet | None" = None
_tesira_discovery: "TesiraDiscoveryService | None" = None
_tesira_metrics_store: "TesiraMetricsStore | None" = None
_tesira_dsp_model: "TesiraDspModel | None" = None
_tesira_layout_catalog: "TesiraLayoutCatalogService | None" = None
_tesira_sagevue_client: "SageVueClient | None" = None
_tesira_deploy_orchestrator: "TesiraDeployOrchestrator | None" = None
_tesira_design_workspace: "TesiraDesignWorkspaceService | None" = None
_tesira_design_compiler: "TesiraDesignCompilerService | None" = None


def get_tesira_fleet() -> "TesiraFleet":
    """Return the singleton TesiraFleet instance, creating it if needed."""
    global _tesira_fleet
    if _tesira_fleet is None:
        from app.services.tesira.tesira_fleet import TesiraFleet
        _tesira_fleet = TesiraFleet()
    return _tesira_fleet


def get_tesira_discovery() -> "TesiraDiscoveryService":
    """Return the singleton TesiraDiscoveryService instance."""
    global _tesira_discovery
    if _tesira_discovery is None:
        from app.services.tesira.discovery import TesiraDiscoveryService
        _tesira_discovery = TesiraDiscoveryService()
    return _tesira_discovery


def get_tesira_metrics_store() -> "TesiraMetricsStore":
    """Return singleton Tesira metering history store."""
    global _tesira_metrics_store
    if _tesira_metrics_store is None:
        from app.services.tesira.tesira_metrics import TesiraMetricsStore
        _tesira_metrics_store = TesiraMetricsStore()
    return _tesira_metrics_store


def get_tesira_dsp_model() -> "TesiraDspModel":
    """Return singleton Tesira DSP discovery/model service."""
    global _tesira_dsp_model
    if _tesira_dsp_model is None:
        from app.services.tesira.tesira_dsp_model import TesiraDspModel
        _tesira_dsp_model = TesiraDspModel()
    return _tesira_dsp_model


def get_tesira_layout_catalog() -> "TesiraLayoutCatalogService":
    """Return singleton Tesira layout catalog service."""
    global _tesira_layout_catalog
    if _tesira_layout_catalog is None:
        from app.services.tesira.layout_catalog import get_layout_catalog_service
        _tesira_layout_catalog = get_layout_catalog_service()
    return _tesira_layout_catalog


def get_tesira_sagevue_client() -> "SageVueClient":
    """Return singleton SageVue deployment client."""
    global _tesira_sagevue_client
    if _tesira_sagevue_client is None:
        from app.services.tesira.sagevue_client import get_sagevue_client
        _tesira_sagevue_client = get_sagevue_client()
    return _tesira_sagevue_client


def get_tesira_deploy_orchestrator() -> "TesiraDeployOrchestrator":
    """Return singleton Tesira deploy orchestrator."""
    global _tesira_deploy_orchestrator
    if _tesira_deploy_orchestrator is None:
        from app.services.tesira.tesira_deploy_orchestrator import get_tesira_deploy_orchestrator as _factory
        _tesira_deploy_orchestrator = _factory()
    return _tesira_deploy_orchestrator


def get_tesira_design_workspace() -> "TesiraDesignWorkspaceService":
    """Return singleton Tesira design workspace service."""
    global _tesira_design_workspace
    if _tesira_design_workspace is None:
        from app.services.tesira.tesira_design_workspace import get_tesira_design_workspace_service
        _tesira_design_workspace = get_tesira_design_workspace_service()
    return _tesira_design_workspace


def get_tesira_design_compiler() -> "TesiraDesignCompilerService":
    """Return singleton Tesira design compiler service."""
    global _tesira_design_compiler
    if _tesira_design_compiler is None:
        from app.services.tesira.tesira_design_compiler import get_tesira_design_compiler_service
        _tesira_design_compiler = get_tesira_design_compiler_service()
    return _tesira_design_compiler
