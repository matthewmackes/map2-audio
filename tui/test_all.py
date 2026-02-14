#!/usr/bin/env python3
"""
Comprehensive TUI Element Testing
Tests all components of the TUI without running the display
"""

import pytest
pytest.skip("tui/test_all.py is a standalone utility script, not a pytest module", allow_module_level=True)

import sys
import traceback
from typing import Callable, Tuple, List

class TestRunner:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []
    
    def add_test(self, name: str, test_fn: Callable) -> None:
        """Add a test"""
        self.tests.append((name, test_fn))
    
    def run_all(self) -> None:
        """Run all tests"""
        for name, test_fn in self.tests:
            try:
                test_fn()
                print(f"✅ {name}")
                self.passed += 1
            except Exception as e:
                print(f"❌ {name}: {str(e)[:100]}")
                self.failed += 1
    
    def report(self) -> None:
        """Print report"""
        print(f"\n{'='*80}")
        print(f"📊 RESULTS: {self.passed} passed, {self.failed} failed")
        print(f"{'='*80}")

runner = TestRunner()

# Test 1: Imports
print("🧪 TESTING IMPORTS")
print("-" * 80)

runner.add_test("Import textual", lambda: __import__('textual'))
runner.add_test("Import pydantic", lambda: __import__('pydantic'))
runner.add_test("Import aiohttp", lambda: __import__('aiohttp'))
runner.add_test("Import api_client", lambda: __import__('api_client'))
runner.add_test("Import DashboardScreen", lambda: __import__('screens.dashboard_screen', fromlist=['DashboardScreen']))
runner.add_test("Import ChainsManagerScreen", lambda: __import__('screens.chains_manager_screen', fromlist=['ChainsManagerScreen']))
runner.add_test("Import EffectsManagerScreen", lambda: __import__('screens.effects_manager_screen', fromlist=['EffectsManagerScreen']))
runner.add_test("Import MIDISessionsScreen", lambda: __import__('screens.midi_sessions_screen', fromlist=['MIDISessionsScreen']))
runner.add_test("Import WorkflowSettingsScreen", lambda: __import__('screens.workflow_settings_screen', fromlist=['WorkflowSettingsScreen']))
runner.add_test("Import SettingsScreen", lambda: __import__('screens.settings_screen', fromlist=['SettingsScreen']))
runner.add_test("Import DiagnosticsScreen", lambda: __import__('screens.diagnostics_screen', fromlist=['DiagnosticsScreen']))
runner.add_test("Import ClusterModeScreen", lambda: __import__('screens.cluster_mode_screen', fromlist=['ClusterModeScreen']))
runner.add_test("Import status_bar", lambda: __import__('status_bar'))
runner.add_test("Import config", lambda: __import__('config'))
runner.add_test("Import widgets", lambda: __import__('widgets'))

runner.run_all()

# Test 2: Screen instantiation
print("\n🧪 TESTING SCREEN INSTANTIATION")
print("-" * 80)

from api_client import MAP2APIClient
from screens.dashboard_screen import DashboardScreen
from screens.chains_manager_screen import ChainsManagerScreen
from screens.effects_manager_screen import EffectsManagerScreen
from screens.midi_sessions_screen import MIDISessionsScreen
from screens.workflow_settings_screen import WorkflowSettingsScreen
from screens.settings_screen import SettingsScreen
from screens.diagnostics_screen import DiagnosticsScreen
from screens.cluster_mode_screen import ClusterModeScreen

api_client = MAP2APIClient()

def test_dashboard():
    s = DashboardScreen(api_client, id="dashboard")
    assert s.api_client is not None

def test_chains():
    s = ChainsManagerScreen(api_client, id="chains-manager")
    assert s.api_client is not None

def test_effects():
    s = EffectsManagerScreen(api_client, id="effects-manager")
    assert s.api_client is not None

def test_midi():
    s = MIDISessionsScreen(api_client, id="midi-sessions")
    assert s.api_client is not None

def test_workflow():
    s = WorkflowSettingsScreen(api_client, id="workflow-settings")
    assert s.api_client is not None

def test_settings():
    s = SettingsScreen(api_client, id="settings")
    assert s.api_client is not None

def test_diagnostics():
    s = DiagnosticsScreen(api_client, id="diagnostics")
    assert s.api_client is not None

def test_cluster_mode():
    s = ClusterModeScreen(api_client, id="cluster-mode")
    assert s.api_client is not None

runner = TestRunner()
runner.add_test("DashboardScreen instantiation", test_dashboard)
runner.add_test("ChainsManagerScreen instantiation", test_chains)
runner.add_test("EffectsManagerScreen instantiation", test_effects)
runner.add_test("MIDISessionsScreen instantiation", test_midi)
runner.add_test("WorkflowSettingsScreen instantiation", test_workflow)
runner.add_test("SettingsScreen instantiation", test_settings)
runner.add_test("DiagnosticsScreen instantiation", test_diagnostics)
runner.add_test("ClusterModeScreen instantiation", test_cluster_mode)

runner.run_all()

# Test 3: Widget instantiation
print("\n🧪 TESTING WIDGET INSTANTIATION")
print("-" * 80)

from widgets import SidebarWidget, BreadcrumbWidget, ContextPanelWidget, EnhancedStatusBarWidget

def test_sidebar():
    w = SidebarWidget(api_client)
    assert w is not None

def test_breadcrumb():
    w = BreadcrumbWidget(api_client)
    assert w is not None

def test_context():
    w = ContextPanelWidget(api_client)
    assert w is not None

def test_status():
    w = EnhancedStatusBarWidget(api_client)
    assert w is not None

runner = TestRunner()
runner.add_test("SidebarWidget instantiation", test_sidebar)
runner.add_test("BreadcrumbWidget instantiation", test_breadcrumb)
runner.add_test("ContextPanelWidget instantiation", test_context)
runner.add_test("EnhancedStatusBarWidget instantiation", test_status)

runner.run_all()

# Test 4: App instantiation
print("\n🧪 TESTING APP INSTANTIATION")
print("-" * 80)

from app import MAP2AudioTUI

def test_app():
    app = MAP2AudioTUI()
    assert app is not None
    assert app.api_client is not None

runner = TestRunner()
runner.add_test("MAP2AudioTUI instantiation", test_app)
runner.run_all()

# Test 5: Configuration
print("\n🧪 TESTING CONFIGURATION")
print("-" * 80)

from config import config, KeyBindings

def test_config():
    assert config is not None
    assert hasattr(config, 'theme')

def test_keybindings():
    kb = KeyBindings()
    assert kb is not None

runner = TestRunner()
runner.add_test("Config loading", test_config)
runner.add_test("KeyBindings instantiation", test_keybindings)
runner.run_all()

print("\n" + "="*80)
print("✅ ALL TESTS COMPLETED")
print("="*80)
