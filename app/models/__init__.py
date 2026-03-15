"""
Compatibility package for shared Pydantic models.

Existing imports from `app.models` continue to work, and node-display-standard
schemas are exposed from `app.models.node`.
"""

from app.models_compat import *  # noqa: F401,F403
from .node import *  # noqa: F401,F403
