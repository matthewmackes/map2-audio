#!/usr/bin/env python3
"""
Comprehensive LCD Test Suite
Tests all LCD components: hardware, UI engine, input handling, integration

Run with: python3 -m lcd.test_suite
"""

import sys
import time
import logging
from typing import Dict, List
from dataclasses import dataclass

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


@dataclass
class TestResult:
    """Result of a test."""
    name: str
    passed: bool
    message: str
    duration: float = 0.0


class Colors:
    """Terminal colors."""
    RESET = '\033[0m'
    BOLD = '\033[1m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'


class LCDTestSuite:
    """Comprehensive test suite for LCD system."""
    
    def __init__(self, simulation_mode: bool = True):
        """Initialize test suite.
        
        Args:
            simulation_mode: Run without hardware
        """
        self.simulation_mode = simulation_mode
        self.results: List[TestResult] = []
    
    def run_all_tests(self) -> bool:
        """Run all tests.
        
        Returns:
            True if all tests passed
        """
        print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}MAP2 Audio LCD Test Suite{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")
        
        if self.simulation_mode:
            print(f"{Colors.YELLOW}Running in SIMULATION mode (no hardware){Colors.RESET}\n")
        
        # Component tests
        self._test_ui_engine()
        self._test_hardware_controller()
        self._test_input_handler()
        self._test_manager()
        
        # Integration tests
        self._test_page_transitions()
        self._test_data_updates()
        self._test_custom_characters()
        
        # Performance tests
        self._test_update_performance()
        
        # Demo mode
        if not self.simulation_mode:
            self._run_demo_mode()
        
        # Print summary
        self._print_summary()
        
        return all(r.passed for r in self.results)
    
    def _test_ui_engine(self):
        """Test UI engine component."""
        print(f"{Colors.BOLD}Testing UI Engine...{Colors.RESET}")
        
        try:
            from lcd.ui_engine import LCDUIEngine, DisplayConfig, PageType
            
            # Test 1: Initialization
            start = time.time()
            config = DisplayConfig(width=20, height=4)
            engine = LCDUIEngine(config)
            duration = time.time() - start
            
            self.results.append(TestResult(
                "UI Engine - Initialization",
                True,
                f"Engine created in {duration*1000:.1f}ms",
                duration
            ))
            
            # Test 2: Page creation
            start = time.time()
            for page_type in PageType:
                engine.set_page(page_type)
                lines = engine.update({})
                assert lines is not None, f"Page {page_type} returned None"
                assert len(lines) == 4, f"Page {page_type} wrong line count"
            duration = time.time() - start
            
            self.results.append(TestResult(
                "UI Engine - All Pages",
                True,
                f"All {len(PageType)} pages render correctly",
                duration
            ))
            
            # Test 3: Data updates
            start = time.time()
            test_data = {
                'sample_rate': 48000,
                'buffer_size': 256,
                'cpu_load': 45.5,
                'active_chain': 'Blues Lead',
                'input_level_l': 0.75,
                'input_level_r': 0.80,
            }
            engine.set_page(PageType.STATUS)
            lines = engine.update(test_data)
            duration = time.time() - start
            
            assert '48000' in ''.join(lines), "Sample rate not in output"
            assert '256' in ''.join(lines), "Buffer size not in output"
            
            self.results.append(TestResult(
                "UI Engine - Data Updates",
                True,
                "Data correctly reflected in output",
                duration
            ))
            
            print(f"  {Colors.GREEN}✓ UI Engine tests passed{Colors.RESET}")
            
        except Exception as e:
            self.results.append(TestResult(
                "UI Engine",
                False,
                f"Error: {e}",
                0
            ))
            print(f"  {Colors.RED}✗ UI Engine tests failed: {e}{Colors.RESET}")
    
    def _test_hardware_controller(self):
        """Test hardware controller component."""
        print(f"{Colors.BOLD}Testing Hardware Controller...{Colors.RESET}")
        
        try:
            from lcd.hardware_controller import I2CScanner, LCDHardwareController
            
            # Test 1: I2C Scanner (simulation)
            start = time.time()
            scanner = I2CScanner()
            # Don't actually scan in simulation mode
            duration = time.time() - start
            
            self.results.append(TestResult(
                "Hardware - I2C Scanner",
                True,
                "Scanner initialized",
                duration
            ))
            
            # Test 2: Controller initialization
            if not self.simulation_mode:
                try:
                    controller = LCDHardwareController(0x27, 1)
                    controller.clear()
                    controller.write_line(0, "Test")
                    
                    self.results.append(TestResult(
                        "Hardware - Display Control",
                        True,
                        "Display write successful",
                        0
                    ))
                except Exception as e:
                    self.results.append(TestResult(
                        "Hardware - Display Control",
                        False,
                        f"Hardware error: {e}",
                        0
                    ))
            else:
                self.results.append(TestResult(
                    "Hardware - Display Control",
                    True,
                    "Skipped (simulation mode)",
                    0
                ))
            
            print(f"  {Colors.GREEN}✓ Hardware Controller tests passed{Colors.RESET}")
            
        except Exception as e:
            self.results.append(TestResult(
                "Hardware Controller",
                False,
                f"Error: {e}",
                0
            ))
            print(f"  {Colors.RED}✗ Hardware Controller tests failed: {e}{Colors.RESET}")
    
    def _test_input_handler(self):
        """Test input handler component."""
        print(f"{Colors.BOLD}Testing Input Handler...{Colors.RESET}")
        
        try:
            from lcd.input_handler import InputManager, InputConfig, InputAction
            
            # Test 1: Manager initialization
            start = time.time()
            config = InputConfig()
            manager = InputManager(config)
            duration = time.time() - start
            
            self.results.append(TestResult(
                "Input - Manager Init",
                True,
                f"Manager created in {duration*1000:.1f}ms",
                duration
            ))
            
            # Test 2: Event registration
            start = time.time()
            events_received = []
            
            def handler(action):
                events_received.append(action)
            
            manager.register_handler(InputAction.UP, handler)
            manager.register_handler(InputAction.DOWN, handler)
            duration = time.time() - start
            
            self.results.append(TestResult(
                "Input - Event Registration",
                True,
                "Handlers registered successfully",
                duration
            ))
            
            # Test 3: Event simulation
            start = time.time()
            manager.start()
            manager.simulate_action(InputAction.UP)
            manager.simulate_action(InputAction.DOWN)
            time.sleep(0.1)  # Allow processing
            manager.stop()
            duration = time.time() - start
            
            if len(events_received) == 2:
                self.results.append(TestResult(
                    "Input - Event Simulation",
                    True,
                    f"Received {len(events_received)} events",
                    duration
                ))
            else:
                self.results.append(TestResult(
                    "Input - Event Simulation",
                    False,
                    f"Expected 2 events, got {len(events_received)}",
                    duration
                ))
            
            print(f"  {Colors.GREEN}✓ Input Handler tests passed{Colors.RESET}")
            
        except Exception as e:
            self.results.append(TestResult(
                "Input Handler",
                False,
                f"Error: {e}",
                0
            ))
            print(f"  {Colors.RED}✗ Input Handler tests failed: {e}{Colors.RESET}")
    
    def _test_manager(self):
        """Test integrated manager."""
        print(f"{Colors.BOLD}Testing Integrated Manager...{Colors.RESET}")
        
        try:
            from lcd.manager import IntegratedLCDManager, LCDSystemConfig
            
            # Test 1: Manager creation
            start = time.time()
            config = LCDSystemConfig(simulation_mode=True, auto_start=False)
            manager = IntegratedLCDManager(config)
            duration = time.time() - start
            
            self.results.append(TestResult(
                "Manager - Creation",
                True,
                f"Manager created in {duration*1000:.1f}ms",
                duration
            ))
            
            # Test 2: Start/stop
            start = time.time()
            manager.start()
            time.sleep(0.2)
            status = manager.get_status()
            manager.stop()
            duration = time.time() - start
            
            if status['running']:
                self.results.append(TestResult(
                    "Manager - Start/Stop",
                    True,
                    "Manager lifecycle works",
                    duration
                ))
            else:
                self.results.append(TestResult(
                    "Manager - Start/Stop",
                    False,
                    "Manager not running after start",
                    duration
                ))
            
            print(f"  {Colors.GREEN}✓ Manager tests passed{Colors.RESET}")
            
        except Exception as e:
            self.results.append(TestResult(
                "Manager",
                False,
                f"Error: {e}",
                0
            ))
            print(f"  {Colors.RED}✗ Manager tests failed: {e}{Colors.RESET}")
    
    def _test_page_transitions(self):
        """Test page transitions."""
        print(f"{Colors.BOLD}Testing Page Transitions...{Colors.RESET}")
        
        try:
            from lcd.manager import IntegratedLCDManager, LCDSystemConfig
            from lcd.ui_engine import PageType
            
            config = LCDSystemConfig(simulation_mode=True, auto_start=False)
            manager = IntegratedLCDManager(config)
            manager.start()
            
            # Test transitions
            start = time.time()
            pages = [PageType.STATUS, PageType.VU_METERS, PageType.CHAIN, PageType.MENU]
            
            for page in pages:
                manager.set_page(page)
                time.sleep(0.05)
            
            duration = time.time() - start
            manager.stop()
            
            status = manager.get_status()
            if status['statistics']['page_changes'] >= len(pages):
                self.results.append(TestResult(
                    "Integration - Page Transitions",
                    True,
                    f"{len(pages)} transitions in {duration*1000:.0f}ms",
                    duration
                ))
            else:
                self.results.append(TestResult(
                    "Integration - Page Transitions",
                    False,
                    f"Expected {len(pages)} transitions, got {status['statistics']['page_changes']}",
                    duration
                ))
            
            print(f"  {Colors.GREEN}✓ Page transition tests passed{Colors.RESET}")
            
        except Exception as e:
            self.results.append(TestResult(
                "Page Transitions",
                False,
                f"Error: {e}",
                0
            ))
            print(f"  {Colors.RED}✗ Page transition tests failed: {e}{Colors.RESET}")
    
    def _test_data_updates(self):
        """Test data update handling."""
        print(f"{Colors.BOLD}Testing Data Updates...{Colors.RESET}")
        
        try:
            from lcd.manager import IntegratedLCDManager, LCDSystemConfig
            
            # Create data provider
            test_data = {
                'cpu_load': 0.0,
                'input_level_l': 0.0,
                'input_level_r': 0.0,
            }
            
            def data_provider():
                test_data['cpu_load'] += 1.0
                test_data['input_level_l'] += 0.1
                test_data['input_level_r'] += 0.1
                return test_data
            
            config = LCDSystemConfig(
                simulation_mode=True,
                auto_start=False,
                update_interval=0.05
            )
            manager = IntegratedLCDManager(config, data_provider)
            
            start = time.time()
            manager.start()
            time.sleep(0.5)  # Let it update a few times
            status = manager.get_status()
            manager.stop()
            duration = time.time() - start
            
            updates = status['statistics']['updates']
            if updates >= 5:
                self.results.append(TestResult(
                    "Integration - Data Updates",
                    True,
                    f"{updates} updates in {duration:.1f}s",
                    duration
                ))
            else:
                self.results.append(TestResult(
                    "Integration - Data Updates",
                    False,
                    f"Only {updates} updates in {duration:.1f}s",
                    duration
                ))
            
            print(f"  {Colors.GREEN}✓ Data update tests passed{Colors.RESET}")
            
        except Exception as e:
            self.results.append(TestResult(
                "Data Updates",
                False,
                f"Error: {e}",
                0
            ))
            print(f"  {Colors.RED}✗ Data update tests failed: {e}{Colors.RESET}")
    
    def _test_custom_characters(self):
        """Test custom character definitions."""
        print(f"{Colors.BOLD}Testing Custom Characters...{Colors.RESET}")
        
        try:
            from lcd.ui_engine import CUSTOM_CHARS
            
            start = time.time()
            
            # Validate all custom characters
            for name, charmap in CUSTOM_CHARS.items():
                assert len(charmap) == 8, f"Character {name} wrong size"
                for row in charmap:
                    assert 0 <= row <= 0x1F, f"Character {name} invalid row"
            
            duration = time.time() - start
            
            self.results.append(TestResult(
                "Custom Characters",
                True,
                f"All {len(CUSTOM_CHARS)} characters valid",
                duration
            ))
            
            print(f"  {Colors.GREEN}✓ Custom character tests passed{Colors.RESET}")
            
        except Exception as e:
            self.results.append(TestResult(
                "Custom Characters",
                False,
                f"Error: {e}",
                0
            ))
            print(f"  {Colors.RED}✗ Custom character tests failed: {e}{Colors.RESET}")
    
    def _test_update_performance(self):
        """Test update performance."""
        print(f"{Colors.BOLD}Testing Update Performance...{Colors.RESET}")
        
        try:
            from lcd.ui_engine import LCDUIEngine, DisplayConfig, PageType
            
            config = DisplayConfig(width=20, height=4)
            engine = LCDUIEngine(config)
            
            # Warm up
            for _ in range(10):
                engine.update({})
            
            # Measure performance
            iterations = 1000
            start = time.time()
            
            for i in range(iterations):
                data = {
                    'cpu_load': i % 100,
                    'input_level_l': (i % 100) / 100.0,
                    'input_level_r': ((i + 50) % 100) / 100.0,
                }
                engine.update(data)
            
            duration = time.time() - start
            avg_time = (duration / iterations) * 1000  # ms
            
            # Should be under 1ms per update
            if avg_time < 1.0:
                self.results.append(TestResult(
                    "Performance - Update Speed",
                    True,
                    f"{avg_time:.3f}ms avg ({iterations/duration:.0f} updates/sec)",
                    duration
                ))
            else:
                self.results.append(TestResult(
                    "Performance - Update Speed",
                    False,
                    f"{avg_time:.3f}ms avg (too slow)",
                    duration
                ))
            
            print(f"  {Colors.GREEN}✓ Performance tests passed{Colors.RESET}")
            
        except Exception as e:
            self.results.append(TestResult(
                "Performance",
                False,
                f"Error: {e}",
                0
            ))
            print(f"  {Colors.RED}✗ Performance tests failed: {e}{Colors.RESET}")
    
    def _run_demo_mode(self):
        """Run interactive demo mode with hardware."""
        print(f"\n{Colors.BOLD}Demo Mode{Colors.RESET}")
        print("Running 30-second hardware demo...")
        
        try:
            from lcd.manager import create_lcd_system
            from lcd.ui_engine import PageType
            
            manager = create_lcd_system(simulation=False)
            
            pages = [
                PageType.STATUS,
                PageType.VU_METERS,
                PageType.CHAIN,
                PageType.PLUGINS,
                PageType.MIDI,
                PageType.PERF,
                PageType.MENU
            ]
            
            for page in pages:
                print(f"  Showing: {page.value}")
                manager.set_page(page)
                time.sleep(4)
            
            manager.stop()
            
            print(f"  {Colors.GREEN}✓ Demo completed{Colors.RESET}")
            
        except Exception as e:
            print(f"  {Colors.YELLOW}⚠ Demo failed: {e}{Colors.RESET}")
    
    def _print_summary(self):
        """Print test summary."""
        print(f"\n{Colors.BOLD}{'='*60}{Colors.RESET}")
        print(f"{Colors.BOLD}Test Summary{Colors.RESET}")
        print(f"{Colors.BOLD}{'='*60}{Colors.RESET}\n")
        
        passed = sum(1 for r in self.results if r.passed)
        failed = len(self.results) - passed
        
        for result in self.results:
            status = f"{Colors.GREEN}✓{Colors.RESET}" if result.passed else f"{Colors.RED}✗{Colors.RESET}"
            duration = f"({result.duration*1000:.1f}ms)" if result.duration > 0 else ""
            print(f"  {status} {result.name:.<40} {result.message} {duration}")
        
        print(f"\n{Colors.BOLD}Results:{Colors.RESET}")
        print(f"  Total: {len(self.results)}")
        print(f"  {Colors.GREEN}Passed: {passed}{Colors.RESET}")
        if failed > 0:
            print(f"  {Colors.RED}Failed: {failed}{Colors.RESET}")
        
        total_time = sum(r.duration for r in self.results)
        print(f"  Time: {total_time:.2f}s")
        
        if failed == 0:
            print(f"\n{Colors.BOLD}{Colors.GREEN}All tests PASSED! ✓{Colors.RESET}\n")
        else:
            print(f"\n{Colors.BOLD}{Colors.RED}Some tests FAILED ✗{Colors.RESET}\n")


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description='MAP2 Audio LCD Test Suite')
    parser.add_argument('--hardware', action='store_true',
                       help='Run with real hardware (default: simulation)')
    parser.add_argument('--demo', action='store_true',
                       help='Run demo mode only')
    
    args = parser.parse_args()
    
    suite = LCDTestSuite(simulation_mode=not args.hardware)
    
    if args.demo:
        if args.hardware:
            suite._run_demo_mode()
        else:
            print("Demo mode requires --hardware flag")
            sys.exit(1)
    else:
        success = suite.run_all_tests()
        sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
