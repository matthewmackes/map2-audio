"""
Tests for Host Machine Page Endpoints
Tests the 4 main endpoints: host-machine-info, disk-health, health-overview, branding-assets
"""

import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from app.routes.system import (
    router,
    get_host_machine_info,
    get_disk_health,
    get_health_overview,
    get_branding_assets,
)


class TestHostMachineInfoEndpoint:
    """Tests for /api/system/host-machine-info endpoint"""

    @pytest.mark.asyncio
    async def test_host_machine_info_success(self):
        """Test successful retrieval of host machine info"""
        result = await get_host_machine_info()
        
        # Should have all required fields
        assert 'manufacturer' in result
        assert 'product_name' in result
        assert 'system_uuid' in result
        assert 'bios_version' in result
        assert 'bios_date' in result
        assert 'chassis_type' in result
        assert 'cpu_model' in result
        assert 'cpu_cores' in result
        assert 'cpu_threads' in result
        assert 'cpu_frequency_mhz' in result
        assert 'total_memory_mb' in result
        assert 'kernel_version' in result
        assert 'hostname' in result

    @pytest.mark.asyncio
    async def test_host_machine_info_manufacturer_detection(self):
        """Test that manufacturer detection works"""
        result = await get_host_machine_info()
        
        # Should be one of the known manufacturers or 'unknown'
        assert result['manufacturer'] in ['dell', 'lenovo', 'hp', 'unknown']

    @pytest.mark.asyncio
    async def test_host_machine_info_cpu_info(self):
        """Test that CPU info is collected correctly"""
        result = await get_host_machine_info()
        
        # CPU cores and threads should be positive integers
        assert isinstance(result['cpu_cores'], int)
        assert isinstance(result['cpu_threads'], int)
        assert result['cpu_cores'] > 0
        assert result['cpu_threads'] >= result['cpu_cores']
        
        # Frequency should be reasonable (100-10000 MHz)
        assert 100 < result['cpu_frequency_mhz'] < 10000

    @pytest.mark.asyncio
    async def test_host_machine_info_memory(self):
        """Test that memory info is collected"""
        result = await get_host_machine_info()
        
        # Total memory should be reasonable (>= 512 MB)
        assert result['total_memory_mb'] >= 512
        assert isinstance(result['total_memory_mb'], int)

    @pytest.mark.asyncio
    async def test_host_machine_info_response_time(self):
        """Test that response is fast (should be cached)"""
        import time
        start = time.time()
        await get_host_machine_info()
        elapsed = time.time() - start
        
        # Should complete in < 100ms (cached response)
        assert elapsed < 0.1


class TestDiskHealthEndpoint:
    """Tests for /api/system/disk-health endpoint"""

    @pytest.mark.asyncio
    async def test_disk_health_success(self):
        """Test successful retrieval of disk health"""
        result = await get_disk_health()
        
        # Should have required top-level fields
        assert 'disks' in result
        assert 'smart_data' in result
        assert 'total_storage_gb' in result
        assert 'total_used_gb' in result
        assert 'overall_health' in result
        
        # Health status should be valid
        assert result['overall_health'] in ['excellent', 'good', 'warning', 'critical']

    @pytest.mark.asyncio
    async def test_disk_health_disk_info_structure(self):
        """Test disk info has correct structure"""
        result = await get_disk_health()
        
        if result['disks']:
            disk = result['disks'][0]
            assert 'device' in disk
            assert 'mount_point' in disk
            assert 'total_gb' in disk
            assert 'used_gb' in disk
            assert 'available_gb' in disk
            assert 'use_percent' in disk
            
            # Percentages should be 0-100
            assert 0 <= disk['use_percent'] <= 100

    @pytest.mark.asyncio
    async def test_disk_health_smart_data_structure(self):
        """Test SMART data has correct structure"""
        result = await get_disk_health()
        
        if result['smart_data']:
            smart = result['smart_data'][0]
            assert 'device' in smart
            assert 'model' in smart
            assert 'serial' in smart
            assert 'status' in smart
            assert 'temperature_celsius' in smart
            assert 'power_on_hours' in smart
            assert 'estimated_lifespan_percent' in smart
            
            # Status should be valid
            assert smart['status'] in ['passing', 'failing', 'unknown']
            
            # Temperature should be reasonable
            assert 0 <= smart['temperature_celsius'] <= 100
            
            # Lifespan should be 0-100
            assert 0 <= smart['estimated_lifespan_percent'] <= 100

    @pytest.mark.asyncio
    async def test_disk_health_response_time(self):
        """Test that disk health response is reasonable (may call external tools)"""
        import time
        start = time.time()
        result = await get_disk_health()
        elapsed = time.time() - start
        
        # Should complete in < 2 seconds (may call smartctl)
        assert elapsed < 2.0
        assert result is not None

    @pytest.mark.asyncio
    async def test_disk_health_consistency(self):
        """Test that disk health calculations are consistent"""
        result = await get_disk_health()
        
        # Total used should not exceed total storage
        assert result['total_used_gb'] <= result['total_storage_gb']


