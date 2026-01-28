#!/usr/bin/env python3
"""
Complete End-to-End Test for CPU Core Configuration Interface
Tests the full functionality including API endpoints and frontend integration.
"""

import asyncio
import json
import time
import requests
from pathlib import Path

class CPUInterfaceEndToEndTest:
    """Complete end-to-end test for CPU core configuration interface."""
    
    def __init__(self):
        self.base_url = "http://localhost:8080"
        self.test_results = []
        
    def log_result(self, test_name, success, details=None):
        """Log a test result."""
        result = {
            'test': test_name,
            'success': success,
            'details': details or {},
            'timestamp': time.strftime('%H:%M:%S')
        }
        self.test_results.append(result)
        status = "✓" if success else "✗"
        print(f"{status} {test_name}")
        if details:
            for key, value in details.items():
                print(f"    {key}: {value}")
        print()
    
    def test_backend_endpoints(self):
        """Test all backend API endpoints."""
        print("Testing Backend API Endpoints")
        print("=" * 40)
        
        # Test GET /api/system/core-config
        try:
            response = requests.get(f"{self.base_url}/api/system/core-config", timeout=5)
            if response.status_code == 200:
                data = response.json()
                details = {
                    'cores_count': len(data.get('cores', [])),
                    'cpu_count': data.get('cpu_count', 0),
                    'has_activities': len(data.get('available_activities', [])) > 0
                }
                self.log_result("GET core-config", True, details)
            else:
                self.log_result("GET core-config", False, {'status_code': response.status_code})
        except Exception as e:
            self.log_result("GET core-config", False, {'error': str(e)})
        
        # Test GET /api/system/cpu-info
        try:
            response = requests.get(f"{self.base_url}/api/system/cpu-info", timeout=5)
            if response.status_code == 200:
                data = response.json()
                details = {
                    'logical_cores': data.get('logical_cores'),
                    'model': data.get('model', 'Unknown')[:50],
                    'realtime_capable': data.get('realtime_capable', False)
                }
                self.log_result("GET cpu-info", True, details)
            else:
                self.log_result("GET cpu-info", False, {'status_code': response.status_code})
        except Exception as e:
            self.log_result("GET cpu-info", False, {'error': str(e)})
        
        # Test GET /api/system/realtime-capabilities
        try:
            response = requests.get(f"{self.base_url}/api/system/realtime-capabilities", timeout=5)
            if response.status_code == 200:
                data = response.json()
                details = {
                    'overall_score': data.get('overall_score', 0),
                    'recommendations': len(data.get('recommendations', []))
                }
                self.log_result("GET realtime-capabilities", True, details)
            else:
                self.log_result("GET realtime-capabilities", False, {'status_code': response.status_code})
        except Exception as e:
            self.log_result("GET realtime-capabilities", False, {'error': str(e)})
        
        # Test POST /api/system/core-config (update configuration)
        try:
            test_config = {
                'core_id': 0,
                'services': ['UI / API', 'Background'],
                'priority': 'normal',
                'isolated': False
            }
            response = requests.post(
                f"{self.base_url}/api/system/core-config",
                json=test_config,
                timeout=5
            )
            if response.status_code == 200:
                data = response.json()
                details = {
                    'success': data.get('success', False),
                    'message': data.get('message', '')[:50]
                }
                self.log_result("POST core-config", True, details)
            else:
                self.log_result("POST core-config", False, {'status_code': response.status_code})
        except Exception as e:
            self.log_result("POST core-config", False, {'error': str(e)})
    
    def test_data_validation(self):
        """Test API data validation."""
        print("Testing API Data Validation")
        print("=" * 40)
        
        # Test invalid core_id
        try:
            invalid_config = {
                'core_id': 999,  # Invalid core ID
                'services': ['Test'],
                'priority': 'normal',
                'isolated': False
            }
            response = requests.post(
                f"{self.base_url}/api/system/core-config",
                json=invalid_config,
                timeout=5
            )
            success = response.status_code == 400  # Should return 400 for invalid input
            self.log_result("Invalid core_id validation", success, {
                'expected': '400 Bad Request',
                'got': f"{response.status_code} {response.reason}"
            })
        except Exception as e:
            self.log_result("Invalid core_id validation", False, {'error': str(e)})
        
        # Test invalid priority
        try:
            invalid_config = {
                'core_id': 0,
                'services': ['Test'],
                'priority': 'INVALID_PRIORITY',
                'isolated': False
            }
            response = requests.post(
                f"{self.base_url}/api/system/core-config",
                json=invalid_config,
                timeout=5
            )
            success = response.status_code == 400
            self.log_result("Invalid priority validation", success, {
                'expected': '400 Bad Request',
                'got': f"{response.status_code} {response.reason}"
            })
        except Exception as e:
            self.log_result("Invalid priority validation", False, {'error': str(e)})
        
        # Test too many services
        try:
            invalid_config = {
                'core_id': 0,
                'services': ['Service1', 'Service2', 'Service3', 'Service4'],  # Too many
                'priority': 'normal',
                'isolated': False
            }
            response = requests.post(
                f"{self.base_url}/api/system/core-config",
                json=invalid_config,
                timeout=5
            )
            success = response.status_code == 400
            self.log_result("Too many services validation", success, {
                'expected': '400 Bad Request',
                'got': f"{response.status_code} {response.reason}"
            })
        except Exception as e:
            self.log_result("Too many services validation", False, {'error': str(e)})
    
    def test_realistic_scenarios(self):
        """Test realistic CPU configuration scenarios."""
        print("Testing Realistic Configuration Scenarios")
        print("=" * 40)
        
        scenarios = [
            {
                'name': 'Audio Engine Configuration',
                'config': {
                    'core_id': 1,
                    'services': ['Audio Engine', 'MIDI / I/O'],
                    'priority': 'SCHED_FIFO',
                    'isolated': True
                }
            },
            {
                'name': 'DSP Processing Core',
                'config': {
                    'core_id': 2,
                    'services': ['DSP Graph'],
                    'priority': 'SCHED_FIFO',
                    'isolated': True
                }
            },
            {
                'name': 'Monitoring Core',
                'config': {
                    'core_id': 3,
                    'services': ['Meters / RT Monitoring'],
                    'priority': 'SCHED_RR',
                    'isolated': False
                }
            }
        ]
        
        for scenario in scenarios:
            try:
                response = requests.post(
                    f"{self.base_url}/api/system/core-config",
                    json=scenario['config'],
                    timeout=5
                )
                success = response.status_code == 200
                details = {}
                if success:
                    data = response.json()
                    details['applied'] = data.get('success', False)
                self.log_result(scenario['name'], success, details)
            except Exception as e:
                self.log_result(scenario['name'], False, {'error': str(e)})
    
    def test_frontend_integration(self):
        """Test frontend file structure and integration."""
        print("Testing Frontend Integration")
        print("=" * 40)
        
        project_root = Path("/home/mm/map2-audio")
        
        # Check if frontend components exist
        cpu_overview_path = project_root / "web/src/app/components/CPUStatusOverview.tsx"
        core_manager_path = project_root / "web/src/app/components/CoreAssignmentManager.tsx"
        
        self.log_result("CPUStatusOverview component exists", cpu_overview_path.exists())
        self.log_result("CoreAssignmentManager component exists", core_manager_path.exists())
        
        # Check if API integration is complete
        if cpu_overview_path.exists():
            with open(cpu_overview_path, 'r') as f:
                content = f.read()
            
            has_actual_api = '/api/system/core-config' in content and 'TODO: Replace with actual API call' not in content
            has_error_handling = 'catch' in content and 'error' in content.lower()
            has_save_function = 'handleSaveCore' in content
            
            self.log_result("API integration complete", has_actual_api, {
                'uses_real_api': has_actual_api,
                'has_error_handling': has_error_handling,
                'has_save_function': has_save_function
            })
    
    def generate_summary(self):
        """Generate a comprehensive test summary."""
        print("=" * 60)
        print("CPU CORE INTERFACE TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result['success'])
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
        print()
        
        # Group results by category
        categories = {}
        for result in self.test_results:
            test_name = result['test']
            if 'GET' in test_name or 'POST' in test_name:
                category = 'API Endpoints'
            elif 'validation' in test_name.lower():
                category = 'Data Validation'
            elif 'component' in test_name.lower() or 'integration' in test_name.lower():
                category = 'Frontend Integration'
            else:
                category = 'Configuration Scenarios'
            
            if category not in categories:
                categories[category] = []
            categories[category].append(result)
        
        for category, results in categories.items():
            print(f"{category}:")
            for result in results:
                status = "✓" if result['success'] else "✗"
                print(f"  {status} {result['test']}")
            print()
        
        # Provide recommendations
        failed_tests = [r for r in self.test_results if not r['success']]
        if failed_tests:
            print("RECOMMENDATIONS:")
            print("-" * 20)
            for result in failed_tests:
                test_name = result['test']
                if 'GET' in test_name or 'POST' in test_name:
                    print(f"• Fix API endpoint: {test_name}")
                elif 'validation' in test_name.lower():
                    print(f"• Implement proper validation: {test_name}")
                elif 'component' in test_name.lower():
                    print(f"• Check frontend component: {test_name}")
        else:
            print("✓ ALL TESTS PASSED - CPU Core Interface is fully functional!")
        
        print("\n" + "=" * 60)
        
        return passed_tests == total_tests
    
    def run_complete_test(self):
        """Run all tests."""
        print("Starting Complete CPU Core Interface Test")
        print("=" * 60)
        print()
        
        try:
            self.test_backend_endpoints()
            self.test_data_validation()
            self.test_realistic_scenarios()
            self.test_frontend_integration()
            
            return self.generate_summary()
            
        except Exception as e:
            print(f"Test suite failed with error: {e}")
            return False

def main():
    """Main test execution."""
    tester = CPUInterfaceEndToEndTest()
    success = tester.run_complete_test()
    
    # Save results to file
    results_file = Path("/home/mm/map2-audio/cpu_interface_e2e_results.json")
    with open(results_file, 'w') as f:
        json.dump({
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
            'success': success,
            'results': tester.test_results
        }, f, indent=2)
    
    print(f"Detailed results saved to: {results_file}")
    
    return 0 if success else 1

if __name__ == "__main__":
    exit(main())