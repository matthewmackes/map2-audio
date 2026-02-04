#!/bin/bash
# MAP2 Audio Platform - Welcome Message
# Professional branding, service status, and shell customization

# VSCode Dark color palette
COLOR_RESET="\033[0m"
COLOR_PRIMARY="\033[38;2;0;122;204m"    # #007ACC
COLOR_SUCCESS="\033[38;2;78;201;176m"   # #4EC9B0
COLOR_WARNING="\033[38;2;255;204;0m"    # #FFCC00
COLOR_ERROR="\033[38;2;255;85;85m"      # #FF5555
COLOR_ACCENT="\033[38;2;220;220;170m"   # #DCDCAA
COLOR_TEXT="\033[38;2;212;212;212m"     # #D4D4D4
COLOR_DIM="\033[38;2;128;128;128m"      # #808080

# Unicode symbols
CHECK="✓"
CROSS="✗"
BULLET="●"
ARROW="→"
SPEAKER="♪"

# Working directory
MAP2_HOME="/home/mm/map2-audio"

clear

echo -e "${COLOR_PRIMARY}"
cat << 'EOF'
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║    ███╗   ███╗ █████╗ ██████╗ ██████╗      █████╗ ██╗   ██╗██████╗  ║
║    ████╗ ████║██╔══██╗██╔══██╗╚════██╗    ██╔══██╗██║   ██║██╔══██╗ ║
║    ██╔████╔██║███████║██████╔╝ █████╔╝    ███████║██║   ██║██║  ██║ ║
║    ██║╚██╔╝██║██╔══██║██╔═══╝ ██╔═══╝     ██╔══██║██║   ██║██║  ██║ ║
║    ██║ ╚═╝ ██║██║  ██║██║     ███████╗    ██║  ██║╚██████╔╝██████╔╝ ║
║    ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝     ╚══════╝    ╚═╝  ╚═╝ ╚═════╝ ╚═════╝  ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
EOF
echo -e "${COLOR_RESET}"

echo -e "${COLOR_TEXT}Professional Real-Time Audio Processing System${COLOR_RESET}"
echo -e "${COLOR_DIM}Mackes Audio Platform 1-22-25${COLOR_RESET}"
echo ""

# Show platform logo info
if [ -f "$MAP2_HOME/MACKESAUDIOPLATFORM.png" ]; then
    echo -e "${COLOR_SUCCESS}  ${CHECK} Platform logo: MACKESAUDIOPLATFORM.png${COLOR_RESET}"
    echo -e "${COLOR_DIM}    Boot splash and branding assets ready${COLOR_RESET}"
    echo ""
fi

# ═══════════════════════════════════════════════════════════════════════
# HARDWARE STATUS
# ═══════════════════════════════════════════════════════════════════════
echo -e "${COLOR_ACCENT}${SPEAKER} Hardware Status${COLOR_RESET}"
echo -e "${COLOR_DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"

# Real-time audio check
if groups | grep -q audio 2>/dev/null; then
    echo -e "  ${COLOR_SUCCESS}${CHECK}${COLOR_RESET} Real-Time Audio:  ${COLOR_SUCCESS}Configured${COLOR_RESET}"
else
    echo -e "  ${COLOR_WARNING}○${COLOR_RESET} Real-Time Audio:  ${COLOR_DIM}Not configured${COLOR_RESET}"
fi

# Audio devices
if command -v aplay &> /dev/null && aplay -l 2>/dev/null | grep -q card; then
    AUDIO_DEVICES=$(aplay -l 2>/dev/null | grep -c "^card")
    echo -e "  ${COLOR_SUCCESS}${CHECK}${COLOR_RESET} Audio Devices:    ${COLOR_SUCCESS}${AUDIO_DEVICES} detected${COLOR_RESET}"
else
    echo -e "  ${COLOR_WARNING}○${COLOR_RESET} Audio Devices:    ${COLOR_DIM}None detected${COLOR_RESET}"
fi