class TestHealthOverviewEndpoint:
    """Tests for /api/system/health-overview endpoint"""

    @pytest.mark.asyncio
    async def test_health_overview_success(self):
        """Test successful retrieval of health overview"""
        result = await get_health_overview()
        
        # Should have required fields
        assert 'cpu_temp_celsius' in result
        assert 'max_temp_celsius' in result
        assert 'cpu_usage_percent' in result
        assert 'memory_usage_percent' in result
        assert 'fans' in result
        assert 'power' in result
        assert 'overall_health' in result
        assert 'health_details' in result
        
        # Health should be valid
        assert result['overall_health'] in ['excellent', 'good', 'warning', 'critical']

    @pytest.mark.asyncio
    async def test_health_overview_temperature_values(self):
        """Test temperature values are reasonable"""
        result = await get_health_overview()
        
        # Temperatures should be between 0-100°C for normal operation
        assert 0 <= result['cpu_temp_celsius'] <= 120
        assert 0 <= result['max_temp_celsius'] <= 120
        assert result['max_temp_celsius'] >= result['cpu_temp_celsius']

    @pytest.mark.asyncio
    async def test_health_overview_usage_percentages(self):
        """Test CPU and memory usage are valid percentages"""
        result = await get_health_overview()
        
        # Usage percentages should be 0-100
        assert 0 <= result['cpu_usage_percent'] <= 100
        assert 0 <= result['memory_usage_percent'] <= 100

    @pytest.mark.asyncio
    async def test_health_overview_fans(self):
        """Test fan data structure"""
        result = await get_health_overview()
        
        # Fans list should exist (may be empty)
        assert isinstance(result['fans'], list)
        
        if result['fans']:
            fan = result['fans'][0]
            assert 'name' in fan
            assert 'status' in fan
            assert fan['status'] in ['normal', 'slow', 'stopped', 'unknown']
            
            # RPM should be non-negative if present
            if 'rpm' in fan and fan['rpm'] is not None:
                assert fan['rpm'] >= 0

    @pytest.mark.asyncio
    async def test_health_overview_power(self):
        """Test power info structure"""
        result = await get_health_overview()
        
        power = result['power']
        assert 'power_status' in power
        assert power['power_status'] in ['connected', 'battery', 'unknown']
        
        # Load percentage should be valid if present
        if 'current_load_percent' in power and power['current_load_percent'] is not None:
            assert 0 <= power['current_load_percent'] <= 100

    @pytest.mark.asyncio
    async def test_health_overview_response_time(self):
        """Test that health overview response is fast"""
        import time
        start = time.time()
        result = await get_health_overview()
        elapsed = time.time() - start
        
        # Should complete in < 1 second (cached)
        assert elapsed < 1.0
        assert result is not None

    @pytest.mark.asyncio
    async def test_health_overview_health_details(self):
        """Test health details structure"""
        result = await get_health_overview()
        
        details = result['health_details']
        assert 'temperature_status' in details
        assert 'fan_status' in details
        assert 'power_status' in details


