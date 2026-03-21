"""
Default Effects Loader

Loads and manages the declared default LV2 deployment inventory and preset chains.
"""

import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.database import Plugin, Chain, ChainPlugin
from app.services.default_effects_manifest import (
    get_default_effects_manifest_path,
    load_default_effects_manifest,
)

logger = logging.getLogger(__name__)


class DefaultEffectsLoader:
    """
    Loads default LV2 effects from configuration and initializes the database.
    """

    def __init__(self, db: Session):
        """
        Initialize the default effects loader.

        Args:
            db: Database session for persisting default effects
        """
        self.db = db
        self.config_path = get_default_effects_manifest_path()
        self.default_effects: List[Dict[str, Any]] = []
        self.default_chains: List[Dict[str, Any]] = []

    def load_config(self) -> bool:
        """
        Load default effects configuration from JSON file.

        Returns:
            True if configuration loaded successfully, False otherwise
        """
        try:
            if not self.config_path.exists():
                logger.warning(f"Default effects config not found: {self.config_path}")
                return False

            config = load_default_effects_manifest()
            self.default_effects = config.get('plugins', [])
            self.default_chains = config.get('default_chains', [])

            logger.info(f"Loaded {len(self.default_effects)} default effects from config")
            logger.info(f"Loaded {len(self.default_chains)} default chain templates")

            return True

        except Exception as e:
            logger.error(f"Failed to load default effects config: {e}")
            return False

    def initialize_default_plugins(self, force_refresh: bool = False) -> int:
        """
        Initialize default plugins in the database.

        Args:
            force_refresh: If True, re-add plugins even if they already exist

        Returns:
            Number of plugins added to database
        """
        if not self.default_effects:
            self.load_config()

        if not self.default_effects:
            logger.warning("No default effects to initialize")
            return 0

        added_count = 0

        for effect in self.default_effects:
            try:
                uri = effect.get('uri')
                if not uri:
                    logger.warning(f"Plugin missing URI: {effect.get('name', 'Unknown')}")
                    continue

                # Check if plugin already exists
                existing = self.db.query(Plugin).filter(Plugin.uri == uri).first()

                if existing and not force_refresh:
                    logger.debug(f"Plugin already exists: {uri}")
                    continue

                # Create or update plugin
                plugin_data = {
                    'uri': uri,
                    'name': effect.get('name', 'Unknown Plugin'),
                    'category': effect.get('category', 'Utility'),
                    'author': effect.get('author', 'Unknown'),
                    'version': effect.get('version', '1.0.0'),
                    'priority': effect.get('priority', 5),
                    'is_hard_rt_capable': effect.get('is_hard_rt_capable', False),
                    'bundle_path': effect.get('bundle_path'),
                }

                if existing:
                    # Update existing plugin
                    for key, value in plugin_data.items():
                        setattr(existing, key, value)
                    logger.info(f"Updated plugin: {uri}")
                else:
                    # Create new plugin
                    plugin = Plugin(**plugin_data)
                    self.db.add(plugin)
                    added_count += 1
                    logger.info(f"Added plugin: {uri}")

            except Exception as e:
                logger.error(f"Failed to add plugin {effect.get('uri', 'unknown')}: {e}")
                continue

        # Commit all changes
        try:
            self.db.commit()
            logger.info(f"Successfully initialized {added_count} default plugins")
        except Exception as e:
            logger.error(f"Failed to commit plugins to database: {e}")
            self.db.rollback()
            return 0

        return added_count

    def create_default_chains(self, force_recreate: bool = False) -> int:
        """
        Create default chain templates in the database.

        Args:
            force_recreate: If True, delete and recreate existing default chains

        Returns:
            Number of chains created
        """
        if not self.default_chains:
            self.load_config()

        if not self.default_chains:
            logger.warning("No default chains to create")
            return 0

        created_count = 0

        for chain_template in self.default_chains:
            try:
                chain_name = chain_template.get('name')
                if not chain_name:
                    logger.warning("Chain template missing name")
                    continue

                # Check if chain already exists
                existing = self.db.query(Chain).filter(Chain.name == chain_name).first()

                if existing:
                    if force_recreate:
                        self.db.delete(existing)
                        self.db.commit()
                        logger.info(f"Deleted existing chain: {chain_name}")
                    else:
                        logger.debug(f"Chain already exists: {chain_name}")
                        continue

                # Create new chain
                chain = Chain(
                    name=chain_name,
                    is_active=False,
                    config=json.dumps({'description': chain_template.get('description', '')})
                )
                self.db.add(chain)
                self.db.flush()  # Get chain ID

                # Add plugins to chain
                plugin_uris = chain_template.get('plugins', [])
                for position, plugin_uri in enumerate(plugin_uris):
                    # Verify plugin exists in database
                    plugin = self.db.query(Plugin).filter(Plugin.uri == plugin_uri).first()
                    if not plugin:
                        logger.warning(f"Plugin not found in database: {plugin_uri}")
                        continue

                    # Add plugin to chain
                    chain_plugin = ChainPlugin(
                        chain_id=chain.id,
                        plugin_uri=plugin_uri,
                        position=position,
                        bypass=False
                    )
                    self.db.add(chain_plugin)

                created_count += 1
                logger.info(f"Created chain: {chain_name} with {len(plugin_uris)} plugins")

            except Exception as e:
                logger.error(f"Failed to create chain {chain_template.get('name', 'unknown')}: {e}")
                self.db.rollback()
                continue

        # Commit all changes
        try:
            self.db.commit()
            logger.info(f"Successfully created {created_count} default chains")
        except Exception as e:
            logger.error(f"Failed to commit chains to database: {e}")
            self.db.rollback()
            return 0

        return created_count

    def get_default_plugin_uris(self) -> List[str]:
        """
        Get list of all default plugin URIs.

        Returns:
            List of plugin URIs
        """
        if not self.default_effects:
            self.load_config()

        return [effect.get('uri') for effect in self.default_effects if effect.get('uri')]

    def get_plugins_by_category(self, category: str) -> List[Dict[str, Any]]:
        """
        Get default plugins filtered by category.

        Args:
            category: Plugin category (e.g., 'Amplifier', 'Reverb', 'Delay')

        Returns:
            List of plugin definitions matching the category
        """
        if not self.default_effects:
            self.load_config()

        return [
            effect for effect in self.default_effects
            if effect.get('category', '').lower() == category.lower()
        ]

    def is_default_plugin(self, uri: str) -> bool:
        """
        Check if a plugin URI is in the default effects list.

        Args:
            uri: Plugin URI to check

        Returns:
            True if plugin is a default effect, False otherwise
        """
        if not self.default_effects:
            self.load_config()

        return uri in self.get_default_plugin_uris()

    def get_plugin_info(self, uri: str) -> Optional[Dict[str, Any]]:
        """
        Get default plugin information by URI.

        Args:
            uri: Plugin URI

        Returns:
            Plugin information dict or None if not found
        """
        if not self.default_effects:
            self.load_config()

        for effect in self.default_effects:
            if effect.get('uri') == uri:
                return effect

        return None


def initialize_default_effects(db: Session, force_refresh: bool = False) -> Dict[str, int]:
    """
    Convenience function to initialize default effects and chains.

    Args:
        db: Database session
        force_refresh: If True, refresh existing plugins and chains

    Returns:
        Dictionary with counts of plugins and chains initialized
    """
    loader = DefaultEffectsLoader(db)

    plugins_added = loader.initialize_default_plugins(force_refresh=force_refresh)
    chains_created = loader.create_default_chains(force_recreate=force_refresh)

    return {
        'plugins_added': plugins_added,
        'chains_created': chains_created
    }