# MIDI devices
if command -v amidi &> /dev/null && amidi -l 2>/dev/null | grep -q "^Dir"; then
    MIDI_DEVICES=$(amidi -l 2>/dev/null | grep -c "^Dir")
    echo -e "  ${COLOR_SUCCESS}${CHECK}${COLOR_RESET} MIDI Devices:     ${COLOR_SUCCESS}${MIDI_DEVICES} detected${COLOR_RESET}"
else
    echo -e "  ${COLOR_DIM}○${COLOR_RESET} MIDI Devices:     ${COLOR_DIM}None detected${COLOR_RESET}"
fi

# CPU info
CPU_MODEL=$(grep "model name" /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 | sed 's/^ *//' | cut -c1-40)
CPU_CORES=$(grep -c processor /proc/cpuinfo 2>/dev/null || echo "?")
echo -e "  ${COLOR_TEXT}${BULLET}${COLOR_RESET} CPU:              ${COLOR_TEXT}${CPU_CORES} cores${COLOR_RESET} ${COLOR_DIM}(${CPU_MODEL})${COLOR_RESET}"

echo ""

# ═══════════════════════════════════════════════════════════════════════
# CORE SERVICES - Live status from API or process checks
# ═══════════════════════════════════════════════════════════════════════
echo -e "${COLOR_ACCENT}${SPEAKER} Core Services${COLOR_RESET}"
echo -e "${COLOR_DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"

# Backend API - check systemd first, then process
if systemctl is-active map2-backend.service &>/dev/null; then
    BACKEND_STATUS="${COLOR_SUCCESS}${CHECK} Running${COLOR_RESET}"
    BACKEND_MODE="systemd"
elif pgrep -f "uvicorn app.main" > /dev/null 2>&1; then
    BACKEND_STATUS="${COLOR_SUCCESS}${CHECK} Running${COLOR_RESET}"
    BACKEND_MODE="manual"
else
    BACKEND_STATUS="${COLOR_DIM}○ Stopped${COLOR_RESET}"
    BACKEND_MODE=""
fi
echo -e "  ${BACKEND_STATUS}  ${COLOR_TEXT}Backend API${COLOR_RESET}         ${COLOR_DIM}http://localhost:8080${COLOR_RESET}"
echo -e "       ${COLOR_DIM}└─ FastAPI + Service Orchestrator, Plugin Management, MIDI Routing${COLOR_RESET}"
if [ -n "$BACKEND_MODE" ]; then
    echo -e "       ${COLOR_DIM}└─ API Docs: http://localhost:8080/docs${COLOR_RESET}"
fi

# Web Dashboard
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    WEB_STATUS="${COLOR_SUCCESS}${CHECK} Running${COLOR_RESET}"
else
    WEB_STATUS="${COLOR_DIM}○ Stopped${COLOR_RESET}"
fi
echo -e "  ${WEB_STATUS}  ${COLOR_TEXT}Web Dashboard${COLOR_RESET}       ${COLOR_DIM}http://localhost:3000${COLOR_RESET}"
echo -e "       ${COLOR_DIM}└─ React pedalboard editor with real-time meters and plugin controls${COLOR_RESET}"

# Terminal UI
if pgrep -f "textual run" > /dev/null 2>&1; then
    TUI_STATUS="${COLOR_SUCCESS}${CHECK} Running${COLOR_RESET}"
else
    TUI_STATUS="${COLOR_DIM}○ Stopped${COLOR_RESET}"
fi
echo -e "  ${TUI_STATUS}  ${COLOR_TEXT}Terminal UI${COLOR_RESET}         ${COLOR_DIM}SSH/headless interface${COLOR_RESET}"
echo -e "       ${COLOR_DIM}└─ Textual TUI for remote operation without display${COLOR_RESET}"

# LCD Display (optional hardware)
if [ -e "/sys/bus/i2c/devices/i2c-1" ] && i2cdetect -y 1 2>/dev/null | grep -qE "(27|3f)"; then
    LCD_STATUS="${COLOR_SUCCESS}${CHECK} Detected${COLOR_RESET}"