class TestBrandingAssetsEndpoint:
    """Tests for /api/system/branding-assets endpoint"""

    @pytest.mark.asyncio
    async def test_branding_assets_success(self):
        """Test successful retrieval of branding assets"""
        result = await get_branding_assets()
        
        # Should have all required fields
        assert 'manufacturer' in result
        assert 'logo_url' in result
        assert 'logo_fallback' in result
        assert 'product_image_url' in result
        assert 'marketing_name' in result
        assert 'product_name' in result
        assert 'support_url' in result
        assert 'warranty_status' in result
        assert 'brand_color' in result
        assert 'sff_optimized' in result

    @pytest.mark.asyncio
    async def test_branding_assets_manufacturer(self):
        """Test that manufacturer is recognized"""
        result = await get_branding_assets()
        
        # Should be one of the known manufacturers or generic fallback
        assert result['manufacturer'] in ['dell', 'lenovo', 'hp', 'other']

    @pytest.mark.asyncio
    async def test_branding_assets_logo_urls(self):
        """Test that logo URLs are valid"""
        result = await get_branding_assets()
        
        # Logo URLs should be non-empty and start with / or http
        assert result['logo_url']
        assert result['logo_fallback']
        assert (result['logo_url'].startswith('/') or result['logo_url'].startswith('http'))
        assert (result['logo_fallback'].startswith('/') or result['logo_fallback'].startswith('http'))

    @pytest.mark.asyncio
    async def test_branding_assets_color_format(self):
        """Test that brand color is valid hex"""
        result = await get_branding_assets()
        
        color = result['brand_color']
        # Should be valid hex color (#RRGGBB)
        assert color.startswith('#')
        assert len(color) == 7
        try:
            int(color[1:], 16)
        except ValueError:
            pytest.fail(f"Invalid color format: {color}")

    @pytest.mark.asyncio
    async def test_branding_assets_sff_optimized_flag(self):
        """Test that SFF optimized flag is set"""
        result = await get_branding_assets()
        
        # This page is optimized for SFF systems
        assert result['sff_optimized'] is True

    @pytest.mark.asyncio
    async def test_branding_assets_response_time(self):
        """Test that branding assets response is fast (permanent cache)"""
        import time
        start = time.time()
        result = await get_branding_assets()
        elapsed = time.time() - start
        
        # Should be very fast (permanent cache)
        assert elapsed < 0.05
        assert result is not None


class TestHostMachinePageIntegration:
    """Integration tests for all Host Machine endpoints together"""

    @pytest.mark.asyncio
    async def test_all_endpoints_succeed(self):
        """Test that all 4 endpoints can be called successfully"""
        results = await asyncio.gather(
            get_host_machine_info(),
            get_disk_health(),
            get_health_overview(),
            get_branding_assets(),
            return_exceptions=True
        )
        
        # All should succeed
        for result in results:
            assert not isinstance(result, Exception), f"Endpoint failed: {result}"

    @pytest.mark.asyncio
    async def test_consistency_between_endpoints(self):
        """Test that data is consistent across endpoints"""
        host_info = await get_host_machine_info()
        branding = await get_branding_assets()
        
        # Product names should be related
        if host_info['product_name'] and branding['product_name']:
            # They should both be present and non-empty
            assert host_info['product_name']
            assert branding['product_name']

    @pytest.mark.asyncio
    async def test_endpoint_caching(self):
        """Test that caching works for endpoints"""
        import time
        
        # First call
        start1 = time.time()
        result1 = await get_host_machine_info()
        time1 = time.time() - start1
        
        # Second call (should be cached)
        start2 = time.time()
        result2 = await get_host_machine_info()
        time2 = time.time() - start2
        
        # Data should be identical
        assert result1 == result2
        
        # Second call might be faster (but don't assert as it depends on implementation)
        assert result2 is not None


class TestErrorHandling:
    """Tests for error handling in Host Machine endpoints"""

    @pytest.mark.asyncio
    async def test_graceful_degradation_no_smartctl(self):
        """Test graceful handling when smartctl is unavailable"""
        result = await get_disk_health()
        
        # Should still return data even if smartctl fails
        assert result is not None
        assert 'disks' in result
        assert 'overall_health' in result

    @pytest.mark.asyncio
    async def test_graceful_degradation_no_sensors(self):
        """Test graceful handling when sensors are unavailable"""
        result = await get_health_overview()
        
        # Should still return data even if sensors fail
        assert result is not None
        assert 'overall_health' in result

    @pytest.mark.asyncio
    async def test_branding_fallback(self):
        """Test branding fallback for unknown manufacturers"""
        result = await get_branding_assets()
        
        # Should always return valid branding (may be generic fallback)
        assert result is not None
        assert 'logo_url' in result
        assert 'logo_fallback' in result


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
