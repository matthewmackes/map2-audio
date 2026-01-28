#!/usr/bin/env python3
"""
Debug TUI Launcher - Verbose logging to diagnose persistent errors
"""
import asyncio
import sys
import logging
from pathlib import Path

# Setup verbose logging BEFORE any imports
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.FileHandler('/tmp/tui_debug.log', mode='w'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

logger.info("=" * 80)
logger.info("DEBUG TUI LAUNCHER - Starting with verbose logging")
logger.info("=" * 80)

# Verify we're in the right directory
cwd = Path.cwd()
logger.info(f"Current working directory: {cwd}")

# Check if TUI directory exists
tui_dir = cwd / "tui"
if not tui_dir.exists():
    logger.error(f"TUI directory not found: {tui_dir}")
    sys.exit(1)

logger.info(f"TUI directory exists: {tui_dir}")

# Import API client and test connection first
logger.info("Importing API client...")
try:
    from tui.api_client import MAP2APIClient
    logger.info("✅ API client imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import API client: {e}")
    sys.exit(1)

async def test_api_connection():
    """Test API connection and data structure before launching TUI"""
    logger.info("\n" + "=" * 80)
    logger.info("TESTING API CONNECTION")
    logger.info("=" * 80)

    client = MAP2APIClient(base_url='http://localhost:8080')
    # Ensure client is properly initialized
    client._client = __import__('httpx').AsyncClient(base_url=client.base_url, timeout=client.timeout)

    # Test 1: Health check
    logger.info("\n[TEST 1] Health check...")
    try:
        response = await client._client.get("/api/health")
        logger.info(f"  Status: {response.status_code}")
        logger.info(f"  Response: {response.text}")
    except Exception as e:
        logger.error(f"  ❌ Health check failed: {e}")
        await client.close()
        return False

    # Test 2: List chains
    logger.info("\n[TEST 2] List chains...")
    try:
        result = await client.list_chains()
        logger.info(f"  Success: {result.success}")
        logger.info(f"  Data type: {type(result.data)}")
        logger.info(f"  Data: {result.data}")

        if result.success:
            data = result.data
            logger.info(f"  Is dict: {isinstance(data, dict)}")
            if isinstance(data, dict):
                chains = data.get("chains", [])
                logger.info(f"  Extracted chains: {chains}")
                logger.info(f"  Chain count: {len(chains)}")
            else:
                logger.warning(f"  ⚠️  Data is not dict, it's: {type(data)}")
    except Exception as e:
        logger.error(f"  ❌ List chains failed: {e}", exc_info=True)

    # Test 3: List plugins
    logger.info("\n[TEST 3] List plugins...")
    try:
        result = await client.list_plugins()
        logger.info(f"  Success: {result.success}")
        logger.info(f"  Data type: {type(result.data)}")
        logger.info(f"  Data: {result.data}")

        if result.success:
            data = result.data
            logger.info(f"  Is dict: {isinstance(data, dict)}")
            if isinstance(data, dict):
                plugins = data.get("loaded", [])
                logger.info(f"  Extracted plugins: {plugins}")
                logger.info(f"  Plugin count: {len(plugins)}")
    except Exception as e:
        logger.error(f"  ❌ List plugins failed: {e}", exc_info=True)

    # Test 4: Audio status
    logger.info("\n[TEST 4] Audio status...")
    try:
        result = await client.get_audio_status()
        logger.info(f"  Success: {result.success}")
        logger.info(f"  Data: {result.data}")
    except Exception as e:
        logger.error(f"  ❌ Audio status failed: {e}", exc_info=True)

    # Test 5: MIDI mappings
    logger.info("\n[TEST 5] MIDI mappings...")
    try:
        result = await client.list_midi_mappings()
        logger.info(f"  Success: {result.success}")
        logger.info(f"  Data type: {type(result.data)}")
        logger.info(f"  Data: {result.data}")

        if result.success:
            data = result.data
            logger.info(f"  Is dict: {isinstance(data, dict)}")
            if isinstance(data, dict):
                mappings = data.get("mappings", [])
                logger.info(f"  Extracted mappings: {mappings}")
                logger.info(f"  Mapping count: {len(mappings)}")
    except Exception as e:
        logger.error(f"  ❌ MIDI mappings failed: {e}", exc_info=True)

    await client.close()
    logger.info("\n" + "=" * 80)
    logger.info("API CONNECTION TESTS COMPLETE")
    logger.info("=" * 80 + "\n")
    return True

# Run API tests
logger.info("Running pre-flight API tests...")
try:
    connection_ok = asyncio.run(test_api_connection())
    if not connection_ok:
        logger.error("API connection tests failed - cannot launch TUI")
        sys.exit(1)
except Exception as e:
    logger.error(f"Failed to run API tests: {e}", exc_info=True)
    sys.exit(1)

# Now import and launch the actual TUI
logger.info("\n" + "=" * 80)
logger.info("LAUNCHING ACTUAL TUI")
logger.info("=" * 80 + "\n")

try:
    logger.info("Importing TUI app...")
    from tui.app import MAP2AudioTUI
    logger.info("✅ TUI app imported successfully")

    logger.info("Creating TUI instance...")
    app = MAP2AudioTUI()
    logger.info("✅ TUI instance created")

    logger.info("Running TUI app...")
    app.run()

except ImportError as e:
    logger.error(f"❌ Failed to import TUI app: {e}", exc_info=True)
    sys.exit(1)
except Exception as e:
    logger.error(f"❌ TUI crashed: {e}", exc_info=True)
    sys.exit(1)
finally:
    logger.info("\n" + "=" * 80)
    logger.info("TUI SHUTDOWN")
    logger.info("=" * 80)
    logger.info("Debug log saved to: /tmp/tui_debug.log")
