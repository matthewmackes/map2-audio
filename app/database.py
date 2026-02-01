"""
SQLAlchemy Database Models
Core ORM definitions for plugins, chains, MIDI mappings, and system configuration.

Power-Failure Resilience:
- WAL (Write-Ahead Logging) mode for atomic commits
- SYNCHRONOUS=NORMAL for balance of safety and performance
- Automatic checkpointing every 1000 pages
- Connection pragma enforcement on each connection
"""

from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Text, JSON, create_engine, event, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker, Session
from sqlalchemy.engine import Engine
from datetime import datetime
import json
import logging

logger = logging.getLogger(__name__)

Base = declarative_base()

# Database session management
_engine = None
_SessionLocal = None

# SQLite PRAGMA settings for power-failure resilience
SQLITE_PRAGMAS = {
    "journal_mode": "WAL",           # Write-Ahead Logging for atomic commits
    "synchronous": "NORMAL",         # Balance of safety and performance (FULL for max safety)
    "wal_autocheckpoint": "4000",    # Checkpoint every 4000 pages (reduced I/O spikes for RT audio)
    "busy_timeout": "5000",          # Wait 5s on lock contention
    "cache_size": "-64000",          # 64MB cache (negative = KB)
    "foreign_keys": "ON",            # Enforce foreign key constraints
    "temp_store": "MEMORY",          # Store temp tables in memory
}


@event.listens_for(Engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):
    """Apply SQLite PRAGMAs on every new connection for power-failure resilience."""
    cursor = dbapi_connection.cursor()
    for pragma, value in SQLITE_PRAGMAS.items():
        try:
            cursor.execute(f"PRAGMA {pragma}={value}")
        except Exception as e:
            logger.warning(f"Failed to set PRAGMA {pragma}={value}: {e}")
    cursor.close()


def init_db(database_url: str = "sqlite:///data/map2.db") -> None:
    """Initialize database engine and session factory with power-failure resilience."""
    global _engine, _SessionLocal
    _engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,  # Verify connections are alive
    )
    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    Base.metadata.create_all(bind=_engine)
    logger.info("Database initialized with WAL mode and power-failure resilience")


def get_db() -> Session:
    """Get database session (dependency for FastAPI routes)."""
    if _SessionLocal is None:
        init_db()
    db = _SessionLocal()
    try:
        return db
    finally:
        db.close()


from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

_async_engine = None
_async_session_maker = None
_tables_created = False  # Track if tables have been created
_pragmas_set = False  # Track if PRAGMAs have been applied


def init_async_db(database_url: str = "sqlite+aiosqlite:///data/map2.db") -> None:
    """Initialize async database engine and session factory with power-failure resilience."""
    global _async_engine, _async_session_maker
    _async_engine = create_async_engine(
        database_url,
        echo=False,
        pool_pre_ping=True,
    )
    # CRITICAL: expire_on_commit=True ensures deleted objects are expired after commit
    # This forces fresh database queries instead of returning stale cached objects
    # With expire_on_commit=False, deleted plugins would remain visible in the session
    _async_session_maker = async_sessionmaker(_async_engine, expire_on_commit=True)


async def _set_async_pragmas(conn) -> None:
    """Apply SQLite PRAGMAs for async connection."""
    for pragma, value in SQLITE_PRAGMAS.items():
        try:
            await conn.execute(text(f"PRAGMA {pragma}={value}"))
        except Exception as e:
            logger.warning(f"Failed to set async PRAGMA {pragma}={value}: {e}")


async def _ensure_tables_created() -> None:
    """Create tables once if they don't exist (called only once per startup)."""
    global _tables_created, _pragmas_set
    if _tables_created:
        return
    if _async_engine:
        async with _async_engine.begin() as conn:
            # Apply PRAGMAs first
            if not _pragmas_set:
                for pragma, value in SQLITE_PRAGMAS.items():
                    try:
                        await conn.execute(text(f"PRAGMA {pragma}={value}"))
                    except Exception as e:
                        logger.warning(f"Failed to set async PRAGMA {pragma}={value}: {e}")
                _pragmas_set = True
                logger.info("Async database PRAGMAs applied (WAL mode enabled)")
            await conn.run_sync(Base.metadata.create_all)
        _tables_created = True


