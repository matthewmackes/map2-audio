# T2521-4 — map2-sonobus-transport daemon
#
# Standalone executable that bridges JACK/PipeWire audio ↔ AOO source/sink
# over UDP. Talks to the backend over a UDS at /run/map2/sonobus-transport.sock.
#
# Build modes (inherited from juce-engine/CMakeLists.txt):
#   - SONOBUS_AVAILABLE=TRUE  → links libaoo from vendor/aoo/
#   - SONOBUS_BUILD_STUB=TRUE → builds with E_AOO_UNAVAILABLE no-op
#
# The two modes ship the SAME binary at the same install path. The
# backend supervisor's UDS protocol works identically; the only
# difference is whether AOO transport actually moves audio.

cmake_minimum_required(VERSION 3.22)

# Daemon sources — identical in both modes; AooTransport.cpp uses
# preprocessor guards to switch between full and stub paths.
set(MAP2_SONOBUS_DAEMON_SOURCES
    Source/Main.cpp
    Source/DaemonConfig.cpp
    Source/DaemonServer.cpp
    Source/UdsProtocol.cpp
    Source/AooTransport.cpp
    Source/JackBridge.cpp
    Source/MetricsCollector.cpp
)

add_executable(map2-sonobus-transport
    ${MAP2_SONOBUS_DAEMON_SOURCES}
)

target_include_directories(map2-sonobus-transport
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/Source
)

target_compile_features(map2-sonobus-transport PRIVATE cxx_std_17)

# Strict warnings — daemon is RT-safety-critical; no surprises tolerated.
target_compile_options(map2-sonobus-transport PRIVATE
    -Wall -Wextra -Wpedantic
    -Wno-unused-parameter  # OK in protocol stubs
)

# Release flags inherited from parent: -O3 -march=native.

# ───────────────────────────────────────────────────────────────────
# AOO transport linkage (conditional)
# ───────────────────────────────────────────────────────────────────

if(SONOBUS_AVAILABLE)
    # Full mode: link libaoo from vendor/aoo/. The vendor CMakeLists
    # exports a target named `aoo` (per upstream cmake configuration).
    target_link_libraries(map2-sonobus-transport PRIVATE aoo)
    target_compile_definitions(map2-sonobus-transport PRIVATE
        MAP2_SONOBUS_HAS_AOO=1
    )
    message(STATUS "  map2-sonobus-transport: AOO ENABLED (full transport)")
else()
    # Stub mode: AOO calls compile to E_AOO_UNAVAILABLE.
    target_compile_definitions(map2-sonobus-transport PRIVATE
        MAP2_SONOBUS_HAS_AOO=0
    )
    message(STATUS "  map2-sonobus-transport: AOO STUB (no transport — bench pull AOO source for full mode)")
endif()

# ───────────────────────────────────────────────────────────────────
# libuv (UDS bridge to the backend)
# ───────────────────────────────────────────────────────────────────
# libuv is the future event-loop backend (cycle 2 lands the libuv-driven
# main loop). For cycle 1, the daemon uses bare POSIX sockets + a
# sleep-poll main loop, so libuv is OPTIONAL — the build succeeds without
# it but logs a warning. The full mode (cycle 2+) requires libuv.

find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBUV libuv)
if(LIBUV_FOUND)
    target_include_directories(map2-sonobus-transport PRIVATE ${LIBUV_INCLUDE_DIRS})
    target_link_libraries(map2-sonobus-transport PRIVATE ${LIBUV_LIBRARIES})
    target_compile_definitions(map2-sonobus-transport PRIVATE MAP2_SONOBUS_HAS_LIBUV=1)
    message(STATUS "  map2-sonobus-transport: libuv ENABLED (cycle-2 event loop)")
else()
    target_compile_definitions(map2-sonobus-transport PRIVATE MAP2_SONOBUS_HAS_LIBUV=0)
    message(WARNING "  map2-sonobus-transport: libuv NOT found — using POSIX poll loop (cycle 1)")
endif()

# ───────────────────────────────────────────────────────────────────
# JACK client (audio I/O)
# ───────────────────────────────────────────────────────────────────

pkg_check_modules(JACK jack)
if(JACK_FOUND)
    target_include_directories(map2-sonobus-transport PRIVATE ${JACK_INCLUDE_DIRS})
    # pkg-config jack on Fedora resolves to libjack under
    # /usr/lib64/pipewire-0.3/jack/ which the default linker search path
    # doesn't include. Use the full link-line so -L flags reach the linker.
    target_link_libraries(map2-sonobus-transport PRIVATE ${JACK_LDFLAGS})
    target_link_options(map2-sonobus-transport PRIVATE ${JACK_LDFLAGS_OTHER})
    target_compile_definitions(map2-sonobus-transport PRIVATE MAP2_SONOBUS_HAS_JACK=1)
    message(STATUS "  map2-sonobus-transport: JACK ENABLED (${JACK_LIBRARIES})")
else()
    message(WARNING "  map2-sonobus-transport: JACK not found via pkg-config; audio path will be stubbed")
    target_compile_definitions(map2-sonobus-transport PRIVATE MAP2_SONOBUS_HAS_JACK=0)
endif()

# Threading.
find_package(Threads REQUIRED)
target_link_libraries(map2-sonobus-transport PRIVATE Threads::Threads)

# Install path — same as the engine library + controller-host.
# Spec installs from juce-engine/build/map2-sonobus-transport.
