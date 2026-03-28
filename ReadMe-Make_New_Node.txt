================================================================================
  MAP2 AUDIO PLATFORM — NEW NODE SETUP GUIDE
  Fedora Server (40+) — Bare Metal
================================================================================

  Target: sub-3 ms round-trip audio latency on isolated CPU cores
  OS:     Fedora Server 40 or 41 or 42 (minimal install recommended)
  User:   mm (or your chosen operator account — referenced throughout)

  This guide covers EVERY step from a blank Fedora install to a fully
  operational MAP2 audio node.  Steps are ordered; each section depends
  on the previous one completing successfully.

  Run the automated installer to skip many of these steps:
    sudo bash install_on_new_host.sh --mode audio

  Or follow this guide manually for full understanding and control.

================================================================================
  CONTENTS
================================================================================

  1.  HARDWARE REQUIREMENTS
  2.  FEDORA SERVER — INITIAL OS INSTALL
  3.  FIRST BOOT — BASIC SYSTEM SETUP
  4.  CREATE OPERATOR USER
  5.  INSTALL SYSTEM PACKAGES
  6.  INSTALL NODE.JS (v18+)
  7.  CLONE THE MAP2 REPOSITORY
  8.  PYTHON VIRTUAL ENVIRONMENT
  9.  BUILD THE JUCE AUDIO ENGINE (C++)
  10. BUILD THE WEB FRONTEND (React/TypeScript)
  11. REAL-TIME AUDIO — RT LIMITS
  12. PIPEWIRE CONFIGURATION
  13. GRUB — KERNEL RT PARAMETERS  (requires reboot)
  14. INSTALL SYSTEMD SERVICES
  15. IRQ AFFINITY — USB AUDIO PIN
  16. INSTALL LV2 / VST3 PLUGINS  (optional)
  17. MAP2 CONFIG FILE (~/.map2/config.json)
  18. START & VERIFY MAP2
  19. POST-INSTALL VERIFICATION CHECKLIST
  20. OPTIONAL: INSTALL USING THE TUI INSTALLER
  21. TROUBLESHOOTING QUICK REFERENCE

================================================================================
  1. HARDWARE REQUIREMENTS
================================================================================

  MINIMUM
  -------
  CPU:    6-core x86_64 with AVX2 support (Intel Core i5-8xxx+ or AMD Ryzen 5+)
          Must have at least 6 cores — 2 are isolated exclusively for audio.
  RAM:    8 GB (4 GB absolute minimum, 16 GB recommended for all-in-one mode)
  Disk:   20 GB SSD free (NVMe strongly preferred — build is I/O intensive)
  NIC:    Gigabit Ethernet (for AVB: requires hardware timestamping)
  Audio:  USB audio interface — reference hardware: Edirol UA-1000 (USB 2.0)

  VERIFIED AUDIO INTERFACES
  -------------------------
  - Edirol UA-1000        (primary reference — USB 2.0, UAC1)
  - Hotone Jogg           (secondary — USB audio class)

  IMPORTANT — DEDICATED NODE
  --------------------------
  For lowest latency, this machine should run MAP2 ONLY.
  Do NOT run: desktop environment, web browser, Docker, VMs.
  These cause cache-thrashing on non-isolated CPU cores.

  RECOMMENDED FOR PRODUCTION
  --------------------------
  CPU:    8+ cores (isolate 2 for audio, leave 6+ for OS and Python)
  RAM:    16 GB
  Disk:   NVMe SSD 64 GB+
  Audio:  Edirol UA-1000 on its own USB controller (not shared hub)


================================================================================
  2. FEDORA SERVER — INITIAL OS INSTALL
================================================================================

  Download Fedora Server ISO:
    https://fedoraproject.org/server/download/

  Recommended Fedora version: 42 (latest LTS-equivalent server release)

  ANACONDA INSTALLER OPTIONS (during Fedora install):
  ---------------------------------------------------
  a) Software Selection: "Minimal Install" — no GUI needed on an audio node.
     (Adding a desktop environment later will fight with RT scheduling.)

  b) Partitioning:
     /         30 GB  (xfs or ext4)
     /boot     1  GB  (ext4)
     /home     remainder  (xfs — where /home/mm/map2-audio lives)
     swap      8  GB  (or 0 if RAM >= 32 GB — SSD wear consideration)

  c) Network: set a static IP or DHCP reservation during install.
     The hostname will be set later in Step 3.

  d) Root password: set a strong root password.
     Create the 'mm' user during install OR in Step 4.

  e) Complete the install and reboot into the new system.


