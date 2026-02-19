# MinGW-w64 cross-compilation toolchain for Windows x86_64 VST3
# Usage: cmake -S . -B build-win --toolchain cmake/toolchains/mingw64.cmake

set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR x86_64)

# Cross-compilers (installed via mingw64-gcc-c++ on Fedora)
set(CMAKE_C_COMPILER   x86_64-w64-mingw32-gcc)
set(CMAKE_CXX_COMPILER x86_64-w64-mingw32-g++)
set(CMAKE_RC_COMPILER  x86_64-w64-mingw32-windres)
set(CMAKE_AR           x86_64-w64-mingw32-ar)
set(CMAKE_RANLIB       x86_64-w64-mingw32-ranlib)

# Sysroot
set(CMAKE_FIND_ROOT_PATH /usr/x86_64-w64-mingw32/sys-root/mingw)

# Search for programs on the build host, not the target
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
# Search for libraries and headers on the target sysroot
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)

# Don't try to use lld (it's the Linux linker; MinGW uses its own ld.bfd)
set(CMAKE_EXE_LINKER_FLAGS_INIT    "")
set(CMAKE_SHARED_LINKER_FLAGS_INIT "")
set(CMAKE_MODULE_LINKER_FLAGS_INIT "")

# Static link the C++ runtime so the .vst3 has no external DLL dependencies
# (users don't need to install MinGW runtimes)
set(CMAKE_CXX_STANDARD_LIBRARIES
    "-static-libgcc -static-libstdc++ -static -lpthread -dynamic -lole32 -luuid")
