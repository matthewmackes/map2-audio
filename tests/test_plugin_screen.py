#!/usr/bin/env python3
"""Simple test of plugin loader screen"""
import asyncio
import sys
sys.path.insert(0, '/home/mm/map2-audio')

from tui.api_client import MAP2APIClient
from tui.screens.plugin_loader import PluginLoaderScreen
from textual.app import ComposeResult, App
from textual.widgets import Static
from textual.containers import Container

class TestApp(App):
    """Test app for plugin loader screen"""
    
    def __init__(self):
        super().__init__()
        self.api_client = MAP2APIClient(base_url='http://localhost:8080')
    
    def compose(self) -> ComposeResult:
        yield PluginLoaderScreen(self.api_client, id="plugin-loader")

if __name__ == "__main__":
    app = TestApp()
    app.run()
