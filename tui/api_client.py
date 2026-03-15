"""Compatibility facade that re-exports the domain-based TUI API client."""

from .api import APIResult, MAP2APIClient, get_api_client

__all__ = ["APIResult", "MAP2APIClient", "get_api_client"]
