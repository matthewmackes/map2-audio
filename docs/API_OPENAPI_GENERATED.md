# OpenAPI (Swagger) Documentation for MAP2 Audio Platform

This documentation is auto-generated from the FastAPI app and reflects the current API endpoints, request/response models, and descriptions.

To view the live OpenAPI/Swagger UI, run the server and visit:
- http://localhost:8080/docs
- http://localhost:8080/redoc

## Main Endpoints (from /app/routes/engine.py)

### Engine Status
- **GET /api/engine/status**: Get comprehensive audio engine status
- **GET /api/engine/version**: Get audio engine version

### Engine Control
- **POST /api/engine/initialize**: Initialize audio engine with configuration
- **POST /api/engine/shutdown**: Shutdown audio engine
- **POST /api/engine/audio/start**: Start audio processing
- **POST /api/engine/audio/stop**: Stop audio processing
- **GET /api/engine/audio/status**: Get audio processing status

### Plugin Management
- **GET /api/engine/plugins**: List all available LV2 plugins
- **GET /api/engine/plugins/{uri}**: Get detailed plugin information
- **POST /api/engine/plugins/load**: Load a plugin into the chain
- **POST /api/engine/plugins/unload/{instance_id}**: Unload a plugin from the chain

### Chain Management
- **GET /api/engine/chain**: Get current plugin chain
- **POST /api/engine/chain/reorder**: Reorder plugins in the chain

### Parameters
- **POST /api/engine/parameter**: Set a plugin parameter
- **GET /api/engine/parameter/{instance_id}/{param_name}**: Get a plugin parameter value
- **POST /api/engine/bypass**: Set plugin bypass state

### Snapshots
- **GET /api/engine/snapshots**: List all snapshots
- **POST /api/engine/snapshots/load**: Load a snapshot
- **GET /api/engine/snapshot/current**: Get current snapshot ID

### MIDI
- **GET /api/engine/midi/devices**: List available MIDI devices
- **POST /api/engine/midi/enable**: Enable or disable MIDI

### VU Meters
- **GET /api/engine/vu**: Get master VU levels
- **GET /api/engine/vu/plugins**: Get per-plugin VU levels

### PiPedal Compatibility
- **GET /api/pipedal/status**: PiPedal compatibility: Get status
- **GET /api/pipedal/plugins**: PiPedal compatibility: List plugins
- **POST /api/pipedal/initialize**: PiPedal compatibility: Initialize
- **GET /api/pipedal/audio/status**: PiPedal compatibility: Audio status

---

For full request/response models and details, see the FastAPI Swagger UI or the code in app/routes/engine.py.

**This file is auto-generated and should be kept in sync with the FastAPI app.**
