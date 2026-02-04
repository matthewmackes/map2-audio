# NAM Library Organization - Quick Start

## 🚀 One-Minute Setup

### 1. Apply Database Migration
```bash
python3 migrate_nam_featured.py
```

### 2. Verify Installation
```bash
python3 test_nam_implementation.py
```

### 3. Start Application
```bash
./start_all_services.sh
```

## 📋 Quick API Reference

### Feature Top TONE3000 Amps (21 models)
```bash
curl -X POST http://localhost:8080/api/nam/refresh-featured
```

### List Featured Amps
```bash
curl -X GET http://localhost:8080/api/nam/featured?limit=21
```

### Preview Bulk Rename
```bash
curl -X POST http://localhost:8080/api/nam/bulk-rename/preview | jq .results
```

### Execute Bulk Rename
```bash
curl -X POST http://localhost:8080/api/nam/bulk-rename/execute | jq .results
```

## 📁 Key Files

| File | Purpose |
|------|---------|
| `app/services/featured_amps_manager.py` | Download & register featured amps |
| `app/services/nam_bulk_renamer.py` | Bulk rename with metadata enrichment |
| `app/routes/nam.py` | API endpoints |
| `app/database.py` | Database schema (updated) |
| `web/src/app/components/loaders/NAMManagerDialog.tsx` | UI updates |
| `migrate_nam_featured.py` | Database migration |
| `test_nam_implementation.py` | Verification test |

## 🎯 Key Features

✅ **Featured Amps**
- Automatically downloads top 7 amps from TONE3000
- 3 variants per amp = 21 featured models
- Displays in grid in NAM chooser
- One-click loading

✅ **Bulk Rename**
- Renames all NAM files to standardized format
- Enriches metadata from 3 sources
- Dry-run mode for preview
- Full audit logging

✅ **Safe Operations**
- Transactional database updates
- Hash-based deduplication
- Rollback on errors
- Permission handling

## 📊 Standardized Naming Format

```
{Brand}_{Model}_{Type}_[SOURCE-{id}].nam

Examples:
- Fender_Twin_Reverb_Clean_[TONE3000-2847].nam
- Marshall_JCM800_Lead_[GITHUB-marshall].nam
- Mesa_Dual_Rectifier_High_Gain_[USER].nam
```

## 🔍 Metadata Sources (Priority Order)

1. **Database** - Existing records
2. **GitHub** - Community NAM repository
3. **Filename** - Pattern analysis

## 📍 Important Directories

```
~/.local/share/map2/nam/
├── featured/              # Featured amps go here
├── audit_logs/           # Rename operation logs
└── ...existing nams...
```

## ⚠️ Before Running

- [ ] Database migration applied (`python3 migrate_nam_featured.py`)
- [ ] TONE3000 API key configured (optional)
- [ ] Sufficient disk space for downloads
- [ ] Write permissions on NAM directories

## 🆘 Troubleshooting

**Database column errors?**
```bash
python3 migrate_nam_featured.py
```

**TONE3000 not available?**
- Skip featured amps download
- Bulk rename still works with database/GitHub metadata

**Permission denied?**
```bash
chown -R $(whoami) ~/.local/share/map2/nam/
chmod -R u+w ~/.local/share/map2/nam/
```

## 📖 Full Documentation

See `NAM_LIBRARY_ORGANIZATION_GUIDE.md` for complete details.

---

**Status**: ✅ Ready to use
**Test Result**: All services verified and compiled
**Last Updated**: 2026-02-03