else
    LCD_STATUS="${COLOR_DIM}○ Not detected${COLOR_RESET}"
fi
echo -e "  ${LCD_STATUS}  ${COLOR_TEXT}LCD Display${COLOR_RESET}         ${COLOR_DIM}I2C hardware display${COLOR_RESET}"
echo -e "       ${COLOR_DIM}└─ Dual 20x2 character displays for standalone pedal mode${COLOR_RESET}"

echo ""

# ═══════════════════════════════════════════════════════════════════════
# SERVICE SCRIPTS - with descriptions and paths
# ═══════════════════════════════════════════════════════════════════════
echo -e "${COLOR_ACCENT}${SPEAKER} Service Scripts${COLOR_RESET}"
echo -e "${COLOR_DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"

echo -e "  ${COLOR_PRIMARY}systemctl start map2-backend${COLOR_RESET}"
echo -e "       ${COLOR_DIM}└─ Unified backend via systemd (recommended for production)${COLOR_RESET}"
echo -e "       ${COLOR_DIM}└─ /etc/systemd/system/map2-backend.service${COLOR_RESET}"
echo ""
echo -e "  ${COLOR_PRIMARY}${MAP2_HOME}/scripts/start_web.sh${COLOR_RESET}"
echo -e "       ${COLOR_DIM}└─ Vite development server for web UI (port 3000)${COLOR_RESET}"
echo ""
echo -e "  ${COLOR_PRIMARY}${MAP2_HOME}/scripts/start_tui.sh${COLOR_RESET}"
echo -e "       ${COLOR_DIM}└─ Terminal UI for headless/SSH operation${COLOR_RESET}"

echo ""

# ═══════════════════════════════════════════════════════════════════════
# MODEL & IR FILE PATHS
# ═══════════════════════════════════════════════════════════════════════
echo -e "${COLOR_ACCENT}${SPEAKER} Model & IR File Paths${COLOR_RESET}"
echo -e "${COLOR_DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"
echo -e "  ${COLOR_PRIMARY}NAM Models:${COLOR_RESET}     ${COLOR_TEXT}~/.local/share/map2/nam${COLOR_RESET}"
echo -e "  ${COLOR_PRIMARY}Cabinet IRs:${COLOR_RESET}    ${COLOR_TEXT}~/.local/share/map2/ir/cabinets${COLOR_RESET}"
echo -e "  ${COLOR_PRIMARY}Reverb IRs:${COLOR_RESET}     ${COLOR_TEXT}~/.local/share/map2/ir/reverbs${COLOR_RESET}"

echo ""

# ═══════════════════════════════════════════════════════════════════════
# SHELL CUSTOMIZATION (if not already configured)
# ═══════════════════════════════════════════════════════════════════════
SHELL_ENHANCED=false
if command -v starship &>/dev/null || [ -d "$HOME/.oh-my-bash" ] || [ -d "$HOME/.bash_it" ]; then
    SHELL_ENHANCED=true
fi