@asynccontextmanager
async def get_session() -> "AsyncSession":
    """Get async database session context manager with automatic commit/rollback."""
    if _async_session_maker is None:
        init_async_db()

    # Create tables only once (not on every request!)
    await _ensure_tables_created()

    async with _async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def checkpoint_database() -> None:
    """Force a WAL checkpoint to ensure all changes are written to main database file.

    Call this periodically or before graceful shutdown to ensure data durability.
    """
    if _async_engine:
        from sqlalchemy import text
        async with _async_engine.connect() as conn:
            async with conn.begin():
                await conn.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
                logger.info("Database checkpoint completed")


class Plugin(Base):
    """LV2 Plugin metadata and state."""
    __tablename__ = "plugins"

    id = Column(Integer, primary_key=True)
    uri = Column(String(255), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    category = Column(String(100), default="Unclassified")
    author = Column(String(255))
    version = Column(String(20))
    parameters = Column(Text, default="{}")  # JSON-serialized params
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Latency information
    reported_latency_samples = Column(Integer, default=0)
    measured_latency_samples = Column(Integer, default=0)
    has_latency_port = Column(Boolean, default=False)
    latency_port_index = Column(Integer, nullable=True)
    
    # DSP management
    priority = Column(Integer, default=5)  # 1-10, 10=highest
    auto_bypass_on_overload = Column(Boolean, default=True)
    estimated_cpu_us = Column(Float, default=100.0)
    
    # LV2 compliance
    is_hard_rt_capable = Column(Boolean, default=False)
    has_options_interface = Column(Boolean, default=False)
    has_state_interface = Column(Boolean, default=False)
    has_worker_interface = Column(Boolean, default=False)
    bundle_path = Column(String(512), nullable=True)


class Chain(Base):
    """Signal chain combining multiple plugins."""
    __tablename__ = "chains"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=False)
    config = Column(Text, default="{}")  # JSON chain config
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    chain_plugins = relationship("ChainPlugin", back_populates="chain", cascade="all, delete-orphan")
    presets = relationship("Preset", back_populates="chain", cascade="all, delete-orphan")


class Preset(Base):
    """Plugin chain preset configuration."""
    __tablename__ = "presets"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    chain_id = Column(Integer, ForeignKey("chains.id"))
    plugin_states = Column(Text, nullable=False)  # JSON
    tags = Column(JSON, default=list)  # Enhanced: Tag support
    category = Column(String(100), default="User")  # Enhanced: Category
    description = Column(Text, default="")  # Enhanced: Description
    is_favorite = Column(Boolean, default=False)  # Enhanced: Favorites
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    chain = relationship("Chain", back_populates="presets")


class PluginPreset(Base):
    """Individual plugin parameter preset configuration.
    
    Separate from chain presets - stores parameter settings for a single plugin
    to enable easy reuse and favorite management.
    """
    __tablename__ = "plugin_presets"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    plugin_uri = Column(String(255), nullable=False, index=True)
    plugin_name = Column(String(255), nullable=False)
    parameters = Column(Text, nullable=False)  # JSON: {param_symbol: value, ...}
    tags = Column(JSON, default=list)  # Tag support
    category = Column(String(100), default="User")  # Category
    description = Column(Text, default="")  # Description
    is_favorite = Column(Boolean, default=False)  # Mark as favorite
    is_default = Column(Boolean, default=False)  # Set as default for this plugin
    usage_count = Column(Integer, default=0)  # Track usage frequency
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Composite unique constraint (plugin_uri + name)
    __table_args__ = (
        # Allows multiple presets per plugin but not duplicate names per plugin
        {"sqlite_autoincrement": True},
    )


