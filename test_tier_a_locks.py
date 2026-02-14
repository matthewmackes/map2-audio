#!/usr/bin/env python3
"""Test script for Tier A locked settings implementation"""

import sys
import os
sys.path.insert(0, '/home/mm/map2-audio')

def test_config_locking():
    """Test that config locking system works correctly"""
    from app.config import CONFIG_SCHEMA
    
    print("=" * 60)
    print("TIER A LOCKED SETTINGS VERIFICATION")
    print("=" * 60)
    
    # Check locked settings
    locked_settings = []
    unlocked_settings = []
    
    for key, option in CONFIG_SCHEMA.items():
        if option.locked:
            locked_settings.append(key)
        else:
            unlocked_settings.append(key)
    
    print(f"\n🔒 LOCKED Settings (Tier A Performance):")
    for key in sorted(locked_settings):
        option = CONFIG_SCHEMA[key]
        print(f"  • {key:30s} = {option.default} (restart_required={option.restart_required})")
    
    print(f"\n✅ Unlocked Settings: {len(unlocked_settings)} settings")
    print(f"🔒 Locked Settings: {len(locked_settings)} settings")
    
    # Verify critical settings are locked
    critical = ['audio.sample_rate', 'audio.buffer_size', 'audio.backend']
    all_locked = all(CONFIG_SCHEMA[k].locked for k in critical)
    
    if all_locked:
        print(f"\n✅ All critical performance settings are LOCKED")
    else:
        print(f"\n❌ ERROR: Not all critical settings are locked!")
    assert all_locked

if __name__ == '__main__':
    try:
        test_config_locking()
        sys.exit(0)
    except AssertionError:
        sys.exit(1)
