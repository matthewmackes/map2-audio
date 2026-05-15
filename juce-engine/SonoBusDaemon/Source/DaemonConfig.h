// T2521-4 — map2-sonobus-transport daemon configuration constants.
//
// Single header consumed by every source file in the daemon. Encodes
// the locked Q1-Q21 decisions from docs/architecture/SONOBUS_AOO_TRANSPORT.md
// + the systemd unit's Environment= block.

#pragma once

#include <cstdint>
#include <string>

namespace map2 {
namespace sonobus {

// ───────────────────────────────────────────────────────────────────
// Locked defaults (override via env or CLI flags at startup)
// ───────────────────────────────────────────────────────────────────

// UDS socket path. The backend supervisor (app/services/sonobus/
// daemon_supervisor.py) connects here to send commands + receive events.
constexpr const char* DEFAULT_UDS_SOCKET_PATH = "/run/map2/sonobus-transport.sock";

// UDP port range for AOO transport. The systemd firewalld zone fragment
// (systemd/firewalld/map2-sonobus.xml) opens the same range.
constexpr uint16_t DEFAULT_UDP_PORT_BASE = 10000;
constexpr uint16_t DEFAULT_UDP_PORT_COUNT = 100;

// Audio format (Q5+Q14): PCM 24-bit / 48 kHz, full multichannel.
constexpr uint32_t DEFAULT_SAMPLE_RATE_HZ = 48000;
constexpr uint32_t DEFAULT_BUFFER_SIZE = 64;       // samples; matches Common.h
constexpr uint8_t  DEFAULT_BIT_DEPTH = 24;
constexpr uint8_t  DEFAULT_MAX_CHANNELS = 32;      // Q14 system-wide cap

// JACK client name. AOO source/sink ports are created under this name.
constexpr const char* JACK_CLIENT_NAME = "map2-sonobus-transport";

// Daemon version. Reported back to the supervisor on `hello` handshake.
constexpr const char* DAEMON_VERSION = "0.1.0-stub";  // bumps to 1.0.0 on AOO vendor pull

// ───────────────────────────────────────────────────────────────────
// Build-mode discrimination
// ───────────────────────────────────────────────────────────────────

#if MAP2_SONOBUS_HAS_AOO
constexpr bool IS_STUB_BUILD = false;
#else
constexpr bool IS_STUB_BUILD = true;
#endif

#if MAP2_SONOBUS_HAS_JACK
constexpr bool HAS_JACK_BUILD = true;
#else
constexpr bool HAS_JACK_BUILD = false;
#endif

// ───────────────────────────────────────────────────────────────────
// CLI argument parsing
// ───────────────────────────────────────────────────────────────────

struct DaemonArgs
{
    std::string socket_path = DEFAULT_UDS_SOCKET_PATH;
    uint16_t port_base = DEFAULT_UDP_PORT_BASE;
    uint16_t port_count = DEFAULT_UDP_PORT_COUNT;
    uint32_t sample_rate_hz = DEFAULT_SAMPLE_RATE_HZ;
    uint32_t buffer_size = DEFAULT_BUFFER_SIZE;
    bool verbose = false;
    bool show_help = false;
    bool show_version = false;
};

// Parses argv. Returns true on success. Bad flags → false + writes to stderr.
bool parseArgs(int argc, char** argv, DaemonArgs& out);

// Writes --help to stdout.
void printHelp(const char* progname);

}  // namespace sonobus
}  // namespace map2
