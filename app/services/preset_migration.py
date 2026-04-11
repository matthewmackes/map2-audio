"""
Preset Schema Versioning and Migration System

Provides forward and backward compatibility for presets:
- Schema versioning
- Automatic migration on load
- Migration registry
- Rollback support
- Validation
"""

import logging
import json
import copy
from typing import Dict, List, Any, Optional, Callable, Tuple
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime, timezone
import hashlib

logger = logging.getLogger(__name__)


# Current schema version
CURRENT_SCHEMA_VERSION = "2.0.0"


@dataclass
class MigrationStep:
    """A single migration step."""
    from_version: str
    to_version: str
    description: str
    migrate_func: Callable[[Dict[str, Any]], Dict[str, Any]]
    rollback_func: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None


@dataclass
class MigrationResult:
    """Result of a migration operation."""
    success: bool
    original_version: str
    final_version: str
    steps_applied: List[str]
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    backup_path: Optional[str] = None


class PresetMigrationRegistry:
    """Registry of all preset migrations."""

    def __init__(self):
        self._migrations: Dict[str, MigrationStep] = {}
        self._version_order: List[str] = []
        self._register_builtin_migrations()

    def register(self, migration: MigrationStep) -> None:
        """Register a migration step."""
        key = f"{migration.from_version}->{migration.to_version}"
        self._migrations[key] = migration

        # Update version order
        for version in [migration.from_version, migration.to_version]:
            if version not in self._version_order:
                self._version_order.append(version)

        # Sort versions
        self._version_order.sort(key=self._version_key)

    def _version_key(self, version: str) -> Tuple[int, ...]:
        """Convert version string to comparable tuple."""
        try:
            parts = version.split('.')
            return tuple(int(p) for p in parts)
        except ValueError:
            return (0, 0, 0)

    def get_migration_path(self, from_version: str, to_version: str) -> List[MigrationStep]:
        """Get sequence of migrations to go from one version to another."""
        if from_version == to_version:
            return []

        path = []
        current = from_version

        # Find all versions between from and to
        try:
            from_idx = self._version_order.index(from_version)
            to_idx = self._version_order.index(to_version)
        except ValueError:
            logger.warning(f"Unknown version in migration path: {from_version} or {to_version}")
            return []

        if from_idx < to_idx:
            # Forward migration
            for i in range(from_idx, to_idx):
                key = f"{self._version_order[i]}->{self._version_order[i+1]}"
                if key in self._migrations:
                    path.append(self._migrations[key])
                    current = self._version_order[i+1]
        else:
            # Backward migration (rollback)
            for i in range(from_idx, to_idx, -1):
                key = f"{self._version_order[i-1]}->{self._version_order[i]}"
                if key in self._migrations and self._migrations[key].rollback_func:
                    # Create reverse migration
                    original = self._migrations[key]
                    reverse = MigrationStep(
                        from_version=original.to_version,
                        to_version=original.from_version,
                        description=f"Rollback: {original.description}",
                        migrate_func=original.rollback_func,
                    )
                    path.append(reverse)
                    current = self._version_order[i-1]

        return path

    def _register_builtin_migrations(self) -> None:
        """Register built-in migrations."""

        # 1.0.0 -> 1.1.0: Add plugin bypass state
        def migrate_1_0_to_1_1(data: Dict[str, Any]) -> Dict[str, Any]:
            data = copy.deepcopy(data)

            # Add bypass state to each plugin in chain
            if 'plugins' in data:
                for plugin in data['plugins']:
                    if 'is_bypassed' not in plugin:
                        plugin['is_bypassed'] = False

            # Add metadata if missing
            if 'metadata' not in data:
                data['metadata'] = {}
            data['metadata']['migrated_at'] = datetime.now(timezone.utc).isoformat()

            return data

        def rollback_1_1_to_1_0(data: Dict[str, Any]) -> Dict[str, Any]:
            data = copy.deepcopy(data)

            if 'plugins' in data:
                for plugin in data['plugins']:
                    plugin.pop('is_bypassed', None)

            return data

        self.register(MigrationStep(
            from_version="1.0.0",
            to_version="1.1.0",
            description="Add plugin bypass state",
            migrate_func=migrate_1_0_to_1_1,
            rollback_func=rollback_1_1_to_1_0,
        ))

        # 1.1.0 -> 1.2.0: Add MIDI mappings structure
        def migrate_1_1_to_1_2(data: Dict[str, Any]) -> Dict[str, Any]:
            data = copy.deepcopy(data)

            if 'midi_mappings' not in data:
                data['midi_mappings'] = []

            # Migrate old-style MIDI CC to new format
            if 'plugins' in data:
                for plugin in data['plugins']:
                    if 'midi_cc' in plugin:
                        # Convert old format to new
                        for param_name, cc_num in plugin.get('midi_cc', {}).items():
                            data['midi_mappings'].append({
                                'plugin_uri': plugin.get('uri', ''),
                                'parameter': param_name,
                                'cc_number': cc_num,
                                'channel': 0,
                                'range_min': 0.0,
                                'range_max': 1.0,
                            })
                        del plugin['midi_cc']

            return data

        def rollback_1_2_to_1_1(data: Dict[str, Any]) -> Dict[str, Any]:
            data = copy.deepcopy(data)

            # Convert new MIDI mappings back to old format
            if 'midi_mappings' in data and 'plugins' in data:
                plugin_map = {p.get('uri', ''): p for p in data['plugins']}

                for mapping in data['midi_mappings']:
                    uri = mapping.get('plugin_uri', '')
                    if uri in plugin_map:
                        plugin = plugin_map[uri]
                        if 'midi_cc' not in plugin:
                            plugin['midi_cc'] = {}
                        plugin['midi_cc'][mapping['parameter']] = mapping['cc_number']

                del data['midi_mappings']

            return data

        self.register(MigrationStep(
            from_version="1.1.0",
            to_version="1.2.0",
            description="Add structured MIDI mappings",
            migrate_func=migrate_1_1_to_1_2,
            rollback_func=rollback_1_2_to_1_1,
        ))

        # 1.2.0 -> 2.0.0: Major restructure - add chain metadata, plugin health
        def migrate_1_2_to_2_0(data: Dict[str, Any]) -> Dict[str, Any]:
            data = copy.deepcopy(data)

            # Wrap in new structure if not already
            if 'schema_version' not in data:
                old_data = data
                data = {
                    'schema_version': '2.0.0',
                    'preset_format': 'map2_preset',
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'modified_at': datetime.now(timezone.utc).isoformat(),
                    'chain': {
                        'name': old_data.get('name', 'Untitled'),
                        'description': old_data.get('description', ''),
                        'plugins': old_data.get('plugins', []),
                        'input_gain': old_data.get('input_gain', 0.0),
                        'output_gain': old_data.get('output_gain', 0.0),
                    },
                    'midi_mappings': old_data.get('midi_mappings', []),
                    'automation': old_data.get('automation', []),
                    'metadata': old_data.get('metadata', {}),
                }

            # Add plugin health tracking fields
            for plugin in data.get('chain', {}).get('plugins', []):
                if 'health' not in plugin:
                    plugin['health'] = {
                        'rt_safety_verified': False,
                        'max_processing_ms': 0.0,
                        'last_error': None,
                    }

            # Add audio settings
            if 'audio_settings' not in data:
                data['audio_settings'] = {
                    'sample_rate': 48000,
                    'buffer_size': 256,
                    'input_channels': 2,
                    'output_channels': 2,
                }

            return data

        def rollback_2_0_to_1_2(data: Dict[str, Any]) -> Dict[str, Any]:
            # Convert back to flat structure
            if 'chain' in data:
                result = {
                    'name': data['chain'].get('name', 'Untitled'),
                    'description': data['chain'].get('description', ''),
                    'plugins': data['chain'].get('plugins', []),
                    'midi_mappings': data.get('midi_mappings', []),
                    'metadata': data.get('metadata', {}),
                }

                # Remove health tracking fields from plugins
                for plugin in result['plugins']:
                    plugin.pop('health', None)

                return result

            return data

        self.register(MigrationStep(
            from_version="1.2.0",
            to_version="2.0.0",
            description="Major restructure with chain metadata and health tracking",
            migrate_func=migrate_1_2_to_2_0,
            rollback_func=rollback_2_0_to_1_2,
        ))


