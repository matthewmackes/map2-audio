#!/usr/bin/env python3
"""
Test script for CPU Core Isolation and Configuration Interface Functionality
Tests both frontend functionality and backend API readiness.
"""

import os
import sys
import json
import asyncio
import subprocess
import time
import logging
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class CPUInterfaceTestRunner:
    """Test runner for CPU core configuration interface."""
    
    def __init__(self):
        self.project_root = project_root
        self.web_dir = self.project_root / 'web'
        self.test_results = {}
        
    async def test_backend_api_structure(self):
        """Test backend API structure and readiness."""
        logger.info("Testing backend API structure...")
        
        try:
            # Check if system.py exists and has the required imports
            system_routes_path = self.project_root / 'app' / 'routes' / 'system.py'
            
            if not system_routes_path.exists():
                self.test_results['backend_structure'] = {
                    'passed': False,
                    'error': 'system.py route file not found'
                }
                return
            
            # Read the system routes file
            with open(system_routes_path, 'r') as f:
                content = f.read()
            
            # Check for required patterns
            checks = {
                'router_defined': '@router' in content,
                'system_imports': 'import os' in content and 'import sys' in content,
                'fastapi_imports': 'from fastapi import' in content,
            }
            
            # Check for CPU-related endpoints (currently missing)
            cpu_endpoints = {
                'core_config_get': '/core-config' in content or 'core-assignments' in content,
                'core_config_post': 'core-assignments' in content and 'post' in content.lower(),
            }
            
            self.test_results['backend_structure'] = {
                'passed': all(checks.values()),
                'checks': checks,
                'cpu_endpoints': cpu_endpoints,
                'endpoints_implemented': any(cpu_endpoints.values())
            }
            
            logger.info(f"Backend structure checks: {checks}")
            logger.info(f"CPU endpoints implemented: {any(cpu_endpoints.values())}")
            
        except Exception as e:
            self.test_results['backend_structure'] = {
                'passed': False,
                'error': str(e)
            }
            logger.error(f"Backend structure test failed: {e}")
    
    async def test_frontend_components(self):
        """Test frontend component structure and functionality."""
        logger.info("Testing frontend component structure...")
        
        try:
            # Check if key components exist
            cpu_overview_path = self.web_dir / 'src' / 'app' / 'components' / 'CPUStatusOverview.tsx'
            core_manager_path = self.web_dir / 'src' / 'app' / 'components' / 'CoreAssignmentManager.tsx'
            
            components_exist = {
                'CPUStatusOverview': cpu_overview_path.exists(),
                'CoreAssignmentManager': core_manager_path.exists(),
            }
            
            # Analyze CPUStatusOverview component
            if cpu_overview_path.exists():
                with open(cpu_overview_path, 'r') as f:
                    content = f.read()
                
                component_features = {
                    'uses_react_query': 'useQuery' in content,
                    'has_mock_data': 'TODO: Replace with actual API call' in content,
                    'handles_core_editing': 'editingCoreId' in content,
                    'handles_priority_settings': 'SCHED_FIFO' in content or 'SCHED_RR' in content,
                    'handles_isolation': 'isolated' in content,
                    'has_utilization_display': 'utilization' in content,
                    'has_save_functionality': 'handleSaveCore' in content,
                }
            else:
                component_features = {}
            
            self.test_results['frontend_components'] = {
                'passed': all(components_exist.values()),
                'components_exist': components_exist,
                'features': component_features
            }
            
            logger.info(f"Components exist: {components_exist}")
            logger.info(f"Component features: {component_features}")
            
        except Exception as e:
            self.test_results['frontend_components'] = {
                'passed': False,
                'error': str(e)
            }
            logger.error(f"Frontend components test failed: {e}")
    
    async def test_mock_data_functionality(self):
        """Test that mock data is properly structured and functional."""
        logger.info("Testing mock data functionality...")
        
        try:
            cpu_overview_path = self.web_dir / 'src' / 'app' / 'components' / 'CPUStatusOverview.tsx'
            
            if not cpu_overview_path.exists():
                self.test_results['mock_data'] = {
                    'passed': False,
                    'error': 'CPUStatusOverview component not found'
                }
                return
            
            with open(cpu_overview_path, 'r') as f:
                content = f.read()
            
            # Check for proper mock data structure
            mock_data_checks = {
                'has_core_array': 'cores: [' in content,
                'has_core_ids': 'core_id:' in content,
                'has_services_array': 'services:' in content,
                'has_priority_field': 'priority:' in content,
                'has_isolated_field': 'isolated:' in content,
                'has_available_activities': 'available_activities:' in content,
                'has_cpu_count': 'cpu_count:' in content,
            }
            
            # Check for realistic mock data values
            realistic_data_checks = {
                'has_audio_engine': 'Audio Engine' in content,
                'has_dsp_graph': 'DSP Graph' in content,
                'has_realtime_priorities': 'SCHED_FIFO' in content or 'SCHED_RR' in content,
                'has_isolated_cores': 'isolated: true' in content,
            }
            
            self.test_results['mock_data'] = {
                'passed': all(mock_data_checks.values()),
                'structure_checks': mock_data_checks,
                'realism_checks': realistic_data_checks
            }
            
            logger.info(f"Mock data structure: {mock_data_checks}")
            logger.info(f"Mock data realism: {realistic_data_checks}")
            
        except Exception as e:
            self.test_results['mock_data'] = {
                'passed': False,
                'error': str(e)
            }
            logger.error(f"Mock data test failed: {e}")
    
    async def test_system_cpu_detection(self):
        """Test actual system CPU detection capabilities."""
        logger.info("Testing system CPU detection...")
        
        try:
            # Get actual CPU information
            cpu_info = {}
            
            # Get CPU count
            try:
                import multiprocessing
                cpu_info['logical_cores'] = multiprocessing.cpu_count()
            except:
                cpu_info['logical_cores'] = None
            
            # Get CPU model (Linux specific)
            try:
                with open('/proc/cpuinfo', 'r') as f:
                    cpuinfo = f.read()
                    for line in cpuinfo.split('\n'):
                        if line.startswith('model name'):
                            cpu_info['model'] = line.split(':')[1].strip()
                            break
            except:
                cpu_info['model'] = 'Unknown'
            
            # Check CPU governor (Linux specific)
            try:
                result = subprocess.run(['cat', '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor'], 
                                      capture_output=True, text=True)
                cpu_info['governor'] = result.stdout.strip() if result.returncode == 0 else 'Unknown'
            except:
                cpu_info['governor'] = 'Unknown'
            
            # Check for isolation capabilities
            try:
                result = subprocess.run(['cat', '/proc/cmdline'], capture_output=True, text=True)
                cmdline = result.stdout.strip() if result.returncode == 0 else ''
                cpu_info['isolation_support'] = 'isolcpus=' in cmdline
                cpu_info['cmdline'] = cmdline
            except:
                cpu_info['isolation_support'] = False
                cpu_info['cmdline'] = 'Unknown'
            
            self.test_results['system_cpu'] = {
                'passed': cpu_info['logical_cores'] is not None,
                'cpu_info': cpu_info,
                'suitable_for_realtime': cpu_info.get('logical_cores', 0) >= 4
            }
            
            logger.info(f"System CPU info: {cpu_info}")
            
        except Exception as e:
            self.test_results['system_cpu'] = {
                'passed': False,
                'error': str(e)
            }
            logger.error(f"System CPU detection test failed: {e}")
    
    async def test_frontend_build(self):
        """Test that the frontend builds successfully."""
        logger.info("Testing frontend build...")
        
        try:
            # Change to web directory and run build
            os.chdir(self.web_dir)
            
            # Check if package.json exists
            if not (self.web_dir / 'package.json').exists():
                self.test_results['frontend_build'] = {
                    'passed': False,
                    'error': 'package.json not found'
                }
                return
            
            # Check TypeScript compilation
            logger.info("Checking TypeScript compilation...")
            result = subprocess.run(['npx', 'tsc', '--noEmit'], 
                                  capture_output=True, text=True, timeout=60)
            
            typescript_ok = result.returncode == 0
            
            self.test_results['frontend_build'] = {
                'passed': typescript_ok,
                'typescript_check': typescript_ok,
                'typescript_output': result.stderr if result.stderr else 'No errors',
            }
            
            logger.info(f"TypeScript compilation: {'✓' if typescript_ok else '✗'}")
            if not typescript_ok:
                logger.error(f"TypeScript errors: {result.stderr}")
            
        except subprocess.TimeoutExpired:
            self.test_results['frontend_build'] = {
                'passed': False,
                'error': 'Build timeout'
            }
            logger.error("Frontend build test timed out")
        except Exception as e:
            self.test_results['frontend_build'] = {
                'passed': False,
                'error': str(e)
            }
            logger.error(f"Frontend build test failed: {e}")
        finally:
            # Change back to project root
            os.chdir(self.project_root)
    
    async def test_api_endpoint_requirements(self):
        """Test what API endpoints need to be implemented."""
        logger.info("Analyzing required API endpoints...")
        
        try:
            required_endpoints = {
                'GET /api/system/core-config': 'Get current core configuration',
                'POST /api/system/core-config': 'Update core configuration',
                'GET /api/system/cpu-info': 'Get system CPU information',
                'GET /api/system/realtime-capabilities': 'Check realtime support',
            }
            
            # Check what's currently commented out in the frontend
            cpu_overview_path = self.web_dir / 'src' / 'app' / 'components' / 'CPUStatusOverview.tsx'
            
            if cpu_overview_path.exists():
                with open(cpu_overview_path, 'r') as f:
                    content = f.read()
                
                # Extract API calls from comments
                api_calls_found = []
                for line in content.split('\n'):
                    if 'api/system' in line and '//' in line:
                        api_calls_found.append(line.strip())
            
            self.test_results['api_requirements'] = {
                'passed': True,  # This is informational
                'required_endpoints': required_endpoints,
                'commented_calls': api_calls_found if cpu_overview_path.exists() else [],
                'implementation_needed': True
            }
            
            logger.info(f"Required endpoints: {list(required_endpoints.keys())}")
            
        except Exception as e:
            self.test_results['api_requirements'] = {
                'passed': False,
                'error': str(e)
            }
            logger.error(f"API requirements test failed: {e}")
    
    def generate_report(self):
        """Generate a comprehensive test report."""
        logger.info("Generating test report...")
        
        report = {
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
            'summary': {
                'total_tests': len(self.test_results),
                'passed_tests': sum(1 for result in self.test_results.values() 
                                  if isinstance(result, dict) and result.get('passed', False)),
                'overall_status': 'PARTIAL' if any(result.get('passed', False) 
                                                 for result in self.test_results.values()) else 'FAILED'
            },
            'test_results': self.test_results,
            'recommendations': []
        }
        
        # Add recommendations based on test results
        if not self.test_results.get('backend_structure', {}).get('endpoints_implemented', False):
            report['recommendations'].append(
                "Implement backend CPU/core configuration API endpoints in app/routes/system.py"
            )
        
        if not self.test_results.get('frontend_build', {}).get('passed', False):
            report['recommendations'].append(
                "Fix TypeScript compilation errors in frontend components"
            )
        
        if not self.test_results.get('system_cpu', {}).get('suitable_for_realtime', False):
            report['recommendations'].append(
                "System may not be suitable for realtime audio processing (needs 4+ cores)"
            )
        
        return report
    
    async def run_all_tests(self):
        """Run all tests in sequence."""
        logger.info("Starting CPU Core Interface functionality tests...")
        
        test_functions = [
            self.test_backend_api_structure,
            self.test_frontend_components,
            self.test_mock_data_functionality,
            self.test_system_cpu_detection,
            self.test_frontend_build,
            self.test_api_endpoint_requirements,
        ]
        
        for test_func in test_functions:
            try:
                await test_func()
            except Exception as e:
                logger.error(f"Test {test_func.__name__} failed with error: {e}")
                self.test_results[test_func.__name__] = {
                    'passed': False,
                    'error': str(e)
                }
        
        return self.generate_report()

