# NAM Library Organization Implementation Guide

## Overview

This implementation provides a complete system for organizing and managing the NAM (Neural Amp Modeler) library in MAP2 Audio. It includes:

1. **Featured Top TONE3000 Amps** - Automatically discover and feature the 7 most popular amps with their top 3 variants
2. **NAM Chooser Integration** - Display featured amps prominently in the plugin UI
3. **Bulk Library Rename** - Systematically rename all NAM files to a standardized format with metadata enrichment

## Architecture

### Database Schema Updates

The `NAMModel` table has been enhanced with featured tracking columns:

```sql
ALTER TABLE nam_models ADD COLUMN is_featured BOOLEAN DEFAULT 0;
ALTER TABLE nam_models ADD COLUMN featured_position INTEGER DEFAULT NULL;
ALTER TABLE nam_models ADD COLUMN source_tone3000_id VARCHAR(255) DEFAULT NULL;
ALTER TABLE nam_models ADD COLUMN source_tone3000_name VARCHAR(255) DEFAULT NULL;
```

### New Services

1. **FeaturedAmpsManager** (`app/services/featured_amps_manager.py`)
   - Discovers top 7 amps from TONE3000
   - Fetches and downloads top 3 variants of each amp
   - Registers models as featured in database

2. **NAMBulkRenamer** (`app/services/nam_bulk_renamer.py`)
   - Scans entire NAM library
   - Enriches metadata from GitHub, TONE3000, and database
   - Generates standardized filenames
   - Provides dry-run and execution modes

### API Endpoints

#### Featured Amps Endpoints

**GET /api/nam/featured**
- List featured NAM models
- Query parameter: `limit` (default: 21, max: 100)
- Returns: Featured models sorted by featured_position

**POST /api/nam/refresh-featured**
- Fetch and download featured top 7 amps from TONE3000
- Clears previous featured models
- Downloads all 21 variants (7 amps × 3 variants)
- Returns: Download results with model info

#### Bulk Rename Endpoints

**POST /api/nam/bulk-rename/preview**
- Preview planned renames without making changes
- Scans library and enriches metadata
- Returns: Detailed report of planned renames
- Safe to run multiple times

**POST /api/nam/bulk-rename/execute**
- Execute the bulk rename operation
- Actually renames files and updates database
- Includes transactional safety with rollback
- Returns: Execution results with statistics

## Setup Instructions

### 1. Database Migration

Run the migration script to add featured columns:

```bash
python3 migrate_nam_featured.py
```

Output:
```
Executing: ALTER TABLE nam_models ADD COLUMN is_featured BOOLEAN DEFAULT 0
✓ Success
Executing: ALTER TABLE nam_models ADD COLUMN featured_position INTEGER DEFAULT NULL
✓ Success
Executing: ALTER TABLE nam_models ADD COLUMN source_tone3000_id VARCHAR(255) DEFAULT NULL
✓ Success
Executing: ALTER TABLE nam_models ADD COLUMN source_tone3000_name VARCHAR(255) DEFAULT NULL
✓ Success

✅ Migration complete!
```

### 2. Configure TONE3000 API

If you want to feature top amps from TONE3000:

1. Get API key from https://www.tone3000.com/api/v1/auth
2. Store in config: `~/.config/map2/tone3000.json`

Or set via API:
```bash
POST /api/tone3000/set-api-key
{
  "api_key": "your_tone3000_api_key"
}
```

### 3. Test the Implementation

```bash
python3 test_nam_implementation.py
```

Expected output:
```
============================================================
MAP2 Audio - Featured NAM Amps Test
============================================================

1. Initializing database...
   ✓ Database tables created/verified

2. Initializing Featured Amps Manager...
   ✓ Manager initialized
   ✓ Featured directory: /home/mm/.local/share/map2/nam/featured
   ✓ TONE3000 configured: True
   ✓ TONE3000 API is configured and ready!

3. Checking database for existing featured models...
   ✓ Found 0 existing featured models

4. Testing bulk rename service...
   ✓ Bulk Renamer initialized
   ✓ NAM directories to scan: 2

5. Scanning NAM library...
   ✓ Found N unique NAM files

✅ All systems verified and ready!
```

## Usage Workflows

### Workflow 1: Feature Top TONE3000 Amps

```bash
# Trigger featured amp download
curl -X POST http://localhost:8080/api/nam/refresh-featured

# Response:
{
  "status": "ok",
  "total_downloaded": 21,
  "featured_amps": [
    {
      "filename": "Fender_Twin_Reverb_Clean_[TONE3000-2847].nam",
      "amp_name": "Fender Twin Reverb",
      "variant_type": "Clean",
      "position": 0,
      "tone3000_id": "2847",
      "file_path": "/home/user/.local/share/map2/nam/featured/..."
    },
    ...
  ],
  "errors": []
}

# View featured models
curl -X GET http://localhost:8080/api/nam/featured?limit=21
```

### Workflow 2: Preview Bulk Rename

```bash
# Get preview of planned renames
curl -X POST http://localhost:8080/api/nam/bulk-rename/preview

# Response:
{
  "status": "ok",
  "operation": "dry_run",
  "results": {
    "total_files": 42,
    "renamed_count": 38,
    "skipped_count": 3,
    "failed_count": 1,
    "renamed_files": [
      {
        "original_name": "marshall_jcm800_lead",
        "new_name": "Marshall_JCM800_Lead_[GITHUB-marshall].nam",
        "file_size": 1234567
      },
      ...
    ],
    "skipped_files": [
      {
        "original_name": "mystery_amp",
        "reason": "No metadata found for meaningful rename"
      }
    ],
    "failed_files": [
      {
        "original_name": "vox_ac30",
        "error": "Target filename already exists"
      }
    ],
    "errors": [],
    "duration_seconds": 2.34
  }
}
```

