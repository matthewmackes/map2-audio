"""
Compatibility shim for legacy imports.

The canonical shared Pydantic models now live in `app.models_compat` and
`app.models.node`.
"""

from app.models_compat import *  # noqa: F401,F403