async def main():
    """Main test execution function."""
    runner = CPUInterfaceTestRunner()
    report = await runner.run_all_tests()
    
    # Print detailed report
    print("\n" + "="*80)
    print("CPU CORE INTERFACE FUNCTIONALITY TEST REPORT")
    print("="*80)
    
    print(f"\nTest Execution: {report['timestamp']}")
    print(f"Overall Status: {report['summary']['overall_status']}")
    print(f"Tests Passed: {report['summary']['passed_tests']}/{report['summary']['total_tests']}")
    
    print(f"\nDETAILED RESULTS:")
    print("-" * 40)
    
    for test_name, result in report['test_results'].items():
        status = "✓ PASS" if result.get('passed', False) else "✗ FAIL"
        print(f"{status:8} {test_name}")
        
        if 'error' in result:
            print(f"         Error: {result['error']}")
        
        # Print specific details for some tests
        if test_name == 'system_cpu' and 'cpu_info' in result:
            cpu_info = result['cpu_info']
            print(f"         CPU: {cpu_info.get('model', 'Unknown')}")
            print(f"         Cores: {cpu_info.get('logical_cores', 'Unknown')}")
            print(f"         Governor: {cpu_info.get('governor', 'Unknown')}")
            print(f"         Isolation Support: {cpu_info.get('isolation_support', False)}")
        
        if test_name == 'frontend_components' and 'features' in result:
            features = result['features']
            working_features = sum(1 for v in features.values() if v)
            print(f"         Features Working: {working_features}/{len(features)}")
    
    if report['recommendations']:
        print(f"\nRECOMMENDATIONS:")
        print("-" * 40)
        for i, rec in enumerate(report['recommendations'], 1):
            print(f"{i}. {rec}")
    
    print("\n" + "="*80)
    
    # Save report to file
    report_file = project_root / 'cpu_interface_test_report.json'
    with open(report_file, 'w') as f:
        json.dump(report, f, indent=2)
    
    logger.info(f"Detailed report saved to: {report_file}")
    
    return report['summary']['overall_status'] != 'FAILED'

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)