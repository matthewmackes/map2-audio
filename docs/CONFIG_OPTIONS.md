# MAP2 Audio Platform Configuration Options

This document lists all configuration options available in the MAP2 Audio Platform, including their default values, types, environment variable overrides, and descriptions. For runtime changes, see app/config.py or use the API/config UI.

| Key | Default | Type | Env Var | Min | Max | Choices | Restart Required | Description |
|-----|---------|------|---------|-----|-----|---------|------------------|-------------|
| Key | Default | Type | Env Var | Min | Max | Choices | Restart Required | Description |
|-----|---------|------|---------|-----|-----|---------|------------------|-------------|
| app.name | 'Mackes Audio Platform V2' | str |  |  |  |  | No | Application display name |
| app.version | '1.0.0-beta' | str |  |  |  |  | No | Application version |
| app.debug | False | bool | MAP2_DEBUG |  |  |  | No | Enable debug mode |
| app.log_level | 'INFO' | str | MAP2_LOG_LEVEL |  |  | ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] | No | Logging level |
| audio.sample_rate | 48000 | int | MAP2_SAMPLE_RATE |  |  | [44100, 48000, 88200, 96000, 192000] | Yes | Audio sample rate in Hz |
| audio.buffer_size | 256 | int | MAP2_BUFFER_SIZE |  |  | [64, 128, 256, 512, 1024, 2048] | Yes | Audio buffer size in samples |
| audio.channels | 2 | int |  | 1 | 32 |  | Yes | Number of audio channels |
| audio.device | None | str | MAP2_AUDIO_DEVICE |  |  |  | Yes | Audio device name (None for default) |
| audio.latency_compensation | 0.0 | float |  | -100.0 | 100.0 |  | No | Additional latency compensation in ms |
| midi.enabled | True | bool | MAP2_MIDI_ENABLED |  |  |  | No | Enable MIDI functionality |
| midi.learn_timeout | 10.0 | float |  | 1.0 | 60.0 |  | No | MIDI learn mode timeout in seconds |
| midi.cc14_enabled | True | bool |  |  |  |  | No | Enable 14-bit CC (high resolution) support |
| midi.default_curve | 'linear' | str |  |  |  | ['linear', 'logarithmic', 'exponential', 's_curve'] | No | Default MIDI response curve |
| lcd.enabled | False | bool | MAP2_ENABLE_LCD |  |  |  | No | Enable LCD display support |
| lcd.addresses | [39, 63] | list |  |  |  |  | No | I2C addresses for LCD displays |
| lcd.simulation | False | bool | MAP2_LCD_SIMULATION |  |  |  | No | Use LCD simulation mode |
| backend.host | '0.0.0.0' | str | MAP2_HOST |  |  |  | No | Backend API host address |
| backend.port | 8080 | int | MAP2_PORT | 1 | 65535 |  | No | Backend API port |
| backend.workers | 2 | int |  | 1 | 16 |  | No | Number of worker processes |
| backend.cors_origins | ['*'] | list |  |  |  |  | No | Allowed CORS origins |
| database.path | '~/.map2/map2.db' | str | MAP2_DATABASE_PATH |  |  |  | No | Database file path |
| database.wal_mode | True | bool |  |  |  |  | No | Enable SQLite WAL mode for reliability |
| database.checkpoint_interval | 300 | int |  | 60 | 3600 |  | No | WAL checkpoint interval in seconds |
| automation.lfo_resolution_ms | 10.0 | float |  | 1.0 | 100.0 |  | No | LFO update resolution in milliseconds |
| automation.envelope_attack_default | 10.0 | float |  | 0.1 | 1000.0 |  | No | Default envelope follower attack time in ms |
| automation.envelope_release_default | 100.0 | float |  | 1.0 | 5000.0 |  | No | Default envelope follower release time in ms |
| plugins.cache_ttl | 300 | int |  | 60 | 3600 |  | No | Plugin cache TTL in seconds |
| plugins.scan_on_startup | True | bool |  |  |  |  | No | Scan for plugins on application startup |
| plugins.extra_lv2_paths | [] | list |  |  |  |  | No | Additional LV2 plugin paths to scan |
| websocket.ping_interval | 30000 | int |  | 5000 | 120000 |  | No | WebSocket ping interval in milliseconds |
| websocket.rt_coalesce_ms | 2.0 | float |  | 0.5 | 50.0 |  | No | Real-time parameter coalesce window in ms |
| monitoring.enabled | True | bool |  |  |  |  | No | Enable system monitoring |
| monitoring.metrics_interval | 10 | int |  | 1 | 60 |  | No | Metrics collection interval in seconds |
| monitoring.health_check_interval | 5 | int |  | 1 | 60 |  | No | Health check interval in seconds |
| backup.auto_backup_enabled | True | bool |  |  |  |  | No | Enable automatic session backups |
| backup.auto_backup_interval | 300 | int |  | 60 | 3600 |  | No | Auto-backup interval in seconds |
| backup.max_backups | 50 | int |  | 5 | 500 |  | No | Maximum number of backup versions to keep |
| backup.backup_dir | '~/.map2/backups' | str |  |  |  |  | No | Backup directory path |
| storage.nam_user_dir | '~/.local/share/map2/nam' | str | MAP2_NAM_DIR |  |  |  | No | User NAM models directory |
| storage.ir_user_dir | '~/.local/share/map2/ir' | str | MAP2_IR_DIR |  |  |  | No | User IR files directory |
| storage.nam_system_dir | '/var/lib/map2/nam' | str |  |  |  |  | No | System NAM models directory |
| storage.ir_system_dir | '/var/lib/map2/ir' | str |  |  |  |  | No | System IR files directory |
| storage.extra_nam_paths | ['~/NAM/models', '~/.local/share/NAM', '/usr/share/map2/nam'] | list |  |  |  |  | No | Additional NAM discovery paths |
| storage.extra_ir_paths | ['~/Impulses', '~/IRs', '/usr/share/map2/ir', '/usr/share/impulses'] | list |  |  |  |  | No | Additional IR discovery paths |