if [ "$SHELL_ENHANCED" = false ]; then
    echo -e "${COLOR_ACCENT}${SPEAKER} Shell Customization${COLOR_RESET}"
    echo -e "${COLOR_DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"
    echo -e "  ${COLOR_DIM}Enhance your terminal with one of these popular tools:${COLOR_RESET}"
    echo ""
    echo -e "  ${COLOR_PRIMARY}1. Starship${COLOR_RESET}        ${COLOR_DIM}Rust-powered, blazing fast cross-shell prompt${COLOR_RESET}"
    echo -e "     ${COLOR_TEXT}curl -sS https://starship.rs/install.sh | sh${COLOR_RESET}"
    echo ""
    echo -e "  ${COLOR_PRIMARY}2. Oh-My-Bash${COLOR_RESET}      ${COLOR_DIM}Community framework with 100+ themes${COLOR_RESET}"
    echo -e "     ${COLOR_TEXT}bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/ohmybash/oh-my-bash/master/tools/install.sh)\"${COLOR_RESET}"
    echo ""
    echo -e "  ${COLOR_PRIMARY}3. Powerline-Shell${COLOR_RESET} ${COLOR_DIM}Git-aware segments with color coding${COLOR_RESET}"
    echo -e "     ${COLOR_TEXT}pip install powerline-shell${COLOR_RESET}"
    echo ""
    echo -e "  ${COLOR_PRIMARY}4. Liquid Prompt${COLOR_RESET}   ${COLOR_DIM}Adaptive prompt - shows info only when needed${COLOR_RESET}"
    echo -e "     ${COLOR_TEXT}git clone https://github.com/nojhan/liquidprompt.git ~/liquidprompt${COLOR_RESET}"
    echo ""
    echo -e "  ${COLOR_PRIMARY}5. Bash-it${COLOR_RESET}         ${COLOR_DIM}Modular bash framework with aliases${COLOR_RESET}"
    echo -e "     ${COLOR_TEXT}git clone https://github.com/Bash-it/bash-it.git ~/.bash_it${COLOR_RESET}"
    echo ""
    echo -e "  ${COLOR_DIM}Run: ${COLOR_TEXT}map2-shell-setup${COLOR_RESET} ${COLOR_DIM}for guided installation${COLOR_RESET}"
    echo ""
fi

# ═══════════════════════════════════════════════════════════════════════
# SHELL COMMANDS / ALIASES
# ═══════════════════════════════════════════════════════════════════════
echo -e "${COLOR_ACCENT}${SPEAKER} Quick Commands${COLOR_RESET}"
echo -e "${COLOR_DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"
echo -e "  ${COLOR_PRIMARY}map2-restart${COLOR_RESET}      Full stack restart (backend + frontend)"
echo -e "  ${COLOR_PRIMARY}map2-logs${COLOR_RESET}         Tail both backend and frontend logs"
echo -e "  ${COLOR_PRIMARY}map2-status${COLOR_RESET}       Show service status"
echo -e "  ${COLOR_PRIMARY}map2-stop${COLOR_RESET}         Stop all MAP2 services"
echo ""

# Footer
echo -e "${COLOR_DIM}Documentation: README.md | API: http://localhost:8080/docs${COLOR_RESET}"
echo -e "${COLOR_DIM}════════════════════════════════════════════════════════════════════════════${COLOR_RESET}"

# ═══════════════════════════════════════════════════════════════════════
# DEFINE SHELL FUNCTIONS (available in the current session)
# ═══════════════════════════════════════════════════════════════════════

