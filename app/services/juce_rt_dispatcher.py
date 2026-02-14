"""
JUCE Real-Time Parameter Dispatcher

Maps RT bridge (plugin_uri, param_index, value) calls to
plugin-specific engine setter methods.

Loads parameter definitions from juce_processors.json and builds
a dispatch table: {uri: {index: method_name}}.
"""

import json
import logging
import asyncio
from pathlib import Path
from typing import Dict, Optional, Callable, Any

logger = logging.getLogger(__name__)

# URI → engine method slug (last URI segment except where it differs)
_URI_SLUG_OVERRIDES = {
    "map2://juce/reverb/pcm70": "lexilove",
}


class JuceRTDispatcher:
    """Dispatches RT parameter updates to JUCE engine setter methods."""

    def __init__(self):
        # {uri: {param_index: param_symbol}}
        self._dispatch_table: Dict[str, Dict[int, str]] = {}
        # {uri: slug}
        self._uri_slugs: Dict[str, str] = {}
        self._engine = None
        self._loaded = False

    def load(self, json_path: Optional[str] = None):
        """Load parameter definitions from juce_processors.json."""
        if json_path is None:
            json_path = str(
                Path(__file__).parent.parent / "deployment" / "juce_processors.json"
            )

        try:
            with open(json_path) as f:
                data = json.load(f)
        except Exception as e:
            logger.error(f"Failed to load juce_processors.json: {e}")
            return

        for proc in data.get("processors", []):
            uri = proc.get("uri", "")
            if not uri.startswith("map2://juce/"):
                continue

            params = proc.get("parameters", [])
            if not params:
                continue

            # Derive slug from URI or use override
            slug = _URI_SLUG_OVERRIDES.get(uri)
            if slug is None:
                # Last path segment: map2://juce/amp/peavey5150 → peavey5150
                slug = uri.rstrip("/").rsplit("/", 1)[-1]

            self._uri_slugs[uri] = slug
            self._dispatch_table[uri] = {}
            for idx, param in enumerate(params):
                symbol = param.get("symbol", "")
                if symbol:
                    self._dispatch_table[uri][idx] = symbol

        self._loaded = True
        logger.info(
            f"JUCE RT dispatcher loaded: {len(self._dispatch_table)} plugins, "
            f"{sum(len(v) for v in self._dispatch_table.values())} parameters"
        )

    def set_engine(self, engine):
        """Set the JUCE engine service reference."""
        self._engine = engine

    def dispatch(self, plugin_uri: str, param_index: int, value: float):
        """
        Dispatch an RT parameter update to the appropriate engine setter.

        Called from the RT bridge engine callback (must be non-blocking).
        """
        if not self._engine or not self._loaded:
            return

        params = self._dispatch_table.get(plugin_uri)
        if params is None:
            return

        symbol = params.get(param_index)
        if symbol is None:
            logger.debug(
                f"No parameter at index {param_index} for {plugin_uri}"
            )
            return

        slug = self._uri_slugs.get(plugin_uri)
        if slug is None:
            return

        method_name = f"set_{slug}_{symbol}"
        method = getattr(self._engine, method_name, None)
        if method is None:
            logger.debug(f"No engine method: {method_name}")
            return

        try:
            # Engine setters are async but we're called from sync context.
            # The underlying C++ calls are synchronous, so call the
            # coroutine function's inner logic directly via the engine object.
            if hasattr(self._engine, '_engine') and self._engine._engine:
                cpp_method_name = method_name  # same name on C++ binding
                cpp_method = getattr(self._engine._engine, cpp_method_name, None)
                if cpp_method:
                    cpp_method(value)
                    return

            # Fallback: schedule the async method
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(method(value))
            else:
                loop.run_until_complete(method(value))
        except Exception as e:
            logger.debug(f"RT dispatch error for {method_name}: {e}")

    def get_param_count(self, plugin_uri: str) -> int:
        """Get the number of parameters for a plugin URI."""
        params = self._dispatch_table.get(plugin_uri)
        return len(params) if params else 0

    def get_param_symbols(self, plugin_uri: str) -> list:
        """Get ordered list of parameter symbols for a plugin URI."""
        params = self._dispatch_table.get(plugin_uri, {})
        return [params.get(i, "") for i in range(max(params.keys()) + 1)] if params else []


# Global singleton
juce_rt_dispatcher = JuceRTDispatcher()