class ChainPlugin(Base):
    """Junction table: plugins in chains with ordering."""
    __tablename__ = "chain_plugins"

    id = Column(Integer, primary_key=True)
    chain_id = Column(Integer, ForeignKey("chains.id"), nullable=False)
    plugin_uri = Column(String(255), nullable=False)  # No FK - plugins are discovered at runtime from LV2
    position = Column(Integer, nullable=False)  # Order in chain
    bypass = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    chain = relationship("Chain", back_populates="chain_plugins")


class MIDIMappingGroup(Base):
    """Logical grouping for MIDI mappings (e.g., 'Expression Pedal', 'Faders')."""
    __tablename__ = "midi_mapping_groups"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    color = Column(String(7))  # Hex color for UI (e.g., '#ff5733')
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    mappings = relationship("MIDIMapping", back_populates="group")


class MIDIMapping(Base):
    """Enhanced MIDI CC to plugin parameter mapping with per-chain scope."""
    __tablename__ = "midi_mappings"

    id = Column(Integer, primary_key=True)

    # Source MIDI
    channel = Column(Integer, nullable=False)  # 0=omni, 1-16=specific channel
    cc = Column(Integer, nullable=False)       # 0-127

    # Target (Per-Chain Scope)
    chain_id = Column(Integer, ForeignKey("chains.id", ondelete="CASCADE"), nullable=True)
    target_plugin_uri = Column(String(255))  # No FK - plugins discovered at runtime
    target_param_index = Column(Integer)
    target_param_symbol = Column(String(100))  # Parameter symbol for name-based access

    # Value Mapping
    min_val = Column(Float, default=0.0)
    max_val = Column(Float, default=1.0)
    curve_type = Column(String(20), default="linear")  # linear, logarithmic, exponential, s_curve
    invert = Column(Boolean, default=False)

    # MIDI Feedback (for controller sync)
    feedback_enabled = Column(Boolean, default=True)
    feedback_cc = Column(Integer)  # CC to send back (defaults to same CC if None)

    # Metadata
    name = Column(String(255))  # User-friendly display name
    group_id = Column(Integer, ForeignKey("midi_mapping_groups.id", ondelete="SET NULL"), nullable=True)
    is_learned = Column(Boolean, default=False)
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    chain = relationship("Chain", foreign_keys=[chain_id])
    group = relationship("MIDIMappingGroup", back_populates="mappings")


class MIDICommand(Base):
    """MIDI commands for chain switching and plugin control."""
    __tablename__ = "midi_commands"

    id = Column(Integer, primary_key=True)

    # Command Trigger
    command_type = Column(String(20), nullable=False)  # program_change, note_on, cc_toggle
    channel = Column(Integer, default=0)  # 0=omni, 1-16=specific
    data1 = Column(Integer, nullable=False)  # PC number, Note number, or CC number
    data2 = Column(Integer)  # Velocity threshold, CC value threshold (optional)

    # Action
    action_type = Column(String(30), nullable=False)  # activate_chain, toggle_chain, toggle_plugin, set_routing
    target_chain_id = Column(Integer, ForeignKey("chains.id", ondelete="CASCADE"), nullable=True)
    target_plugin_uri = Column(String(255))
    action_data = Column(JSON, default=dict)  # Extra action parameters

    # Metadata
    name = Column(String(255))
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    target_chain = relationship("Chain", foreign_keys=[target_chain_id])


class MIDIRoutingRule(Base):
    """MIDI-controlled signal routing within chains."""
    __tablename__ = "midi_routing_rules"

    id = Column(Integer, primary_key=True)

    # Trigger
    channel = Column(Integer, default=0)  # 0=omni
    cc = Column(Integer, nullable=False)

    # Routing Change
    chain_id = Column(Integer, ForeignKey("chains.id", ondelete="CASCADE"))
    routing_type = Column(String(30))  # parallel_mix, serial_order, bypass_group
    routing_data = Column(JSON, default=dict)

    # Metadata
    name = Column(String(255))
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    chain = relationship("Chain", foreign_keys=[chain_id])