### Workflow 3: Execute Bulk Rename

```bash
# Perform the actual rename
curl -X POST http://localhost:8080/api/nam/bulk-rename/execute

# Response: Same format as preview but with actual changes applied
```

## File Organization

### Featured Amps Directory
```
~/.local/share/map2/nam/featured/
├── Fender_Twin_Reverb_Clean_[TONE3000-2847].nam
├── Fender_Twin_Reverb_Chorus_[TONE3000-2848].nam
├── Marshall_JCM800_Lead_[TONE3000-3105].nam
├── ...
└── 21 total featured amps
```

### Standardized Naming Format

```
{Brand}_{Model}_{Type}_[SOURCE-{id}].nam
```

Examples:
- `Fender_Twin_Reverb_Clean_[TONE3000-2847].nam`
- `Marshall_JCM800_Lead_[GITHUB-marshall].nam`
- `Mesa_Dual_Rectifier_High_Gain_[USER].nam`

### Audit Logs

Stored in: `~/.local/share/map2/nam/audit_logs/`

Format:
```json
{
  "timestamp": "2026-02-03T12:34:56.789Z",
  "operation_type": "dry_run|execute",
  "result": {
    "total_files": 42,
    "renamed_count": 38,
    "skipped_count": 3,
    "failed_count": 1,
    "renamed_files": [...],
    "duration_seconds": 2.34
  }
}
```

## UI Integration

### NAMManagerDialog Updates

The NAM chooser dialog now displays:

1. **FEATURED TOP AMPS Section** (yellow star badge)
   - Grid layout with 3 columns
   - Shows 12 most-featured amps
   - One-click loading
   - Only appears when not searching

2. **Traditional Model List**
   - Organized by type (Amp, Pedal, Preamp, Other)
   - Search filtering
   - Upload support

Example UI:
```
🎸 Neural Amp Modeler               [X]

Search models... [Refresh] [Upload]

✓ Active: Fender_Twin_Reverb_Clean

⭐ FEATURED TOP AMPS
┌─────────────┬─────────────┬─────────────┐
│ Fender      │ Marshall    │ Mesa Boogie │
│ Twin Reverb │ JCM800      │ Dual Rect   │
│ Clean       │ Lead        │ High Gain   │
│ [Load]      │ [Load]      │ [Load]      │
└─────────────┴─────────────┴─────────────┘

─────────────────────────────────────

Amplifiers (14)
├─ Twin Reverb       1.2 MB  [Load]
├─ JCM800            0.9 MB  [Load]
└─ ...

Pedals & Drives (8)
├─ Tube Screamer     0.8 MB  [Load]
└─ ...
```

## Metadata Enrichment Logic

The bulk renamer enriches metadata using this priority:

1. **Database Records** (highest priority)
   - Looks up by file hash
   - Uses amp_name, amp_type, category

2. **GitHub NAM Repository**
   - Matches against community models
   - Uses category from folder structure
   - Uses author information

3. **Filename Analysis** (fallback)
   - Detects keywords for type
   - Extracts brand/model from parts

## Performance Considerations

- **Library Scan**: ~1 file/sec (depends on disk speed)
- **Metadata Enrichment**: ~0.5 file/sec (includes API queries)
- **Featured Download**: ~30 sec per amp (depends on network)
- **Bulk Rename**: ~0.2 file/sec (includes DB updates)

## Error Handling

All operations include:
- **Transactional Safety**: Database changes rolled back on errors
- **Duplicate Detection**: Hash-based deduplication
- **Path Validation**: Prevents filename conflicts
- **Audit Logging**: All changes logged with timestamps
- **Error Tracking**: Detailed error messages for troubleshooting

## Troubleshooting

### TONE3000 API Not Configured
```
⚠️ WARNING: TONE3000 API key not configured
   To use featured amps, set TONE3000 API key via:
   POST /api/tone3000/set-api-key with api_key parameter
```

**Solution**: Get API key from https://www.tone3000.com/api/v1/auth

### Database Column Errors
```
sqlite3.OperationalError: no such column: nam_models.is_featured
```

**Solution**: Run migration script:
```bash
python3 migrate_nam_featured.py
```

### Insufficient Metadata
Files with no matched metadata will have status:
- **Skipped**: If no metadata found and filename is unchanged
- **Renamed**: If any metadata enriched (database, GitHub, or patterns)

### Permission Errors
If rename fails due to permissions:
```
Error: Permission denied renaming file
```

**Solution**: Ensure file ownership:
```bash
chown -R user:user ~/.local/share/map2/nam/
chmod -R u+w ~/.local/share/map2/nam/
```

## Files Modified/Created

### Modified Files
- `app/database.py` - Added featured columns to NAMModel
- `app/routes/nam.py` - Added API endpoints
- `web/src/app/components/loaders/NAMManagerDialog.tsx` - Added featured section UI

### New Files
- `app/services/featured_amps_manager.py` - Featured amps discovery and download
- `app/services/nam_bulk_renamer.py` - Bulk rename service
- `migrate_nam_featured.py` - Database migration script
- `test_nam_implementation.py` - Test/verification script

## Next Steps

1. ✅ Database migration applied
2. ✅ Services implemented
3. ✅ API endpoints created
4. ✅ UI updated
5. **Run featured amps download**: `POST /api/nam/refresh-featured`
6. **Preview library renames**: `POST /api/nam/bulk-rename/preview`
7. **Execute renames**: `POST /api/nam/bulk-rename/execute` (optional)

