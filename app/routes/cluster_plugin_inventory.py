"""Cluster-wide plugin inventory routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.cluster.plugin_inventory_sync import (
    ClusterPlugin,
    get_cluster_plugin_inventory,
)

router = APIRouter(prefix="/api/cluster/plugins", tags=["Cluster Plugins"])


@router.get("/catalog")
async def get_cluster_plugin_catalog():
    try:
        inventory = get_cluster_plugin_inventory()
        catalog = await inventory.get_cluster_catalog()
        return {
            "count": len(catalog),
            "plugins": [plugin.__dict__ for plugin in catalog],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load catalog: {exc}")


@router.get("/common")
async def get_common_plugins():
    inventory = get_cluster_plugin_inventory()
    plugins = await inventory.get_common_plugins()
    return {"count": len(plugins), "plugins": [p.__dict__ for p in plugins]}


@router.get("/unique")
async def get_unique_plugins():
    inventory = get_cluster_plugin_inventory()
    unique = await inventory.get_unique_plugins()
    encoded = {node: [p.__dict__ for p in plist] for node, plist in unique.items()}
    return {"unique": encoded}

