// T2521-4 — map2-sonobus-transport daemon entry point.
//
// Wired by the systemd unit at /usr/lib/systemd/system/
// map2-sonobus-transport.service. The daemon:
//   1. Parses CLI args + reads environment overrides
//   2. Initializes the UDS server on /run/map2/sonobus-transport.sock
//   3. Initializes the AOO transport (full or stub mode per build flag)
//   4. Initializes the JACK bridge (or stub if --no-jack)
//   5. Runs the main event loop (libuv-driven)
//   6. Handles SIGTERM/SIGINT gracefully

#include "DaemonConfig.h"
#include "DaemonServer.h"

#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>

namespace
{

// Global daemon pointer so the signal handler can request shutdown.
map2::sonobus::DaemonServer* g_daemon = nullptr;

void handleSignal(int signo)
{
    const char* name = (signo == SIGTERM) ? "SIGTERM" : "SIGINT";
    std::fprintf(stderr, "[map2-sonobus-transport] received %s — shutting down\n", name);
    if (g_daemon != nullptr)
    {
        g_daemon->requestShutdown();
    }
}

void installSignalHandlers()
{
    struct sigaction sa;
    std::memset(&sa, 0, sizeof(sa));
    sa.sa_handler = handleSignal;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_RESTART;
    sigaction(SIGTERM, &sa, nullptr);
    sigaction(SIGINT, &sa, nullptr);
    // SIGPIPE: ignore. UDS write to a closed peer should fail the write
    // with EPIPE, not kill the daemon.
    struct sigaction ignore;
    std::memset(&ignore, 0, sizeof(ignore));
    ignore.sa_handler = SIG_IGN;
    sigaction(SIGPIPE, &ignore, nullptr);
}

}  // namespace

int main(int argc, char** argv)
{
    using namespace map2::sonobus;

    DaemonArgs args;
    if (! parseArgs(argc, argv, args))
    {
        return EXIT_FAILURE;
    }
    if (args.show_help)
    {
        printHelp(argv[0]);
        return EXIT_SUCCESS;
    }
    if (args.show_version)
    {
        std::printf("map2-sonobus-transport %s (build mode: %s, jack: %s)\n",
                    DAEMON_VERSION,
                    IS_STUB_BUILD ? "stub" : "full",
                    HAS_JACK_BUILD ? "yes" : "no");
        return EXIT_SUCCESS;
    }

    std::fprintf(stderr, "[map2-sonobus-transport] starting v%s (%s mode)\n",
                 DAEMON_VERSION, IS_STUB_BUILD ? "STUB" : "FULL");
    std::fprintf(stderr, "[map2-sonobus-transport] socket=%s port_base=%u port_count=%u\n",
                 args.socket_path.c_str(), args.port_base, args.port_count);

    installSignalHandlers();

    DaemonServer daemon(args);
    g_daemon = &daemon;

    int rc = daemon.run();

    g_daemon = nullptr;
    std::fprintf(stderr, "[map2-sonobus-transport] exiting (rc=%d)\n", rc);
    return rc;
}
