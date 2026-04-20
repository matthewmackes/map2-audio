"""Snapshot service package aggregator."""

import sys
import types

from . import common, snapshot_editor, snapshot_persistence, snapshot_runtime
from .common import *
from .snapshot_editor import *
from .snapshot_persistence import *
from .snapshot_runtime import *


class SnapshotService(SnapshotRuntimeMixin, SnapshotEditorMixin, SnapshotPersistenceMixin):
    pass


_child_modules = (common, snapshot_runtime, snapshot_editor, snapshot_persistence)


class _SnapshotServiceModule(types.ModuleType):
    def __setattr__(self, name, value):
        super().__setattr__(name, value)
        for module in _child_modules:
            if hasattr(module, name):
                setattr(module, name, value)


sys.modules[__name__].__class__ = _SnapshotServiceModule

__all__ = [
    name
    for name in globals()
    if not name.startswith("__")
    and name not in {"sys", "types", "common", "snapshot_editor", "snapshot_persistence", "snapshot_runtime", "_child_modules"}
]