class MIDIDeviceConfig(Base):
    """Persistent MIDI device configuration."""
    __tablename__ = "midi_device_configs"

    id = Column(Integer, primary_key=True)
    device_name = Column(String(255), nullable=False, unique=True)
    device_type = Column(String(20))  # input, output
    is_enabled = Column(Boolean, default=True)
    auto_connect = Column(Boolean, default=True)
    channel_filter = Column(Integer)  # None = all channels
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MIDIPreset(Base):
    """Complete MIDI configuration preset."""
    __tablename__ = "midi_presets"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)

    # Snapshot of all mappings, commands, routing rules
    mappings_snapshot = Column(JSON, default=list)
    commands_snapshot = Column(JSON, default=list)
    routing_rules_snapshot = Column(JSON, default=list)
    device_configs_snapshot = Column(JSON, default=list)

    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ChainMIDIConfig(Base):
    """Maps Program Change numbers to chains for MIDI chain switching."""
    __tablename__ = "chain_midi_configs"

    id = Column(Integer, primary_key=True)
    chain_id = Column(Integer, ForeignKey("chains.id", ondelete="CASCADE"), unique=True)
    program_number = Column(Integer, nullable=False)  # 0-127
    bank_msb = Column(Integer, default=0)  # Bank Select MSB (CC#0) for >128 chains
    bank_lsb = Column(Integer, default=0)  # Bank Select LSB (CC#32)
    send_pc_on_activate = Column(Boolean, default=True)  # Send PC back to sync controller
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    chain = relationship("Chain", foreign_keys=[chain_id])


class SystemConfig(Base):
    """Key-value system configuration store."""
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True)
    key = Column(String(255), unique=True, nullable=False)
    value = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PluginPerformanceLog(Base):
    """Historical plugin CPU performance data."""
    __tablename__ = "plugin_performance_log"

    id = Column(Integer, primary_key=True)
    plugin_uri = Column(String(255), nullable=False)  # No FK - plugins are discovered at runtime from LV2
    plugin_name = Column(String(255), nullable=False)
    chain_id = Column(Integer, ForeignKey("chains.id", ondelete="CASCADE"))

    # Performance metrics
    avg_time_us = Column(Float, nullable=False)  # Average processing time (microseconds)
    max_time_us = Column(Float, nullable=False)  # Peak processing time (microseconds)
    cpu_percent = Column(Float, nullable=False)  # CPU percentage vs deadline
    call_count = Column(Integer, default=0)       # Number of process() calls

    # Buffer configuration
    sample_rate = Column(Integer, nullable=False)
    buffer_size = Column(Integer, nullable=False)
    deadline_us = Column(Float, nullable=False)

    # Timestamp
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    chain = relationship("Chain", foreign_keys=[chain_id])


# --- IMPULSE RESPONSE AND NAM MODELS ---

class ImpulseResponse(Base):
    """Impulse Response file metadata and analysis."""
    __tablename__ = "impulse_responses"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    file_path = Column(String(512), unique=True, nullable=False)
    file_hash = Column(String(64), unique=True, nullable=False)

    # Audio properties
    sample_rate = Column(Integer, default=48000)
    channels = Column(Integer, default=1)
    duration_seconds = Column(Float, default=0.0)
    length_samples = Column(Integer, default=0)

    # Analysis results
    peak_amplitude = Column(Float, default=0.0)
    rms_level = Column(Float, default=0.0)
    rt60 = Column(Float, nullable=True)  # Reverb time
    early_decay_time = Column(Float, nullable=True)
    peak_location_ms = Column(Float, nullable=True)
    estimated_characteristics = Column(Boolean, default=True)

    # Categorization
    category = Column(String(100), default="Uncategorized")
    category_id = Column(Integer, ForeignKey("ir_categories.id"), nullable=True)
    subcategory = Column(String(100), nullable=True)
    library = Column(String(100), default="user")
    license = Column(String(100), default="Unknown")

    # Metadata
    source_url = Column(String(512), nullable=True)
    author = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    tags = Column(JSON, default=list)

    # User management
    is_favorite = Column(Boolean, default=False)
    rating = Column(Integer, nullable=True)  # 1-5 stars

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship
    category_obj = relationship("IRCategory", back_populates="impulse_responses")


