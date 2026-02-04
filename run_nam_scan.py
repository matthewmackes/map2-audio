#!/usr/bin/env python3
"""
Direct script to run the NAM featured amps scan.
"""

import sys
import asyncio
from pathlib import Path

# Add app directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.services.featured_amps_manager import FeaturedAmpsManager
from app.database import Base, NAMModel, get_db, init_db
from app.services.nam_bulk_renamer import NAMBulkRenamer

async def main():
    """Run the NAM scan for featured amps."""
    print("=" * 70)
    print("MAP2 Audio - NAM Featured Amps Scan")
    print("=" * 70)
    
    # Initialize database
    print("\n[1/4] Initializing database...")
    try:
        init_db()
        print("      ✓ Database ready")
    except Exception as e:
        print(f"      ℹ Database already initialized")
    
    # Initialize Featured Amps Manager
    print("\n[2/4] Initializing Featured Amps Manager...")
    manager = FeaturedAmpsManager()
    print(f"      ✓ Manager initialized")
    print(f"      ✓ Featured directory: {manager.featured_dir}")
    print(f"      ✓ TONE3000 API configured: {manager.scraper.is_configured()}")
    
    # Scan NAM library
    print("\n[3/4] Scanning NAM library...")
    bulk_renamer = NAMBulkRenamer()
    files_info = await bulk_renamer.scan_library()
    print(f"      ✓ Found {len(files_info)} NAM files in library")
    
    # Download and register featured amps
    print("\n[4/4] Downloading featured top 3000 amps (this may take a few minutes)...")
    print("      Fetching top 7 amps from TONE3000...")
    
    try:
        result = await manager.refresh_featured_amps()
        
        print("\n" + "=" * 70)
        print("SCAN RESULTS")
        print("=" * 70)
        print(f"\n✅ Successfully registered featured NAM amps!")
        print(f"\n   Total NAM files in library: {len(files_info)}")
        print(f"   Featured amps registered: {result.get('featured_count', 0)}")
        print(f"   Successfully downloaded: {result.get('downloaded', 0)}")
        print(f"   Duplicates skipped: {result.get('duplicates', 0)}")
        print(f"   Errors: {result.get('errors', 0)}")
        
        if result.get('featured_amps'):
            print(f"\n   Featured Amps:")
            for amp in result['featured_amps'][:10]:
                print(f"      • {amp.get('brand', 'Unknown')} {amp.get('model', '')} - {amp.get('source_name', 'TONE3000')}")
        
        # Get featured models from database
        db = get_db()
        featured = db.query(NAMModel).filter_by(is_featured=True).count()
        print(f"\n   Featured models in database: {featured}")
        
    except Exception as e:
        print(f"\n❌ Error during featured amps refresh: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    print("\n" + "=" * 70)
    print("✅ NAM Scan Complete!")
    print("=" * 70)
    print("\nYou can now:")
    print("  • View featured amps via: GET /api/nam/featured")
    print("  • Preview bulk rename: POST /api/nam/bulk-rename/preview")
    print("  • Execute bulk rename: POST /api/nam/bulk-rename/execute")
    
    return 0

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
