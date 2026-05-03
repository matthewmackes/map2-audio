"""AVB/TSN route package aggregator."""

import sys
import types

from fastapi import APIRouter

from . import common, counters, discovery, metrics, routing
from .common import *
from .counters import *
from .discovery import *
from .metrics import *
from .routing import *

router = APIRouter(prefix="/api/avb", tags=["AVB/TSN"])
router.include_router(metrics.router)
router.include_router(routing.router)
router.include_router(discovery.router)
router.include_router(counters.router)

_child_modules = (common, counters, metrics, routing, discovery)


class _AvbRouteModule(types.ModuleType):
    def __setattr__(self, name, value):
        super().__setattr__(name, value)
        for module in _child_modules:
            if hasattr(module, name):
                setattr(module, name, value)


sys.modules[__name__].__class__ = _AvbRouteModule

__all__ = [
    name
    for name in globals()
    if not name.startswith("__")
    and name not in {"sys", "types", "common", "discovery", "metrics", "routing", "_child_modules"}
]