================================================================================
  3. FIRST BOOT — BASIC SYSTEM SETUP
================================================================================

  Login as root (or as mm with sudo).

  a) Set hostname:
     hostnamectl set-hostname map2-audio-01
     # Replace map2-audio-01 with your node name.
     # Use lowercase, hyphens only — no underscores (mDNS compatibility).

  b) Verify internet connectivity:
     ping -c 3 github.com
     # If no connectivity: check nmcli device status and configure NIC.

  c) Update all packages to latest:
     dnf update -y
     # This may take several minutes on a fresh install.
     # Reboot afterward if a kernel update was applied:
     reboot
     # (Log back in before continuing.)

  d) Set timezone:
     timedatectl set-timezone America/New_York
     # Or your timezone. List options: timedatectl list-timezones | grep America


================================================================================
  4. CREATE OPERATOR USER
================================================================================

  The MAP2 service runs as a non-root user ('mm' by default).
  If you created 'mm' during Fedora install, skip to the group membership step.

  a) Create user (if not already created):
     useradd -m -s /bin/bash mm
     passwd mm

  b) Add to sudoers:
     usermod -aG wheel mm

  c) Add to audio and jackuser groups:
     # These groups are required for real-time scheduling via rtkit.
     # Without them, SCHED_FIFO elevation fails silently.
     usermod -aG audio mm
     usermod -aG jackuser mm

     # Verify group membership:
     groups mm
     # Expected output includes: mm wheel audio jackuser

  d) Verify user login:
     su - mm
     whoami      # should print: mm
     exit


================================================================================
  5. INSTALL SYSTEM PACKAGES
================================================================================

  Run as root (or with sudo):

  a) Core development tools:
     dnf install -y \
       git curl wget tar unzip \
       python3 python3-pip python3-devel \
       gcc gcc-c++ make cmake ninja-build \
       pkg-config

  b) JUCE build dependencies:
     dnf install -y \
       freetype-devel libX11-devel libXext-devel libXrandr-devel \
       libXinerama-devel libXcursor-devel \
       webkit2gtk4.0-devel gtk3-devel \
       alsa-lib alsa-lib-devel alsa-utils

  c) PipeWire and real-time audio stack:
     dnf install -y \
       pipewire pipewire-jack pipewire-alsa pipewire-pulseaudio \
       wireplumber \
       rtkit \
       jack-audio-connection-kit jack-audio-connection-kit-devel

  d) LV2 plugin support (optional but recommended):
     dnf install -y \
       lv2 lv2-devel lilv lilv-devel suil suil-devel

  e) Network tools (required for AVB and diagnostics):
     dnf install -y ethtool iproute net-tools

  f) Verify key tools are installed:
     gcc --version        # expect: gcc 14.x
     cmake --version      # expect: cmake 3.28+
     python3 --version    # expect: Python 3.12+
     pipewire --version   # expect: 1.x.x


================================================================================
  6. INSTALL NODE.JS (v18 or later)
================================================================================

  Fedora's default nodejs package may be too old. Use the NodeSource repo:

  a) Install Node.js v22 LTS via NodeSource:
     curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
     dnf install -y nodejs

  b) Verify:
     node --version    # expect: v22.x.x
     npm --version     # expect: 10.x.x

  NOTE: Node.js is only needed if you are building the React web frontend.
  If running in audio-only mode with no web UI, you may skip this step.


================================================================================
  7. CLONE THE MAP2 REPOSITORY
================================================================================

  Do this as the 'mm' user (not root):

  a) Switch to mm user:
     su - mm

  b) Clone the repository:
     git clone https://github.com/matthewmackes/map2-audio.git ~/map2-audio
     cd ~/map2-audio

  c) Verify the clone:
     ls ~/map2-audio
     # Expected directories: app/ juce-engine/ systemd/ scripts/ src/ web/ etc.

  d) If the repo already exists (update instead):
     cd ~/map2-audio
     git pull --ff-only
     git submodule update --init --recursive


