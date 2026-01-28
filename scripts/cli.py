"""
CLI Tool
Command-line interface for MAP2 platform management.
"""

import asyncio
import logging
import argparse

logger = logging.getLogger(__name__)


async def cmd_plugin_discover(_args):
    """Discover plugins."""
    from app.services.plugin_host_enhanced import EnhancedPluginHostService
    service = EnhancedPluginHostService()
    plugins = await service.discover()
    for p in plugins:
        print(f"  {p['name']} ({p['uri']})")


async def cmd_chain_list(_args):
    """List chains."""
    print("  (No chains)")


async def cmd_chain_create(args):
    """Create chain."""
    print(f"  Created: {args.name}")


async def cmd_midi_devices(_args):
    """List MIDI devices."""
    from app.services.midi_engine import MIDIEngineService
    service = MIDIEngineService()
    devices = await service.discover_devices()
    print("  Inputs:")
    for d in devices["inputs"]:
        print(f"    {d['name']}")
    print("  Outputs:")
    for d in devices["outputs"]:
        print(f"    {d['name']}")


async def cmd_audio_start(_args):
    """Start audio."""
    from app.services.audio_processor import AudioProcessorService
    service = AudioProcessorService()
    await service.start()
    print("  Audio started")


async def cmd_audio_stop(_args):
    """Stop audio."""
    from app.services.audio_processor import AudioProcessorService
    service = AudioProcessorService()
    await service.stop()
    print("  Audio stopped")


async def cmd_system_info(_args):
    """System information."""
    from app.config import ConfigManager
    config = ConfigManager()
    print(f"  App: {config.get('app.name')}")
    print(f"  Sample Rate: {config.get('audio.sample_rate')}Hz")
    print(f"  Buffer: {config.get('audio.buffer_size')} samples")


async def dispatch(args):
    """Dispatch command."""
    dispatch_map = {
        ("plugin", "discover"): cmd_plugin_discover,
        ("chain", "list"): cmd_chain_list,
        ("chain", "create"): cmd_chain_create,
        ("midi", "devices"): cmd_midi_devices,
        ("audio", "start"): cmd_audio_start,
        ("audio", "stop"): cmd_audio_stop,
        ("system", "info"): cmd_system_info,
    }
    
    key = (args.command, args.subcommand)
    if key in dispatch_map:
        await dispatch_map[key](args)
    else:
        print(f"Unknown command: {args.command} {args.subcommand}")


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="MAP2 Audio Platform CLI")
    parser.add_argument("command", choices=["plugin", "chain", "midi", "audio", "system"])
    parser.add_argument("subcommand", nargs="?", default="list")
    parser.add_argument("name", nargs="?")
    
    args = parser.parse_args()
    
    try:
        asyncio.run(dispatch(args))
    except KeyboardInterrupt:
        print("\nInterrupted")


if __name__ == "__main__":
    main()