class PresetMigrator:
    """Handles preset migration with backup and validation."""

    def __init__(self, backup_dir: Optional[Path] = None):
        self._registry = PresetMigrationRegistry()
        self._backup_dir = backup_dir or Path.home() / ".config" / "map2" / "preset_backups"
        self._backup_dir.mkdir(parents=True, exist_ok=True)

    def detect_version(self, data: Dict[str, Any]) -> str:
        """Detect the schema version of a preset."""
        # Check for explicit version
        if 'schema_version' in data:
            return data['schema_version']

        # Heuristic detection
        if 'chain' in data and 'audio_settings' in data:
            return "2.0.0"
        elif 'midi_mappings' in data and isinstance(data['midi_mappings'], list):
            return "1.2.0"
        elif 'plugins' in data:
            # Check for bypass state
            plugins = data.get('plugins', [])
            if plugins and 'is_bypassed' in plugins[0]:
                return "1.1.0"
            return "1.0.0"

        return "1.0.0"  # Default to oldest

    def needs_migration(self, data: Dict[str, Any],
                       target_version: str = CURRENT_SCHEMA_VERSION) -> bool:
        """Check if preset needs migration."""
        current = self.detect_version(data)
        return current != target_version

    def create_backup(self, data: Dict[str, Any], preset_name: str) -> str:
        """Create backup of preset before migration."""
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        content_hash = hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()[:8]
        backup_name = f"{preset_name}_{timestamp}_{content_hash}.json"
        backup_path = self._backup_dir / backup_name

        with open(backup_path, 'w') as f:
            json.dump(data, f, indent=2)

        logger.info(f"Created preset backup: {backup_path}")
        return str(backup_path)

    def migrate(self, data: Dict[str, Any],
               target_version: str = CURRENT_SCHEMA_VERSION,
               preset_name: str = "unnamed",
               create_backup: bool = True) -> MigrationResult:
        """Migrate preset to target version.

        Args:
            data: Preset data dictionary
            target_version: Target schema version
            preset_name: Name for backup file
            create_backup: Whether to create backup

        Returns:
            MigrationResult with success status and details
        """
        original_version = self.detect_version(data)

        result = MigrationResult(
            success=False,
            original_version=original_version,
            final_version=original_version,
            steps_applied=[],
        )

        if original_version == target_version:
            result.success = True
            result.warnings.append("No migration needed")
            return result

        # Create backup
        if create_backup:
            try:
                result.backup_path = self.create_backup(data, preset_name)
            except Exception as e:
                result.warnings.append(f"Backup failed: {e}")

        # Get migration path
        migrations = self._registry.get_migration_path(original_version, target_version)

        if not migrations:
            result.errors.append(f"No migration path from {original_version} to {target_version}")
            return result

        # Apply migrations
        current_data = copy.deepcopy(data)
        current_version = original_version

        for migration in migrations:
            try:
                logger.info(f"Applying migration: {migration.description}")
                current_data = migration.migrate_func(current_data)
                current_version = migration.to_version
                result.steps_applied.append(f"{migration.from_version}->{migration.to_version}")
            except Exception as e:
                result.errors.append(f"Migration failed at {migration.from_version}->{migration.to_version}: {e}")
                result.final_version = current_version
                return result

        # Validate result
        validation_errors = self.validate(current_data, target_version)
        if validation_errors:
            result.errors.extend(validation_errors)
            result.final_version = current_version
            return result

        # Update version in data
        current_data['schema_version'] = target_version

        # Success - update original data
        data.clear()
        data.update(current_data)

        result.success = True
        result.final_version = target_version

        logger.info(f"Migration complete: {original_version} -> {target_version}")
        return result

    def validate(self, data: Dict[str, Any], version: str) -> List[str]:
        """Validate preset data against schema version."""
        errors = []

        if version == "2.0.0":
            # Validate 2.0.0 schema
            required_fields = ['schema_version', 'chain']
            for field in required_fields:
                if field not in data:
                    errors.append(f"Missing required field: {field}")

            if 'chain' in data:
                chain = data['chain']
                if 'plugins' not in chain:
                    errors.append("Missing 'plugins' in chain")
                elif not isinstance(chain['plugins'], list):
                    errors.append("'plugins' must be a list")
                else:
                    for i, plugin in enumerate(chain['plugins']):
                        if 'uri' not in plugin:
                            errors.append(f"Plugin {i} missing 'uri'")
                        if 'parameters' not in plugin:
                            errors.append(f"Plugin {i} missing 'parameters'")

        elif version in ["1.0.0", "1.1.0", "1.2.0"]:
            # Validate older schemas
            if 'plugins' not in data:
                errors.append("Missing 'plugins' field")
            elif not isinstance(data['plugins'], list):
                errors.append("'plugins' must be a list")

        return errors

    def get_migration_info(self, data: Dict[str, Any],
                          target_version: str = CURRENT_SCHEMA_VERSION) -> Dict[str, Any]:
        """Get information about pending migrations without applying them."""
        current = self.detect_version(data)
        migrations = self._registry.get_migration_path(current, target_version)

        return {
            "current_version": current,
            "target_version": target_version,
            "needs_migration": current != target_version,
            "migration_steps": [
                {
                    "from": m.from_version,
                    "to": m.to_version,
                    "description": m.description,
                    "has_rollback": m.rollback_func is not None,
                }
                for m in migrations
            ],
        }