================================================================================
  8. PYTHON VIRTUAL ENVIRONMENT
================================================================================

  Run as the 'mm' user from ~/map2-audio:

  a) Create the virtual environment:
     python3 -m venv .venv

  b) Activate it:
     source .venv/bin/activate
     # Prompt changes to: (.venv) mm@hostname:~/map2-audio$

  c) Upgrade pip:
     pip install --upgrade pip

  d) Install MAP2 Python dependencies:
     pip install -r requirements.txt

  e) Verify key packages:
     python3 -c "import fastapi; print('FastAPI OK')"
     python3 -c "import uvicorn; print('Uvicorn OK')"

  NOTE: The systemd service uses /usr/bin/python3 (system Python), not the venv.
  If your app.main imports require venv packages, ensure PYTHONPATH is set in the
  service or install packages system-wide:
     sudo pip install -r requirements.txt
  (The service file sets: Environment="PYTHONPATH=/home/mm/map2-audio")


================================================================================
  9. BUILD THE JUCE AUDIO ENGINE (C++)
================================================================================

  The JUCE audio engine is the heart of MAP2 — the real-time C++ layer that
  handles audio callbacks, plugin hosting, metering, AVB streaming, and NAM.
  It takes 10–20 minutes to build on first run.

  Run as the 'mm' user:

  a) Enter the JUCE engine directory:
     cd ~/map2-audio/juce-engine

  b) Configure CMake (Release build with native CPU optimization):
     cmake -B build -DCMAKE_BUILD_TYPE=Release
     # CMake downloads JUCE 8.0.0 via FetchContent (~500 MB download).
     # This requires internet access.

  c) Build (replace 8 with your CPU core count):
     cmake --build build -j8
     # First build: 10–20 minutes
     # Subsequent builds: 1–3 minutes (incremental)

  d) Verify the build succeeded:
     ls build/*.so
     # Expected: libMap2AudioEngine.so or similar .so file
     ls build/Map2AudioEngineTests   2>/dev/null || true

  e) Run the JUCE test suite (optional but recommended):
     cd ~/map2-audio/juce-engine
     ctest --test-dir build --output-on-failure

  IMPORTANT BUILD FLAGS:
  - -O3 -march=native are set in CMakeLists.txt (compiler-native optimization)
  - -ffast-math is OFF by default (avoids NaN artifacts in audio processing)
  - Do NOT build on a different CPU and copy the binary — march=native
    will generate SIGILL (Illegal Instruction) on a CPU without the same flags.


================================================================================
  10. BUILD THE WEB FRONTEND (React/TypeScript)
================================================================================

  Skip this step if running in audio-only mode with no web UI.

  Run as the 'mm' user from ~/map2-audio:

  a) Install Node.js dependencies:
     npm install
     # Downloads node_modules (~500 MB). May take 2–5 minutes.

  b) Build the production bundle:
     npm run build
     # Compiles TypeScript, bundles React, outputs to dist/ or build/

  c) Verify:
     ls dist/ 2>/dev/null || ls build/ 2>/dev/null
     # Should contain index.html and asset files.

  NOTE: The web frontend is served by the Python FastAPI backend on port 3000
  (separate from the API on port 8080). Both ports must be open in firewalld:
     sudo firewall-cmd --permanent --add-port=8080/tcp
     sudo firewall-cmd --permanent --add-port=3000/tcp
     sudo firewall-cmd --reload


================================================================================
  11. REAL-TIME AUDIO — RT LIMITS
================================================================================

  Without these limits, the audio callback thread cannot elevate to
  real-time scheduling (SCHED_FIFO) and will drop audio on any CPU load spike.

  Run as root:

  a) Create the limits file:
     cat > /etc/security/limits.d/99-map2-audio.conf << 'EOF'
     # MAP2 Audio Platform — Real-Time scheduling limits
     @audio   -  rtprio     99
     @audio   -  memlock    unlimited
     @audio   -  nice       -20
     *        -  rtprio     95
     *        -  memlock    unlimited
     EOF

  b) Enable and start rtkit-daemon:
     systemctl enable --now rtkit-daemon.service

  c) Verify rtkit is running:
     systemctl is-active rtkit-daemon.service
     # Expected: active

  d) Log out and log back in as 'mm' for limits to take effect.
     Verify with:
     ulimit -r    # Expected: 95 (or higher)
     ulimit -l    # Expected: unlimited


================================================================================
  12. PIPEWIRE CONFIGURATION
================================================================================

  One configuration file controls MAP2's PipeWire session settings.
  Run as the 'mm' user:

  a) Create the config directory:
     mkdir -p ~/.config/pipewire/pipewire.conf.d

  b) Write the MAP2 latency configuration:
     cat > ~/.config/pipewire/pipewire.conf.d/99-map2-audio-latency.conf << 'EOF'
     # MAP2 Audio Platform — PipeWire low-latency configuration
     # NOTE: Do NOT set clock.force-quantum here.
     # It is set at runtime by map2-backend.service ExecStartPre commands.
     # Putting force-quantum here would lock PipeWire and block runtime overrides.

     context.properties = {
         default.clock.rate          = 48000
         default.clock.allowed-rates = [ 48000 ]

         default.clock.min-quantum   = 32
         default.clock.quantum       = 64
         default.clock.max-quantum   = 256

         api.alsa.period-num         = 2
         api.alsa.headroom           = 0

         mem.allow-mlock             = true
         mem.mlock-all               = true
     }
     EOF

  c) Do NOT create any other .conf files in pipewire.conf.d/.
     Only 99-map2-audio-latency.conf should exist there.
     Multiple conflicting fragments cause unpredictable quantum behavior.

  d) Enable PipeWire user services (as the 'mm' user, NOT root):
     systemctl --user enable pipewire.service pipewire-pulse.service wireplumber.service
     systemctl --user start  pipewire.service pipewire-pulse.service wireplumber.service

  e) Verify PipeWire is running:
     pw-cli info
     # Should show: id: 0, type: PipeWire:Interface:Core

  f) Verify the quantum (after the map2-backend service is started in Step 18):
     pw-metadata -n settings
     # Look for: clock.force-quantum = '64'


================================================================================
  13. GRUB — KERNEL RT PARAMETERS  (REQUIRES REBOOT)
================================================================================

  These kernel boot parameters isolate CPU cores for audio and eliminate
  timer interrupts and deep sleep states that cause latency spikes.

  WHAT EACH PARAMETER DOES:
  -------------------------
  isolcpus=4,5         Remove cores 4,5 from the Linux scheduler.
                       Only threads with explicit CPU affinity run there.
                       Without this: OS processes share cores with audio callback.

  nohz_full=4,5        Disable the periodic HZ timer tick on cores 4,5.
                       Default: 250 ticks/second = one interrupt every 4 ms.
                       At 64 samples / 48 kHz the buffer is only 1.33 ms total.
                       The 4 ms tick is longer than the entire audio buffer.

  rcu_nocbs=4,5        Offload RCU (Read-Copy-Update) callbacks off audio cores.
                       RCU is a kernel locking mechanism that fires unpredictably.

  threadirqs           Run hardware IRQ handlers as schedulable kernel threads.
                       Allows setting priority and CPU affinity on IRQ threads.
                       Required for Step 15 (USB audio IRQ pinning).

  intel_idle.max_cstate=1   Prevent Intel CPUs from entering deep C-states.
  processor.max_cstate=1    C3+ sleep states add 100–500 µs wakeup latency.
                            At 1.33 ms buffer, 500 µs = 37% of the entire buffer.

  preempt=full         Full kernel preemption: any running kernel code can be
                       interrupted by a higher-priority task.
                       Alternative: install kernel-rt for PREEMPT_RT (<50 µs jitter
                       vs ~200 µs for preempt=full). Recommended for production.

  Run as root:

  a) Back up the existing GRUB config:
     cp /etc/default/grub /etc/default/grub.bak

  b) Edit /etc/default/grub:
     # Find the line: GRUB_CMDLINE_LINUX="..."
     # ADD the following parameters to the existing value (do not replace).
     # Example — your line might currently be:
     #   GRUB_CMDLINE_LINUX="rhgb quiet"
     # It should become:
     #   GRUB_CMDLINE_LINUX="rhgb quiet isolcpus=4,5 nohz_full=4,5 rcu_nocbs=4,5 threadirqs intel_idle.max_cstate=1 processor.max_cstate=1 preempt=full"

     nano /etc/default/grub
     # Or use the TUI installer which does this safely with backup.

     IMPORTANT — ADJUST CORE NUMBERS FOR YOUR CPU:
     - "4,5" assumes a 6-core CPU (cores 0–5).
     - On an 8-core CPU you might use "6,7" to isolate the last two cores.
     - NEVER isolate core 0 — the kernel requires it.
     - Check your CPU count: nproc --all
     - Audio cores must match CPUAffinity= in the systemd service (Step 14).

  c) Regenerate the GRUB configuration:
     grub2-mkconfig -o /boot/grub2/grub.cfg

  d) REBOOT NOW to activate the kernel parameters:
     reboot

  e) After reboot, verify the parameters are active:
     cat /proc/cmdline
     # Should contain: isolcpus=4,5 nohz_full=4,5 threadirqs etc.

     # Verify core isolation is active:
     cat /sys/devices/system/cpu/isolated
     # Expected: 4-5


================================================================================
  14. INSTALL SYSTEMD SERVICES
================================================================================

  Run as root from ~/map2-audio:

  a) Copy the MAP2 backend service unit:
     cp systemd/map2-backend.service /etc/systemd/system/
     chmod 644 /etc/systemd/system/map2-backend.service

  b) Copy the IRQ affinity service and script:
     cp systemd/map2-irq-affinity.service /etc/systemd/system/
     cp systemd/map2-irq-affinity.sh      /usr/local/bin/
     chmod 755 /usr/local/bin/map2-irq-affinity.sh
     chmod 644 /etc/systemd/system/map2-irq-affinity.service

  c) Create the systemd drop-in directory and override:
     mkdir -p /etc/systemd/system/map2-backend.service.d/

     # Create override.conf to re-assert quantum and CPU affinity:
     cat > /etc/systemd/system/map2-backend.service.d/override.conf << 'EOF'
     [Service]
     Environment="XDG_RUNTIME_DIR=/run/user/1000"
     Environment="DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus"
     Environment="PIPEWIRE_REMOTE=pipewire-0"
     Environment="JACK_DEFAULT_SERVER=pipewire"
     Environment="PIPEWIRE_LATENCY=64/48000"
     ExecStartPre=/usr/bin/pw-metadata -n settings 0 clock.force-rate 48000
     ExecStartPre=/usr/bin/pw-metadata -n settings 0 clock.force-quantum 64
     CPUAffinity=4 5
     AmbientCapabilities=CAP_SYS_NICE CAP_NET_RAW
     CapabilityBoundingSet=CAP_SYS_NICE CAP_NET_RAW
     ReadWritePaths=/home/mm/.local/share /home/mm/.cache /var/lib/map2 /var/log/map2 /etc/map2 /tmp /run/map2-audio
     EOF

     NOTE: CPUAffinity=4 5 MUST match the isolcpus= cores in GRUB (Step 13).
     NOTE: ExecStartPre entries in drop-ins ADD to (not replace) the base unit.
           Rate must be set before quantum in every pair — PipeWire internally
           resets quantum when rate changes.

  d) Reload systemd and enable services:
     systemctl daemon-reload
     systemctl enable map2-backend.service
     systemctl enable map2-irq-affinity.service

  e) Create MAP2 config directory (as root):
     mkdir -p /etc/map2

  f) Open ports in firewalld:
     firewall-cmd --permanent --add-port=8080/tcp   # API
     firewall-cmd --permanent --add-port=3000/tcp   # Web UI
     firewall-cmd --reload


================================================================================
  15. IRQ AFFINITY — USB AUDIO PIN
================================================================================

  This pins the USB host controller's interrupt handler to the same CPU cores
  as the audio callback, eliminating cross-core wakeup latency.

  The map2-irq-affinity.service (installed in Step 14) handles this automatically
  on every boot. Verify it is working after first start:

  a) Start the IRQ affinity service:
     systemctl start map2-irq-affinity.service

  b) Check the log:
     cat /var/log/map2-irq-affinity.log
     # Expected: messages about pinning xhci_hcd IRQ to CPUs 4,5

  c) Verify USB audio IRQ is pinned (example with IRQ 38):
     cat /proc/irq/38/smp_affinity_list
     # Expected: 4-5  (or 4,5 depending on kernel format)

     # Find your USB audio IRQ number:
     grep xhci_hcd /proc/interrupts
     # The number in the first column is the IRQ number.

  d) Verify the IRQ kernel thread has RT scheduling:
     ps -eLo pid,comm,cls,rtprio | grep xhci
     # Expected: CLS=FF (FIFO), RTPRIO=70


================================================================================
  16. INSTALL LV2 / VST3 PLUGINS  (optional)
================================================================================

  Skip if you do not need plugin effects (EQ, compression, reverb, amp sims).

  a) Run the LV2 installer (as the 'mm' user):
     cd ~/map2-audio
     python3 lv2_linux_installer.py

     # Or install individual plugin packs:
     bash scripts/build-toobamp.sh      # ToobAmp guitar amp sims
     # Airwindows builds now come from packaged plugin sources; the legacy
     # standalone helper script was removed as stale repo scaffolding.

  b) Verify LV2 plugins are found:
     lilv-utils    2>/dev/null || lv2ls | head -10
     # Should list installed LV2 plugin URIs.

  c) Default LV2 plugin search path:
     ~/.lv2/           (user plugins)
     /usr/lib/lv2/     (system plugins)
     /usr/local/lib/lv2/


================================================================================
  17. MAP2 CONFIG FILE (~/.map2/config.json)
================================================================================

  The MAP2 backend reads its configuration from ~/.map2/config.json.
  Run as the 'mm' user:

  a) Create the config directory:
     mkdir -p ~/.map2

  b) Create config.json with audio settings:
     cat > ~/.map2/config.json << 'EOF'
     {
       "audio": {
         "device":      "hw:UA1000",
         "sample_rate": 48000,
         "buffer_size": 64,
         "channels":    2
       },
       "server": {
         "host": "0.0.0.0",
         "port": 8080
       },
       "mode": "audio",
       "log_level": "INFO"
     }
     EOF

     NOTES:
     - "device": "hw:UA1000"   for Edirol UA-1000 (check: aplay -l for card name)
     - "device": "auto"        to let PipeWire pick the default
     - buffer_size MUST match: clock.force-quantum in the systemd service (Step 14)
                               DEFAULT_BUFFER_SIZE in juce-engine/Source/Common.h
     - Do NOT change the buffer_size in ONLY one place — all three must agree.

  c) Verify ALSA card name (to confirm device string):
     aplay -l
     # Look for: card N: UA1000 [EDIROL UA-1000]
     # Device string: hw:UA1000  or  hw:N  (where N is the card number)


================================================================================
  18. START & VERIFY MAP2
================================================================================

  a) Start MAP2 (as root or with sudo):
     systemctl start map2-backend.service

  b) Check service status:
     systemctl status map2-backend.service
     # Expected: Active: active (running)

  c) Watch live logs:
     journalctl -u map2-backend.service -f
     # Ctrl+C to exit. Look for: "Uvicorn running on http://0.0.0.0:8080"

  d) Test API health endpoint:
     curl http://localhost:8080/api/health
     # Expected: {"status":"ok"} or similar JSON response

  e) Verify PipeWire quantum was set correctly:
     pw-metadata -n settings | grep quantum
     # Expected: clock.force-quantum = '64'

  f) Verify RT scheduling on the audio thread:
     ps -eLo pid,comm,cls,rtprio | grep -E "FF|pipewire|wire"
     # Expected: JUCE audio callback thread shows CLS=FF (FIFO), RTPRIO=80
     # PipeWire data-loop threads should also show FF/55

  g) Access the web UI (if frontend was built in Step 10):
     http://<node-ip>:3000
     # Or from the node itself: http://localhost:3000

  h) Quick start / stop shortcuts:
     cd ~/map2-audio
     ./m2.sh start       # start MAP2 service
     ./m2.sh stop        # stop MAP2 service
     ./m2.sh status      # show service status
     ./m2.sh restart     # restart service
     ./m2.sh logs        # tail live logs


================================================================================
  19. POST-INSTALL VERIFICATION CHECKLIST
================================================================================

  Run these checks after a complete install and reboot.

  KERNEL PARAMETERS (run as any user)
  ------------------------------------
  [ ] cat /proc/cmdline | grep isolcpus
      Expected: isolcpus=4,5 nohz_full=4,5 rcu_nocbs=4,5 threadirqs
                intel_idle.max_cstate=1 processor.max_cstate=1 preempt=full

  [ ] cat /sys/devices/system/cpu/isolated
      Expected: 4-5

  PIPEWIRE (run as mm user)
  -------------------------
  [ ] systemctl --user is-active pipewire.service       → active
  [ ] systemctl --user is-active wireplumber.service    → active
  [ ] pw-cli info                                       → shows Core info
  [ ] pw-metadata -n settings | grep force-quantum      → '64'
  [ ] pw-metadata -n settings | grep force-rate         → '48000'

  AUDIO INTERFACE
  ---------------
  [ ] aplay -l | grep -i ua1000                         → lists Edirol UA-1000
  [ ] ls /proc/asound/cards                             → lists audio cards

  RT SCHEDULING
  -------------
  [ ] ulimit -r                                         → 95 (as mm user)
  [ ] systemctl is-active rtkit-daemon.service          → active
  [ ] ps -eLo pid,comm,cls,rtprio | grep FF             → audio threads with FIFO

  IRQ PINNING
  -----------
  [ ] cat /var/log/map2-irq-affinity.log                → success messages
  [ ] grep xhci_hcd /proc/interrupts                    → find IRQ number
  [ ] cat /proc/irq/<N>/smp_affinity_list               → 4-5

  MAP2 SERVICE
  ------------
  [ ] systemctl is-active map2-backend.service          → active
  [ ] systemctl is-enabled map2-backend.service         → enabled
  [ ] curl -s http://localhost:8080/api/health          → {"status":"ok"}
  [ ] systemctl is-enabled map2-irq-affinity.service    → enabled

  AUTOMATED CHECKER
  -----------------
  Run the Python installer's built-in verifier (no install needed):
    python3 -m installer --validate-ks installer/examples/map2-ks.yaml


================================================================================
  20. OPTIONAL: INSTALL USING THE TUI INSTALLER
================================================================================

  The MAP2 installer automates Steps 5–18 with an Anaconda-style TUI.
  It validates every input in real time and shows educational help for each step.

  QUICK METHOD (automated bash script):
  --------------------------------------
    sudo bash install_on_new_host.sh --mode audio
    # Options:
    #   --mode audio          Dedicated audio node (default)
    #   --mode all-in-one     Audio + web UI + cluster manager
    #   --mode management     Cluster manager only, no audio engine
    #   --dry-run             Preview all changes without applying
    #   --skip-avb            Skip AVB/TSN networking setup
    #   --avb-interface enp0s25   Specify AVB NIC manually

  ENTERPRISE TUI INSTALLER (interactive, educational):
  -----------------------------------------------------
    pip install -r requirements-installer.txt
    python3 -m installer
    # Or: ./install --tui

    Unattended install from Kickstart YAML:
    python3 -m installer --generate-ks audio > my-node.yaml
    # Edit my-node.yaml for your hardware, then:
    sudo python3 -m installer --unattended my-node.yaml

    Dry-run (preview, no changes):
    sudo python3 -m installer --unattended my-node.yaml --dry-run

    Validate a Kickstart YAML before deploying:
    python3 -m installer --validate-ks my-node.yaml


================================================================================
  21. TROUBLESHOOTING QUICK REFERENCE
================================================================================

  SYMPTOM: Audio dropouts / xruns
  --------------------------------
  Check 1:  cat /proc/cmdline | grep isolcpus
            → If missing: GRUB parameters not applied. Did you reboot?

  Check 2:  systemctl status map2-backend.service
            → Look for CpuAffinity: 4 5  in the service properties.

  Check 3:  pw-metadata -n settings | grep force-quantum
            → If not '64': systemctl restart map2-backend.service

  Check 4:  cat /sys/devices/system/cpu/isolated
            → If empty: GRUB boot params not active. Reboot.

  Check 5:  ps -eLo pid,comm,cls,rtprio | grep -E "pipewire|data-loop"
            → All audio threads should show FF (FIFO).
            → If showing TS (normal): rtkit issue. Check ulimit -r and groups mm.

  Fix for most xrun issues:
    sudo systemctl restart map2-backend.service
    pw-metadata -n settings | grep quantum   # verify 64


  SYMPTOM: Service fails to start
  --------------------------------
  Check:    journalctl -u map2-backend.service -n 50 --no-pager
  Common causes:
    - JUCE .so not built: cd ~/map2-audio/juce-engine && cmake --build build
    - Port 8080 in use:   ss -tlnp | grep 8080
    - PipeWire not running (run as mm):
        systemctl --user start pipewire.service wireplumber.service
    - Wrong XDG_RUNTIME_DIR in override.conf (should match your user's UID):
        echo /run/user/$(id -u mm)   → should match value in override.conf


  SYMPTOM: Wrong quantum / latency higher than expected
  -----------------------------------------------------
  Check:   pw-metadata -n settings
  The ExecStartPre lines run in order: rate first, then quantum.
  If another drop-in sets quantum AFTER override.conf's ExecStartPre,
  it wins. Check all drop-ins:
    ls /etc/systemd/system/map2-backend.service.d/
    cat /etc/systemd/system/map2-backend.service.d/*.conf

  Fix:     Add force-quantum=64 to the LAST drop-in alphabetically.
           (override.conf sorts after 10-mode.conf, so override.conf wins.)


  SYMPTOM: isolcpus not working after GRUB update
  ------------------------------------------------
  Verify:  grub2-mkconfig was run after editing /etc/default/grub:
             grub2-mkconfig -o /boot/grub2/grub.cfg
  Then:    reboot
  Verify:  cat /sys/devices/system/cpu/isolated   → 4-5


  SYMPTOM: JUCE build fails
  -------------------------
  Common causes:
    - No internet (FetchContent downloads JUCE): ping github.com
    - Insufficient disk space:  df -h /home
    - Missing build deps:       dnf install -y freetype-devel libX11-devel gtk3-devel

  Clean rebuild:
    cd ~/map2-audio/juce-engine
    rm -rf build/
    cmake -B build -DCMAKE_BUILD_TYPE=Release
    cmake --build build -j$(nproc)


  SYMPTOM: USB audio interface not detected
  ------------------------------------------
  Check:   lsusb | grep -i edirol      (or the interface name)
           aplay -l
           cat /proc/asound/cards
  Try:     Unplug and replug the USB interface.
           Plug directly into a motherboard USB port, not a hub.
  Verify:  The interface's IRQ:  grep xhci_hcd /proc/interrupts


  QUICK DIAGNOSTIC COMMANDS
  --------------------------
  systemctl status map2-backend.service
  journalctl -u map2-backend.service -n 100 --no-pager
  pw-cli info
  pw-top                                  (live PipeWire graph — Ctrl+C to exit)
  pw-metadata -n settings
  cat /proc/cmdline
  cat /sys/devices/system/cpu/isolated
  ps -eLo pid,comm,cls,rtprio | grep -E "FF|map2|pipewire"
  cat /var/log/map2-irq-affinity.log
  curl http://localhost:8080/api/health


  LOGS
  ----
  Service log:         journalctl -u map2-backend.service -f
  IRQ affinity log:    /var/log/map2-irq-affinity.log
  Install log:         /tmp/map2-install-<timestamp>.log
  Installer debug:     /tmp/map2-installer-debug.log
  Verification report: ~/.map2/install-verification.json


================================================================================
  SUMMARY — STEP ORDER (BARE METAL FEDORA SERVER)
================================================================================

  Hardware check        → Step 1
  Fedora install        → Step 2  (outside this guide — use Fedora ISO)
  First boot setup      → Step 3
  Create user mm        → Step 4
  System packages       → Step 5
  Node.js               → Step 6
  Clone repository      → Step 7
  Python venv           → Step 8
  Build JUCE engine     → Step 9   (~15 min first time)
  Build web frontend    → Step 10  (skip for audio-only mode)
  RT limits             → Step 11
  PipeWire config       → Step 12
  GRUB parameters       → Step 13  ← REBOOT REQUIRED after this
  Systemd services      → Step 14
  IRQ affinity          → Step 15
  LV2 plugins           → Step 16  (optional)
  MAP2 config.json      → Step 17
  Start & verify        → Step 18

  OR: run the automated installer and skip to Step 19 verification:
    sudo bash install_on_new_host.sh --mode audio

================================================================================
  MAP2 Audio Platform — https://github.com/matthewmackes/map2-audio
================================================================================