# Full stack restart with progress feedback
map2-restart() {
    local MAP2_DIR="/home/mm/map2-audio"
    echo ""
    echo -e "\033[0;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
    echo -e "\033[0;34m  MAP2 Audio Platform - Full Stack Restart\033[0m"
    echo -e "\033[0;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
    echo ""

    # Step 1: Stop Backend
    echo -e "\033[1;33m[1/4]\033[0m Stopping Backend (port 8080)..."
    local PIDS=$(lsof -t -i :8080 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "      Found PIDs: $PIDS"
        kill -9 $PIDS 2>/dev/null || true
        sleep 1
        echo -e "      \033[0;32m✓ Backend stopped\033[0m"
    else
        echo -e "      \033[0;32m✓ Port 8080 already free\033[0m"
    fi

    # Step 2: Stop Frontend
    echo -e "\033[1;33m[2/4]\033[0m Stopping Frontend (port 3000)..."
    PIDS=$(lsof -t -i :3000 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "      Found PIDs: $PIDS"
        kill -9 $PIDS 2>/dev/null || true
        sleep 1
        echo -e "      \033[0;32m✓ Frontend stopped\033[0m"
    else
        echo -e "      \033[0;32m✓ Port 3000 already free\033[0m"
    fi

    # Step 3: Start Backend
    echo -e "\033[1;33m[3/4]\033[0m Starting Backend (FastAPI)..."
    cd "$MAP2_DIR"
    .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080 > /tmp/map2-backend.log 2>&1 &
    local BACKEND_PID=$!
    echo "      PID: $BACKEND_PID"
    echo "      Waiting for health check..."
    for i in {1..30}; do
        if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
            echo -e "      \033[0;32m✓ Backend ready\033[0m (http://localhost:8080)"
            break
        fi
        if [ $i -eq 10 ]; then echo "      ... still initializing (10s)"; fi
        if [ $i -eq 20 ]; then echo "      ... scanning plugins (20s)"; fi
        if [ $i -eq 30 ]; then
            echo -e "      \033[0;31m⚠ Backend slow to start\033[0m"
        fi
        sleep 1
    done

    # Step 4: Start Frontend
    echo -e "\033[1;33m[4/4]\033[0m Starting Frontend (Vite)..."
    cd "$MAP2_DIR/web"
    npm run dev -- --host 0.0.0.0 --port 3000 > /tmp/map2-frontend.log 2>&1 &
    local FRONTEND_PID=$!
    cd "$MAP2_DIR"
    echo "      PID: $FRONTEND_PID"
    echo "      Waiting for Vite build..."
    for i in {1..20}; do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            echo -e "      \033[0;32m✓ Frontend ready\033[0m (http://localhost:3000)"
            break
        fi
        if [ $i -eq 10 ]; then echo "      ... compiling TypeScript (10s)"; fi
        if [ $i -eq 20 ]; then
            echo -e "      \033[0;31m⚠ Frontend slow to start\033[0m"
        fi
        sleep 1
    done

    echo ""
    echo -e "\033[0;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
    echo -e "\033[0;32m✓ MAP2 RESTART COMPLETE\033[0m"
    echo -e "\033[0;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
    echo ""
    echo -e "  Frontend:  http://localhost:3000"
    echo -e "  Backend:   http://localhost:8080"
    echo -e "  API Docs:  http://localhost:8080/docs"
    echo ""
}

# Tail both logs
map2-logs() {
    echo -e "\033[0;34mTailing MAP2 logs (Ctrl+C to stop)...\033[0m"
    tail -f /tmp/map2-backend.log /tmp/map2-frontend.log
}

# Show service status
map2-status() {
    echo ""
    echo -e "\033[0;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
    echo -e "\033[0;34m  MAP2 Service Status\033[0m"
    echo -e "\033[0;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
    echo ""

    # Backend
    if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null 2>&1; then
        local BACKEND_PID=$(lsof -t -i :8080 | head -1)
        echo -e "  \033[0;32m✓\033[0m Backend:   \033[0;32mRunning\033[0m (PID: $BACKEND_PID) - http://localhost:8080"
    else
        echo -e "  \033[0;31m✗\033[0m Backend:   \033[0;31mStopped\033[0m"
    fi

    # Frontend
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
        local FRONTEND_PID=$(lsof -t -i :3000 | head -1)
        echo -e "  \033[0;32m✓\033[0m Frontend:  \033[0;32mRunning\033[0m (PID: $FRONTEND_PID) - http://localhost:3000"
    else
        echo -e "  \033[0;31m✗\033[0m Frontend:  \033[0;31mStopped\033[0m"
    fi
    echo ""
}

# Stop all MAP2 services
map2-stop() {
    echo -e "\033[1;33mStopping MAP2 services...\033[0m"

    # Stop backend
    local PIDS=$(lsof -t -i :8080 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        kill -9 $PIDS 2>/dev/null || true
        echo -e "  \033[0;32m✓\033[0m Backend stopped"
    else
        echo -e "  \033[0;90m○\033[0m Backend already stopped"
    fi

    # Stop frontend
    PIDS=$(lsof -t -i :3000 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        kill -9 $PIDS 2>/dev/null || true
        echo -e "  \033[0;32m✓\033[0m Frontend stopped"
    else
        echo -e "  \033[0;90m○\033[0m Frontend already stopped"
    fi

    echo -e "\033[0;32m✓ All services stopped\033[0m"
}