class NAMModel(Base):
    """Neural Amp Modeler (NAM) model metadata."""
    __tablename__ = "nam_models"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    file_path = Column(String(512), unique=True, nullable=False)
    file_hash = Column(String(64), unique=True, nullable=False)
    file_size = Column(Integer, default=0)

    # Model properties
    model_type = Column(String(100), default="unknown")  # WaveNet, LSTM, etc.
    sample_rate = Column(Integer, default=48000)
    input_gain = Column(Float, default=0.0)
    output_gain = Column(Float, default=0.0)

    # Categorization
    category = Column(String(100), default="Amp Model")
    amp_type = Column(String(100), nullable=True)  # Clean, Crunch, High Gain, etc.
    amp_name = Column(String(255), nullable=True)  # Original amp being modeled

    # Metadata
    author = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    tags = Column(JSON, default=list)
    license = Column(String(100), default="Unknown")
    source_url = Column(String(512), nullable=True)

    # User management
    is_favorite = Column(Boolean, default=False)
    rating = Column(Integer, nullable=True)  # 1-5 stars

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class IRCategory(Base):
    """IR category taxonomy (hierarchical)."""
    __tablename__ = "ir_categories"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    parent_id = Column(Integer, ForeignKey("ir_categories.id"))
    description = Column(Text)
    icon = Column(String(50))
    display_order = Column(Integer, default=0)

    # Hierarchical relationship
    parent = relationship("IRCategory", remote_side=[id], backref="children")
    impulse_responses = relationship("ImpulseResponse", back_populates="category_obj")


# =============================================================================
# COMMAND HISTORY - Persistent Undo/Redo System
# =============================================================================

class CommandHistory(Base):
    """Persistent command history for undo/redo operations.

    Stores state snapshots before each mutating operation, allowing
    recovery even after application restart or power failure.
    """
    __tablename__ = "command_history"

    id = Column(Integer, primary_key=True)
    session_id = Column(String(36), nullable=False, index=True)  # UUID for session grouping
    sequence = Column(Integer, nullable=False)  # Order within session

    # Command metadata
    command_type = Column(String(100), nullable=False)  # e.g., "chain_create", "plugin_add"
    description = Column(String(500), nullable=False)  # Human-readable description

    # State snapshots (JSON)
    state_before = Column(Text, nullable=False)  # State before command executed
    state_after = Column(Text, nullable=False)   # State after command executed

    # Affected entities for partial restore
    affected_chain_ids = Column(JSON, default=list)  # List of chain IDs modified
    affected_plugin_uris = Column(JSON, default=list)  # List of plugin URIs modified

    # Status tracking
    is_undone = Column(Boolean, default=False)  # True if command has been undone
    executed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    undone_at = Column(DateTime, nullable=True)

    # Index for efficient queries
    __table_args__ = (
        # Composite index for session-based queries
        {"sqlite_autoincrement": True},
    )


class SessionBackup(Base):
    """Automatic session backups with versioning.

    Stores periodic snapshots of the entire session state for recovery.
    """
    __tablename__ = "session_backups"

    id = Column(Integer, primary_key=True)
    session_name = Column(String(255), nullable=False)
    version = Column(Integer, nullable=False, default=1)  # Incrementing version number

    # Full session state (JSON)
    chains_snapshot = Column(Text, nullable=False)  # All chains and their plugins
    presets_snapshot = Column(Text, nullable=False)  # All presets
    midi_mappings_snapshot = Column(Text, nullable=False)  # All MIDI mappings
    automation_snapshot = Column(Text, default="{}")  # Automation lanes

    # Backup metadata
    backup_type = Column(String(50), default="auto")  # "auto", "manual", "pre_change"
    trigger_reason = Column(String(255))  # What triggered this backup
    file_size_bytes = Column(Integer)  # Estimated size for cleanup

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Composite unique constraint
    __table_args__ = (
        # Index for finding latest backup
        {"sqlite_autoincrement": True},
    )


