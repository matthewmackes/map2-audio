# MAP2 Installation Guide (Created by AI. Not Yet Tested - Matt)

This document provides a comprehensive guide for installing the MAP2 Audio Platform on a compatible Linux system. The primary target operating system is **Fedora Server (38 or newer)**, as the automated installation scripts are designed specifically for it.

### Introduction (Created by AI. Not Yet Tested - Matt)

This guide covers two main installation paths: an automated method using the provided convenience script, and a detailed manual method for users who require more control or are installing on a non-Fedora system. The manual method provides insight into the components that make up the platform and their specific dependencies.

### Prerequisites (Created by AI. Not Yet Tested - Matt)

*   **Operating System:** Fedora Server 38+ is strongly recommended. Other modern Linux distributions may work with the manual method, but package names will vary.
*   **Hardware:**
    *   A modern x86-64 CPU (4+ cores recommended).
    *   4GB RAM (8GB+ recommended).
    *   10GB of free disk space.
    *   A class-compliant USB audio interface is recommended for high-performance audio I/O.
    *   For AVB networking features, a compatible Intel I210 or I225 network interface card is required.
*   **Permissions:** You will need `sudo` or root access to install system-level packages and configure services.

---

## Section 1: Automated Installation on Fedora (Recommended) (Created by AI. Not Yet Tested - Matt)

The repository includes a master script, `install_on_new_host.sh`, designed to fully automate the setup on a fresh Fedora system.

### How It Works (Created by AI. Not Yet Tested - Matt)

The `install_on_new_host.sh` script is a high-level wrapper. Its primary function is to clone or update the repository and then execute a Python script (`app/services/backup_service.py`) that dynamically generates a much more detailed and comprehensive rebuild script. This generated script then performs the actual, idempotent installation of all packages, dependencies, and configurations.

### Steps (Created by AI. Not Yet Tested - Matt)

1.  **Clone the Repository:**
    First, clone the MAP2 repository from GitHub.
    ```bash
    git clone https://github.com/matthewmackes/map2-audio.git
    cd map2-audio
    ```

2.  **Run the Installer:**
    Execute the installation script with `sudo`. It is safe to run multiple times.
    ```bash
    sudo bash install_on_new_host.sh
    ```
    The script will perform all necessary steps, including installing packages, configuring the system for real-time audio, and setting up `systemd` services. Upon completion, the system will be fully configured.

---

## Section 2: Manual Installation (All Linux Distributions) (Created by AI. Not Yet Tested - Matt)

This method breaks down the steps performed by the automated script. It is useful for understanding the system's architecture or for installing on a non-Fedora distribution (package names will need to be adapted).

### Step 1: Install System Dependencies (Created by AI. Not Yet Tested - Matt)

You need to install packages for the audio subsystem, Python, Node.js, and C++ build tools.

**On Fedora (using `dnf`):**
```bash
sudo dnf install -y 
    git gcc gcc-c++ cmake make 
    python3 python3-pip python3-devel python3-virtualenv 
    nodejs npm 
    sqlite sqlite-devel 
    pipewire pipewire-alsa pipewire-jack-audio-connection-kit pipewire-jack-audio-connection-kit-devel 
    alsa-utils alsa-lib-devel 
    lv2 lv2-devel lilv lilv-devel suil suil-devel 
    lv2-calf-plugins guitarix-lv2 gxplugins-lv2 lsp-plugins-lv2 
    i2c-tools htop tmux
```

**On Debian/Ubuntu (using `apt`, example package names):**
```bash
sudo apt update
sudo apt install -y 
    git build-essential cmake 
    python3 python3-pip python3-dev python3-venv 
    nodejs npm 
    libsqlite3-dev 
    pipewire pipewire-audio-client-libraries libjack-jackd2-dev 
    libasound2-dev 
    lv2-dev lilv-utils suil-tools 
    calf-plugins guitarix 
    i2c-tools htop tmux
```

### Step 2: Clone the Repository (Created by AI. Not Yet Tested - Matt)
```bash
git clone https://github.com/matthewmackes/map2-audio.git
cd map2-audio
```

### Step 3: Set up Python Environment (Created by AI. Not Yet Tested - Matt)

Install the required Python packages using `pip`.
```bash
pip3 install --user -r requirements.txt
# If requirements.txt is not present, install manually:
pip3 install --user 
    "fastapi" "uvicorn[standard]" 
    "httpx" "aiohttp" 
    "sqlalchemy" "aiosqlite" 
    "textual" "rich" 
    "psutil" "pydantic" "python-multipart"
```

### Step 4: Set up Node.js Frontend (Created by AI. Not Yet Tested - Matt)
Install the frontend dependencies using `npm`.
```bash
# Install root dependencies
npm install

# Install and build the web dashboard
cd web
npm install
npm run build
cd ..
```

### Step 5: Build the C++ Audio Engine (Created by AI. Not Yet Tested - Matt)
Compile the JUCE-based audio engine.
```bash
cd juce-engine
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
cd ..
```
*Note: For advanced features like AVB, you may need to pass additional flags like `-DUSE_AVDECC=ON` and have `libavtp` installed.*

### Step 6: Configure System for Real-Time Audio (Created by AI. Not Yet Tested - Matt)

This is a critical step for achieving low-latency performance.

1.  **Create an `audio` group:**
    ```bash
    sudo groupadd -r audio
    ```

2.  **Add your user to the `audio` group:** (Replace `your_user` with your username)
    ```bash
    sudo usermod -a -G audio your_user
    ```
    **You must log out and log back in for this change to take effect.**

3.  **Set real-time permissions for the `audio` group:**
    Create a new file:
    ```bash
    sudo nano /etc/security/limits.d/99-audio.conf
    ```
    Add the following content:
    ```
    # Permissions for the audio group
    @audio   -  rtprio     95
    @audio   -  memlock    unlimited
    @audio   -  nice       -19
    ```
    Save and exit the editor.

### Step 7: Install Systemd Services (Optional) (Created by AI. Not Yet Tested - Matt)
To have the MAP2 backend run automatically on boot, copy the provided `systemd` unit files.
```bash
sudo cp systemd/map2-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
```

---

## Section 3: Post-Installation (Created by AI. Not Yet Tested - Matt)

### Starting the Platform (Created by AI. Not Yet Tested - Matt)

*   **If you installed the systemd service:**
    ```bash
    # Enable the service to start on boot and start it now
    sudo systemctl enable --now map2-backend.service

    # Check the status
    systemctl status map2-backend.service
    ```

*   **To run manually (without services):**
    ```bash
    # In one terminal, start the backend
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080

    # In another terminal, start the Terminal UI
    textual run tui/app.py
    ```

### Accessing the Interfaces (Created by AI. Not Yet Tested - Matt)
*   **Web Dashboard:** `http://<your-machine-ip>:3000`
*   **API Server:** `http://<your-machine-ip>:8080`
*   **Interactive API Docs:** `http://<your-machine-ip>:8080/docs`

---

## Section 4: Optional Hardware Setup (Created by AI. Not Yet Tested - Matt)

### LCD Display (Created by AI. Not Yet Tested - Matt)
If you have a compatible I2C LCD display, you can run its installation script.
```bash
# Add your user to the i2c group
sudo usermod -a -G i2c your_user
# Log out and log back in

# Run the installer
cd lcd
sudo bash install_lcd.sh
```
This will install dependencies and configure the system to use the LCD display.