class PresetManager:
    """High-level preset management with automatic migration."""

    def __init__(self, presets_dir: Optional[Path] = None):
        self._presets_dir = presets_dir or Path.home() / ".config" / "map2" / "presets"
        self._presets_dir.mkdir(parents=True, exist_ok=True)
        self._migrator = PresetMigrator()

    def load_preset(self, path: Path, auto_migrate: bool = True) -> Tuple[Dict[str, Any], MigrationResult]:
        """Load and optionally migrate a preset.

        Args:
            path: Path to preset file
            auto_migrate: Whether to auto-migrate to current version

        Returns:
            Tuple of (preset_data, migration_result)
        """
        with open(path, 'r') as f:
            data = json.load(f)

        if auto_migrate and self._migrator.needs_migration(data):
            result = self._migrator.migrate(data, preset_name=path.stem)
            if result.success:
                # Save migrated version
                self.save_preset(path, data)
        else:
            result = MigrationResult(
                success=True,
                original_version=self._migrator.detect_version(data),
                final_version=self._migrator.detect_version(data),
                steps_applied=[],
            )

        return data, result

    def save_preset(self, path: Path, data: Dict[str, Any]) -> None:
        """Save preset with current schema version."""
        # Ensure version is set
        if 'schema_version' not in data:
            data['schema_version'] = CURRENT_SCHEMA_VERSION

        data['modified_at'] = datetime.now(timezone.utc).isoformat()

        with open(path, 'w') as f:
            json.dump(data, f, indent=2)

        logger.info(f"Saved preset: {path}")

    def create_new_preset(self, name: str, chain_plugins: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Create a new preset with current schema."""
        return {
            'schema_version': CURRENT_SCHEMA_VERSION,
            'preset_format': 'map2_preset',
            'created_at': datetime.now(timezone.utc).isoformat(),
            'modified_at': datetime.now(timezone.utc).isoformat(),
            'chain': {
                'name': name,
                'description': '',
                'plugins': chain_plugins,
                'input_gain': 0.0,
                'output_gain': 0.0,
            },
            'midi_mappings': [],
            'automation': [],
            'audio_settings': {
                'sample_rate': 48000,
                'buffer_size': 256,
                'input_channels': 2,
                'output_channels': 2,
            },
            'metadata': {},
        }

    def list_presets(self) -> List[Dict[str, Any]]:
        """List all presets with version info."""
        presets = []

        for preset_file in self._presets_dir.glob("*.json"):
            try:
                with open(preset_file, 'r') as f:
                    data = json.load(f)

                version = self._migrator.detect_version(data)
                needs_migration = self._migrator.needs_migration(data)

                presets.append({
                    'path': str(preset_file),
                    'name': preset_file.stem,
                    'version': version,
                    'needs_migration': needs_migration,
                    'created_at': data.get('created_at'),
                    'modified_at': data.get('modified_at'),
                })
            except Exception as e:
                logger.error(f"Error reading preset {preset_file}: {e}")

        return presets

    def migrate_all_presets(self) -> Dict[str, MigrationResult]:
        """Migrate all presets to current version."""
        results = {}

        for preset_file in self._presets_dir.glob("*.json"):
            try:
                with open(preset_file, 'r') as f:
                    data = json.load(f)

                if self._migrator.needs_migration(data):
                    result = self._migrator.migrate(data, preset_name=preset_file.stem)
                    if result.success:
                        self.save_preset(preset_file, data)
                    results[preset_file.stem] = result
            except Exception as e:
                results[preset_file.stem] = MigrationResult(
                    success=False,
                    original_version="unknown",
                    final_version="unknown",
                    steps_applied=[],
                    errors=[str(e)],
                )

        return results


# Global singleton
_preset_manager: Optional[PresetManager] = None


def get_preset_manager() -> PresetManager:
    """Get global preset manager instance."""
    global _preset_manager
    if _preset_manager is None:
        _preset_manager = PresetManager()
    return _preset_manager