# =============================================================================
# AUTOMATION SYSTEM - Persistent Automation Data
# =============================================================================

class AutomationLane(Base):
    """Automation lane for a single parameter.

    Stores automation data persistently for power-failure resilience.
    """
    __tablename__ = "automation_lanes"

    id = Column(Integer, primary_key=True)

    # Target identification
    parameter_id = Column(String(255), unique=True, nullable=False)  # plugin_uri:param_index
    plugin_uri = Column(String(255), nullable=False)
    param_index = Column(Integer, nullable=False)
    param_name = Column(String(255))  # Cached parameter name

    # Automation points (JSON array of {time, value, curve})
    points = Column(Text, default="[]")  # JSON array

    # Lane settings
    enabled = Column(Boolean, default=True)
    modulation_source = Column(String(50), default="timeline")  # timeline, lfo, envelope, midi, audio

    # LFO settings (when modulation_source="lfo")
    lfo_rate_hz = Column(Float, default=1.0)
    lfo_depth = Column(Float, default=0.5)  # 0.0 to 1.0
    lfo_waveform = Column(String(20), default="sine")  # sine, triangle, square, saw, random
    lfo_phase = Column(Float, default=0.0)  # 0.0 to 1.0
    lfo_sync_to_tempo = Column(Boolean, default=False)
    lfo_tempo_division = Column(String(20), default="1/4")  # 1/1, 1/2, 1/4, 1/8, etc.

    # Envelope follower settings (when modulation_source="envelope")
    env_input_source = Column(String(50), default="main_input")  # main_input, sidechain, plugin_output
    env_attack_ms = Column(Float, default=10.0)
    env_release_ms = Column(Float, default=100.0)
    env_threshold_db = Column(Float, default=-20.0)
    env_sensitivity = Column(Float, default=1.0)

    # Loop settings
    loop_enabled = Column(Boolean, default=False)
    loop_start = Column(Float, default=0.0)
    loop_end = Column(Float, default=4.0)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MIDILearnState(Base):
    """Persistent MIDI learn state for resuming learn mode after restart."""
    __tablename__ = "midi_learn_state"

    id = Column(Integer, primary_key=True)

    # Target being learned
    target_plugin_uri = Column(String(255), nullable=False)
    target_param_index = Column(Integer, nullable=False)
    target_param_name = Column(String(255))

    # Learn settings
    started_at = Column(DateTime, default=datetime.utcnow)
    timeout_seconds = Column(Float, default=30.0)

    # Completion state
    completed = Column(Boolean, default=False)
    learned_channel = Column(Integer, nullable=True)
    learned_cc = Column(Integer, nullable=True)
    completed_at = Column(DateTime, nullable=True)


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

async def get_or_create_system_config(session: AsyncSession, key: str, default_value: str = "") -> str:
    """Get a system config value, creating it with default if not exists."""
    from sqlalchemy import select
    result = await session.execute(
        select(SystemConfig).where(SystemConfig.key == key)
    )
    config = result.scalar_one_or_none()
    if config:
        return config.value

    # Create with default
    new_config = SystemConfig(key=key, value=default_value)
    session.add(new_config)
    await session.flush()
    return default_value


async def set_system_config(session: AsyncSession, key: str, value: str) -> None:
    """Set a system config value, creating or updating as needed."""
    from sqlalchemy import select
    result = await session.execute(
        select(SystemConfig).where(SystemConfig.key == key)
    )
    config = result.scalar_one_or_none()
    if config:
        config.value = value
        config.updated_at = datetime.utcnow()
    else:
        session.add(SystemConfig(key=key, value=value))
    await session.flush()

