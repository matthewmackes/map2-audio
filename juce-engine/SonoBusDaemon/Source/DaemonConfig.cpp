// T2521-4 — DaemonConfig.cpp: CLI argument parsing for the daemon.

#include "DaemonConfig.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

namespace map2 {
namespace sonobus {

namespace {

bool parseUint16(const char* s, uint16_t& out)
{
    if (s == nullptr) return false;
    char* end = nullptr;
    long v = std::strtol(s, &end, 10);
    if (end == s || *end != '\0' || v < 0 || v > 65535) return false;
    out = static_cast<uint16_t>(v);
    return true;
}

bool parseUint32(const char* s, uint32_t& out)
{
    if (s == nullptr) return false;
    char* end = nullptr;
    long v = std::strtol(s, &end, 10);
    if (end == s || *end != '\0' || v < 0 || v > 0x7FFFFFFFL) return false;
    out = static_cast<uint32_t>(v);
    return true;
}

}  // namespace

bool parseArgs(int argc, char** argv, DaemonArgs& out)
{
    for (int i = 1; i < argc; ++i)
    {
        const char* arg = argv[i];
        if (std::strcmp(arg, "--help") == 0 || std::strcmp(arg, "-h") == 0)
        {
            out.show_help = true;
            return true;
        }
        if (std::strcmp(arg, "--version") == 0 || std::strcmp(arg, "-V") == 0)
        {
            out.show_version = true;
            return true;
        }
        if (std::strcmp(arg, "--socket") == 0)
        {
            if (i + 1 >= argc) { std::fprintf(stderr, "--socket needs a path\n"); return false; }
            out.socket_path = argv[++i];
        }
        else if (std::strcmp(arg, "--port-base") == 0)
        {
            if (i + 1 >= argc) { std::fprintf(stderr, "--port-base needs a number\n"); return false; }
            if (! parseUint16(argv[++i], out.port_base)) { std::fprintf(stderr, "--port-base invalid\n"); return false; }
        }
        else if (std::strcmp(arg, "--port-count") == 0)
        {
            if (i + 1 >= argc) { std::fprintf(stderr, "--port-count needs a number\n"); return false; }
            if (! parseUint16(argv[++i], out.port_count)) { std::fprintf(stderr, "--port-count invalid\n"); return false; }
        }
        else if (std::strcmp(arg, "--sample-rate") == 0)
        {
            if (i + 1 >= argc) { std::fprintf(stderr, "--sample-rate needs a number\n"); return false; }
            if (! parseUint32(argv[++i], out.sample_rate_hz)) { std::fprintf(stderr, "--sample-rate invalid\n"); return false; }
        }
        else if (std::strcmp(arg, "--buffer-size") == 0)
        {
            if (i + 1 >= argc) { std::fprintf(stderr, "--buffer-size needs a number\n"); return false; }
            if (! parseUint32(argv[++i], out.buffer_size)) { std::fprintf(stderr, "--buffer-size invalid\n"); return false; }
        }
        else if (std::strcmp(arg, "--verbose") == 0 || std::strcmp(arg, "-v") == 0)
        {
            out.verbose = true;
        }
        else
        {
            std::fprintf(stderr, "unknown argument: %s (try --help)\n", arg);
            return false;
        }
    }
    return true;
}

void printHelp(const char* progname)
{
    std::printf(
        "Usage: %s [OPTIONS]\n"
        "\n"
        "MAP2 SonoBus / AOO remote-audio transport daemon.\n"
        "Spawned by systemd as map2-sonobus-transport.service.\n"
        "\n"
        "OPTIONS:\n"
        "  --socket PATH         UDS path (default: %s)\n"
        "  --port-base NUM       UDP port range base (default: %u)\n"
        "  --port-count NUM      UDP port range count (default: %u)\n"
        "  --sample-rate HZ      Audio sample rate (default: %u)\n"
        "  --buffer-size SAMPLES Audio buffer size (default: %u)\n"
        "  --verbose, -v         Verbose logging\n"
        "  --version, -V         Print version + build mode and exit\n"
        "  --help, -h            Print this help and exit\n"
        "\n"
        "Locked decisions (Q1-Q21) are documented in\n"
        "docs/architecture/SONOBUS_AOO_TRANSPORT.md.\n",
        progname,
        DEFAULT_UDS_SOCKET_PATH,
        DEFAULT_UDP_PORT_BASE,
        DEFAULT_UDP_PORT_COUNT,
        DEFAULT_SAMPLE_RATE_HZ,
        DEFAULT_BUFFER_SIZE);
}

}  // namespace sonobus
}  // namespace map2
