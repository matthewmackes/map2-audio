"""
Preset Migration Route Handlers
API endpoints for preset schema versioning and migration.
"""

try:
    from fastapi import APIRouter, HTTPException, Query, UploadFile, File
    from typing import Dict, Any, List, Optional
    from pathlib import Path
    import json

    from app.services.preset_migration import (
        get_preset_manager,
        PresetMigrator,
        CURRENT_SCHEMA_VERSION,
    )

    router = APIRouter(prefix="/api/presets/migration", tags=["preset-migration"])

    @router.get("/version")
    async def get_current_version() -> Dict[str, Any]:
        """
        Get current preset schema version.

        Returns:
            Current schema version and migration info
        """
        return {
            "current_version": CURRENT_SCHEMA_VERSION,
            "supported_versions": ["1.0.0", "1.1.0", "1.2.0", "2.0.0"],
            "features": {
                "1.0.0": "Basic plugin parameters",
                "1.1.0": "Plugin bypass state",
                "1.2.0": "Structured MIDI mappings",
                "2.0.0": "Full chain metadata, audio settings, plugin health",
            }
        }

    @router.post("/detect")
    async def detect_preset_version(preset_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Detect the schema version of a preset.

        Args:
            preset_data: Preset data to analyze

        Returns:
            Detected version and migration info
        """
        migrator = PresetMigrator()
        version = migrator.detect_version(preset_data)
        needs_migration = migrator.needs_migration(preset_data)
        migration_info = migrator.get_migration_info(preset_data)

        return {
            "detected_version": version,
            "current_version": CURRENT_SCHEMA_VERSION,
            "needs_migration": needs_migration,
            "migration_steps": migration_info.get("migration_steps", [])
        }

    @router.post("/migrate")
    async def migrate_preset(
        preset_data: Dict[str, Any],
        target_version: str = Query(CURRENT_SCHEMA_VERSION),
        create_backup: bool = Query(True)
    ) -> Dict[str, Any]:
        """
        Migrate a preset to target schema version.

        Args:
            preset_data: Preset data to migrate
            target_version: Target schema version
            create_backup: Whether to create backup before migration

        Returns:
            Migrated preset and migration result
        """
        migrator = PresetMigrator()

        # Get original version for logging
        original_version = migrator.detect_version(preset_data)

        # Perform migration
        result = migrator.migrate(
            preset_data,
            target_version=target_version,
            preset_name="api_migration",
            create_backup=create_backup
        )

        if not result.success:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Migration failed",
                    "errors": result.errors,
                    "original_version": result.original_version,
                    "steps_applied": result.steps_applied
                }
            )

        return {
            "success": True,
            "original_version": original_version,
            "final_version": result.final_version,
            "steps_applied": result.steps_applied,
            "warnings": result.warnings,
            "backup_path": result.backup_path,
            "migrated_preset": preset_data
        }

    @router.post("/validate")
    async def validate_preset(
        preset_data: Dict[str, Any],
        version: str = Query(CURRENT_SCHEMA_VERSION)
    ) -> Dict[str, Any]:
        """
        Validate a preset against a schema version.

        Args:
            preset_data: Preset data to validate
            version: Schema version to validate against

        Returns:
            Validation result with any errors
        """
        migrator = PresetMigrator()
        errors = migrator.validate(preset_data, version)

        return {
            "valid": len(errors) == 0,
            "version": version,
            "errors": errors,
            "error_count": len(errors)
        }

    @router.get("/list")
    async def list_presets_with_versions() -> Dict[str, Any]:
        """
        List all presets with version information.

        Returns:
            List of presets with schema versions and migration status
        """
        try:
            manager = get_preset_manager()
            presets = manager.list_presets()

            return {
                "presets": presets,
                "count": len(presets),
                "needs_migration_count": sum(1 for p in presets if p.get("needs_migration", False)),
                "current_schema_version": CURRENT_SCHEMA_VERSION
            }
        except Exception as e:
            return {
                "presets": [],
                "count": 0,
                "error": str(e)
            }

    @router.post("/migrate-all")
    async def migrate_all_presets() -> Dict[str, Any]:
        """
        Migrate all presets to current schema version.

        Returns:
            Migration results for each preset
        """
        try:
            manager = get_preset_manager()
            results = manager.migrate_all_presets()

            success_count = sum(1 for r in results.values() if r.success)
            failed_count = len(results) - success_count

            return {
                "total": len(results),
                "success": success_count,
                "failed": failed_count,
                "results": {
                    name: {
                        "success": r.success,
                        "original_version": r.original_version,
                        "final_version": r.final_version,
                        "steps_applied": r.steps_applied,
                        "errors": r.errors
                    }
                    for name, r in results.items()
                }
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/create")
    async def create_preset(
        name: str = Query(..., min_length=1, max_length=256),
        description: str = Query(""),
        plugins: List[Dict[str, Any]] = []
    ) -> Dict[str, Any]:
        """
        Create a new preset with current schema version.

        Args:
            name: Preset name
            description: Preset description
            plugins: List of plugin configurations

        Returns:
            Created preset data
        """
        try:
            manager = get_preset_manager()
            preset = manager.create_new_preset(name, plugins)
            preset["chain"]["description"] = description

            return {
                "success": True,
                "preset": preset,
                "version": CURRENT_SCHEMA_VERSION
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

except ImportError as e:
    router = None
