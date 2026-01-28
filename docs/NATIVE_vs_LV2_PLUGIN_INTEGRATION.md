## Implementation Plan: Native Plugin Addition

### 1. Refactor ChainService
- Ensure `add_plugin_to_chain` has dedicated handling for all native plugin URIs (done).
- Use a mapping for native plugin URIs to allow easy extension.
- Publish events for all native plugin additions for UI/state sync.

### 2. Update Plugin Loader/Runtime
- Ensure runtime instantiation uses `create_native_plugin(uri)` for all native plugin URIs.
- Chain execution should instantiate plugins by URI, using native adapters or LV2 host as appropriate.

### 3. Parameter and State Management
- Expose parameter APIs for all native plugins, matching LV2 parameter automation patterns.
- Ensure state (bypass, parameters) is persisted and restored for native plugins just like LV2.

### 4. UI/UX Consistency
- Update UI to allow adding, removing, and reordering native plugins in the same way as LV2 plugins.
- Ensure parameter controls and automation are available for all native plugins.

### 5. Testing
- Add unit and integration tests for adding/removing all native plugin types to/from chains.
- Test signal flow construction and audio processing with mixed native/LV2 chains.

### 6. Documentation
- Document native plugin URIs and their capabilities for developers and users.
- Keep this chart and plan up to date as new native plugins are added.
## Native vs LV2 Plugin Integration: Comparison Chart

| Aspect                | Native Plugins (MAP2)                        | LV2 Plugins (External)           |
|-----------------------|----------------------------------------------|----------------------------------|
| **Instantiation**     | Python/C++ adapter class (`NativePluginAdapter` and subclasses) | Loaded via LV2 host (lilv, etc.) |
| **URI**               | Custom, e.g. `http://map2-audio.local/…`     | Standard LV2 URI                 |
| **Parameter Interface** | Python methods, custom logic                | LV2 port interface               |
| **Processing**        | In-process, direct Python/C++                | External LV2 shared object       |
| **Discovery**         | Static registration in code (`NATIVE_PLUGIN_ADAPTERS`) | Scanned from LV2 folders         |
| **State/Persistence** | Same DB model (`ChainPlugin`)                | Same DB model                    |
| **Signal Flow Addition** | Special handling for NAM/IR, others generic | Generic, by URI                  |
| **Runtime Instantiation** | `create_native_plugin(uri)`                | LV2 host instantiates by URI      |
| **Parameter Automation** | Exposed via Python API, can be extended    | Standard LV2 automation          |
| **UI Integration**    | Custom, but can match LV2 pattern            | Standardized                     |

### Notes
- All native plugins should be addable to the chain using the same pattern as NAM (dedicated handler in `ChainService`).
- LV2 plugins are handled generically by URI.