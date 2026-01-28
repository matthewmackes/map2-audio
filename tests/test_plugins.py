#!/usr/bin/env python3
"""Test plugin loading from API"""
import asyncio
import sys
import json
sys.path.insert(0, '/home/mm/map2-audio')

from tui.api_client import MAP2APIClient

async def test_plugins():
    client = MAP2APIClient(base_url='http://localhost:8080')
    
    # Ensure client is initialized
    import httpx
    client._client = httpx.AsyncClient(base_url=client.base_url, timeout=client.timeout)
    
    try:
        # Test health
        print("Testing health...")
        response = await client._client.get("/api/health")
        print(f"Health: {response.status_code}")
        
        # Test plugins discover
        print("\nTesting /api/plugins/discover...")
        response = await client._client.get("/api/plugins/discover")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response keys: {data.keys()}")
            if 'plugins' in data:
                plugins = data['plugins']
                print(f"Total plugins: {len(plugins)}")
                if plugins:
                    print(f"\nFirst plugin:")
                    print(json.dumps(plugins[0], indent=2))
                    print(f"\nPlugin has keys: {plugins[0].keys()}")
            elif 'count' in data:
                print(f"Plugin count: {data['count']}")
        else:
            print(f"Error: {response.text}")
            
    finally:
        await client._client.aclose()

if __name__ == "__main__":
    asyncio.run(test_plugins())
