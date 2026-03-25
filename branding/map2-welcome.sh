#!/bin/bash

map2_repo_root() {
    local candidate script_dir command_path

    if [[ -n "${MAP2_ROOT:-}" && -d "${MAP2_ROOT}" && -f "${MAP2_ROOT}/map2.sh" ]]; then
        printf '%s\n' "${MAP2_ROOT}"
        return 0
    fi

    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    for candidate in \
        "$(cd "${script_dir}/.." 2>/dev/null && pwd)" \
        "/home/mm/map2-audio" \
        "/opt/map2-audio"
    do
        if [[ -n "${candidate}" && -d "${candidate}" && -f "${candidate}/map2.sh" ]]; then
            printf '%s\n' "${candidate}"
            return 0
        fi
    done

    if command_path="$(command -v map2 2>/dev/null)"; then
        candidate="$(cd "$(dirname "${command_path}")" 2>/dev/null && pwd)"
        if [[ -n "${candidate}" && -d "${candidate}" && -f "${candidate}/map2.sh" ]]; then
            printf '%s\n' "${candidate}"
            return 0
        fi
    fi

    pwd
}

map2_product_name() {
    local root product
    root="$(map2_repo_root)"

    if [[ -f "${root}/version.json" ]]; then
        product="$(sed -n 's/.*"product"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${root}/version.json" | head -n 1)"
        if [[ -n "${product}" ]]; then
            printf '%s\n' "${product}"
            return 0
        fi
    fi

    printf '%s\n' "MAP2 Audio Platform"
}

map2_version() {
    local root version
    root="$(map2_repo_root)"

    if [[ -f "${root}/version.json" ]]; then
        version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${root}/version.json" | head -n 1 | tr -cd '0-9')"
        if [[ -n "${version}" ]]; then
            printf '%s\n' "${version}"
            return 0
        fi

        version="$(sed -n 's/.*"fallback_version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${root}/version.json" | head -n 1 | tr -cd '0-9')"
        if [[ -n "${version}" ]]; then
            printf '%s\n' "${version}"
            return 0
        fi
    fi

    if [[ -f "${root}/VERSION" ]]; then
        version="$(tr -cd '0-9' < "${root}/VERSION")"
        if [[ -n "${version}" ]]; then
            printf '%s\n' "${version}"
            return 0
        fi
    fi

    printf '%s\n' "0000000000000001"
}

map2_python() {
    local root
    root="$(map2_repo_root)"
    if [[ -x "${root}/.venv/bin/python3" ]]; then
        printf '%s\n' "${root}/.venv/bin/python3"
        return 0
    fi
    command -v python3
}

map2_run_console() {
    local root python
    root="$(map2_repo_root)"
    python="$(map2_python)"
    cd "${root}"
    exec "${python}" -m tui.app "$@"
}

map2_run_ink_tui() {
    local root
    root="$(map2_repo_root)"
    cd "${root}"
    exec npm --prefix tui start -- "$@"
}

map2_run_touchscreen() {
    local root python
    root="$(map2_repo_root)"
    python="$(map2_python)"
    cd "${root}"
    exec "${python}" -m tui.quad_cortex_touchscreen "$@"
}

map2_shell_use_color() {
    [[ "${MAP2_SHELL_NO_COLOR:-0}" != "1" && -z "${NO_COLOR:-}" && "${TERM:-dumb}" != "dumb" ]]
}

map2_shell_fg() {
    map2_shell_use_color || return 0
    printf '\033[38;2;%s;%s;%sm' "$1" "$2" "$3"
}

map2_shell_bg() {
    map2_shell_use_color || return 0
    printf '\033[48;2;%s;%s;%sm' "$1" "$2" "$3"
}

map2_shell_reset() {
    map2_shell_use_color || return 0
    printf '\033[0m'
}

map2_shell_set_terminal_palette() {
    [[ "${MAP2_SHELL_DISABLE_TERMINAL_COLORS:-0}" == "1" ]] && return 0
    map2_shell_use_color || return 0
    printf '\033]11;#000000\007\033]10;#ffffff\007'
}

map2_shell_title() {
    local primary reset
    primary="$(map2_shell_fg 15 98 254)"
    reset="$(map2_shell_reset)"
    printf '%b%s %s%b\n' "${primary}" "$(map2_product_name)" "$(map2_version)" "${reset}"
    printf '%s\n' '────────────────────────────────────────────────────────────'
}

map2_shell_actions() {
    map2_shell_title
    cat <<'EOF'
map2           Launch the unified console
map2-tui       Launch the Ink terminal UI
map2 ink       Launch the Ink terminal UI
map2-info      Open the live Dashboard route
map2 touchscreen
               Launch the Quad Cortex touchscreen app
map2-touchscreen
               Alias for the Quad Cortex touchscreen app
map2 cluster   Open Cluster operations
map2 diag      Open Diagnostics
map2 workflow  Open setup and install workflows
Shell banner   Dense Carbon telemetry above each prompt
Ctrl+G         Show this action menu
Ctrl+Z         Suspend the console to bash and resume with fg
EOF
}

map2_shell_welcome() {
    map2_shell_set_terminal_palette
    map2_shell_title
    printf '%s\n' 'map2 launches the unified console · map2-tui launches the Ink terminal UI · map2 touchscreen opens Quad UI · Ctrl+G shows shell actions.'
}

map2_shell_mode_display() {
    local mode
    mode="${1:-${MAP2_DEPLOYMENT_MODE:-unknown}}"
    mode="${mode//_/-}"
    case "${mode,,}" in
        all-in-one|all-in\ one|all\ in\ one)
            printf '%s\n' "All-In-One"
            ;;
        audio|audio-node)
            printf '%s\n' "Audio"
            ;;
        management|manager)
            printf '%s\n' "Management"
            ;;
        *)
            printf '%s\n' "Unknown"
            ;;
    esac
}

map2_shell_detect_node_state() {
    local raw_mode
    if [[ -n "${MAP2_SHELL_NODE_STATE_OVERRIDE:-}" ]]; then
        map2_shell_mode_display "${MAP2_SHELL_NODE_STATE_OVERRIDE}"
        return 0
    fi

    if [[ -f /etc/guitarfx-mode.conf ]]; then
        raw_mode="$(sed -n 's/^MODE=["'\'']\{0,1\}\([^"'\'']*\)["'\'']\{0,1\}$/\1/p' /etc/guitarfx-mode.conf | head -n 1)"
        if [[ -n "${raw_mode}" ]]; then
            map2_shell_mode_display "${raw_mode}"
            return 0
        fi
    fi

    map2_shell_mode_display "${MAP2_DEPLOYMENT_MODE:-unknown}"
}

map2_shell_status_defaults() {
    MAP2_SHELL_NODE_STATE="$(map2_shell_detect_node_state)"
    MAP2_SHELL_HEALTH="ERROR"
    MAP2_SHELL_BACKEND="ERROR"
    MAP2_SHELL_XRUNS="ERROR"
    MAP2_SHELL_XRUN_STATUS="error"
    MAP2_SHELL_CPU="ERROR"
    MAP2_SHELL_MEMORY="ERROR"
    MAP2_SHELL_AUDIO="ERROR"
}

map2_shell_load_status_lines() {
    local key value
    map2_shell_status_defaults

    while IFS=$'\t' read -r key value; do
        case "${key}" in
            node_state)
                MAP2_SHELL_NODE_STATE="${value:-${MAP2_SHELL_NODE_STATE}}"
                ;;
            health)
                MAP2_SHELL_HEALTH="${value:-ERROR}"
                ;;
            backend)
                MAP2_SHELL_BACKEND="${value:-ERROR}"
                ;;
            xruns)
                MAP2_SHELL_XRUNS="${value:-ERROR}"
                ;;
            xrun_status)
                MAP2_SHELL_XRUN_STATUS="${value:-error}"
                ;;
            cpu)
                MAP2_SHELL_CPU="${value:-ERROR}"
                ;;
            memory)
                MAP2_SHELL_MEMORY="${value:-ERROR}"
                ;;
            audio)
                MAP2_SHELL_AUDIO="${value:-ERROR}"
                ;;
        esac
    done
}

map2_shell_collect_status_lines() {
    local python api_url

    if [[ -n "${MAP2_SHELL_TEST_STATUS_LINES:-}" ]]; then
        printf '%s\n' "${MAP2_SHELL_TEST_STATUS_LINES}"
        return 0
    fi

    python="$(map2_python 2>/dev/null || true)"
    if [[ -z "${python}" ]]; then
        return 1
    fi

    api_url="${MAP2_SHELL_API_URL:-http://localhost:8080}"
    "${python}" - "${api_url}" <<'PY'
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

api_url = sys.argv[1].rstrip("/")
mode_path = pathlib.Path("/etc/guitarfx-mode.conf")


def clean(value):
    text = str(value)
    return text.replace("\t", " ").replace("\n", " ").strip()


def emit(key, value):
    print(f"{key}\t{clean(value)}")


def mode_display(raw):
    value = str(raw or "").strip().lower().replace("_", "-")
    if value in {"all-in-one", "all in one"}:
        return "All-In-One"
    if value in {"audio", "audio-node"}:
        return "Audio"
    if value in {"management", "manager"}:
        return "Management"
    return "Unknown"


def read_mode():
    override = os.environ.get("MAP2_SHELL_NODE_STATE_OVERRIDE")
    if override:
        return mode_display(override)
    if mode_path.exists():
        for line in mode_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("MODE="):
                return mode_display(line.split("=", 1)[1].strip().strip('"').strip("'"))
    return mode_display(os.environ.get("MAP2_DEPLOYMENT_MODE", "unknown"))


def fetch_json(path):
    request = urllib.request.Request(f"{api_url}{path}", headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=0.35) as response:
        return json.loads(response.read().decode("utf-8"))


health_payload = None
audio_status_payload = None
xrun_payload = None

try:
    health_payload = fetch_json("/api/health")
except Exception:
    pass

try:
    xrun_payload = fetch_json("/api/audio/health/xruns")
except Exception:
    pass

if xrun_payload is None:
    try:
        audio_status_payload = fetch_json("/api/audio/status")
    except Exception:
        pass

backend_value = "Connected" if any(payload is not None for payload in (health_payload, xrun_payload, audio_status_payload)) else "ERROR"
health_value = "ERROR"
cpu_value = "ERROR"
memory_value = "ERROR"
audio_value = "ERROR"
xruns_value = "ERROR"
xrun_status_value = "error"

if isinstance(health_payload, dict):
    health_status = str(health_payload.get("status", "unknown")).strip().lower()
    health_value = {
        "healthy": "Healthy",
        "degraded": "Degraded",
        "critical": "Critical",
    }.get(health_status, "Unknown")
    cpu_value = f"{float(health_payload['cpu_percent']):.1f}" if isinstance(health_payload.get("cpu_percent"), (int, float)) else "ERROR"
    memory_value = f"{float(health_payload['memory_percent']):.1f}" if isinstance(health_payload.get("memory_percent"), (int, float)) else "ERROR"
    audio_value = "Running" if health_payload.get("audio_running") else "Stopped"

if isinstance(xrun_payload, dict) and xrun_payload.get("available", True):
    xrun_status_raw = str(xrun_payload.get("status", "healthy")).strip().lower()
    xruns_value = str(xrun_payload.get("total_xruns", "ERROR"))
    xrun_status_value = xrun_status_raw
elif isinstance(audio_status_payload, dict):
    xruns_value = str(
        audio_status_payload.get(
            "total_xruns",
            audio_status_payload.get("xruns", "ERROR"),
        )
    )
    audio_value = "Running" if audio_status_payload.get("running") else "Stopped"
    if xruns_value == "0":
        xrun_status_value = "healthy"
    elif xruns_value == "ERROR":
        xrun_status_value = "error"
    else:
        xrun_status_value = "warning"

emit("node_state", read_mode())
emit("backend", backend_value)
emit("health", health_value)
emit("xruns", xruns_value)
emit("xrun_status", xrun_status_value)
emit("cpu", cpu_value)
emit("memory", memory_value)
emit("audio", audio_value)
PY
}

map2_shell_refresh_status() {
    local force now ttl lines
    force="${1:-0}"
    now="$(date +%s)"
    ttl="${MAP2_SHELL_CACHE_TTL_SECONDS:-1}"
    ttl="${ttl%%.*}"
    if [[ -z "${ttl}" || "${ttl}" -lt 1 ]]; then
        ttl=1
    fi

    if [[ "${force}" != "1" && -n "${MAP2_SHELL_LAST_REFRESH_EPOCH:-}" ]]; then
        if (( now - MAP2_SHELL_LAST_REFRESH_EPOCH < ttl )); then
            return 0
        fi
    fi

    lines="$(map2_shell_collect_status_lines 2>/dev/null || true)"
    if [[ -n "${lines}" ]]; then
        map2_shell_load_status_lines <<< "${lines}"
    else
        map2_shell_status_defaults
    fi

    MAP2_SHELL_LAST_REFRESH_EPOCH="${now}"
}

map2_shell_refresh_context() {
    local branch dirty workspace

    MAP2_SHELL_WORKSPACE="$(basename "${PWD}")"
    MAP2_SHELL_GIT_BRANCH=""
    MAP2_SHELL_VENV_NAME=""

    if workspace="$(git rev-parse --show-toplevel 2>/dev/null)"; then
        MAP2_SHELL_WORKSPACE="$(basename "${workspace}")"
        branch="$(git -C "${workspace}" symbolic-ref --quiet --short HEAD 2>/dev/null || git -C "${workspace}" rev-parse --short HEAD 2>/dev/null)"
        if [[ -n "${branch}" ]]; then
            dirty=""
            if [[ -n "$(git -C "${workspace}" status --porcelain --ignore-submodules=dirty --untracked-files=no 2>/dev/null)" ]]; then
                dirty="*"
            fi
            MAP2_SHELL_GIT_BRANCH="${branch}${dirty}"
        fi
    fi

    if [[ -n "${VIRTUAL_ENV:-}" ]]; then
        MAP2_SHELL_VENV_NAME="$(basename "${VIRTUAL_ENV}")"
    fi
}

map2_shell_case_title() {
    local value
    value="${1:-ERROR}"
    case "${value,,}" in
        connected)
            printf '%s\n' "Connected"
            ;;
        healthy)
            printf '%s\n' "Healthy"
            ;;
        degraded)
            printf '%s\n' "Degraded"
            ;;
        critical)
            printf '%s\n' "Critical"
            ;;
        running)
            printf '%s\n' "Running"
            ;;
        stopped)
            printf '%s\n' "Stopped"
            ;;
        error)
            printf '%s\n' "ERROR"
            ;;
        *)
            printf '%s\n' "${value}"
            ;;
    esac
}

map2_shell_metric_kind() {
    local value threshold_warning threshold_error
    value="${1:-ERROR}"
    threshold_warning="${2:-70}"
    threshold_error="${3:-85}"

    if [[ "${value}" == "ERROR" ]]; then
        printf '%s\n' "error"
        return 0
    fi

    value="${value%%.*}"
    if [[ -z "${value}" ]]; then
        value=0
    fi

    if (( value >= threshold_error )); then
        printf '%s\n' "error"
    elif (( value >= threshold_warning )); then
        printf '%s\n' "warning"
    else
        printf '%s\n' "primary"
    fi
}

map2_shell_xrun_kind() {
    case "${MAP2_SHELL_XRUN_STATUS,,}" in
        healthy)
            printf '%s\n' "success"
            ;;
        warning)
            printf '%s\n' "warning"
            ;;
        critical|error)
            printf '%s\n' "error"
            ;;
        *)
            if [[ "${MAP2_SHELL_XRUNS}" == "0" ]]; then
                printf '%s\n' "success"
            elif [[ "${MAP2_SHELL_XRUNS}" == "ERROR" ]]; then
                printf '%s\n' "error"
            else
                printf '%s\n' "warning"
            fi
            ;;
    esac
}

map2_shell_state_kind() {
    case "${1,,}" in
        connected|healthy|running)
            printf '%s\n' "success"
            ;;
        degraded|warning|unknown)
            printf '%s\n' "warning"
            ;;
        critical|stopped|error)
            printf '%s\n' "error"
            ;;
        *)
            printf '%s\n' "neutral"
            ;;
    esac
}

map2_shell_percent_text() {
    if [[ "${1}" == "ERROR" ]]; then
        printf '%s\n' "ERROR"
    else
        printf '%s%%\n' "${1}"
    fi
}

map2_shell_join_dots() {
    local first=1 item
    for item in "$@"; do
        if [[ ${first} -eq 0 ]]; then
            printf ' · '
        fi
        printf '%s' "${item}"
        first=0
    done
}

map2_shell_tag() {
    local label value kind fg bg reset
    label="${1}"
    value="${2}"
    kind="${3:-neutral}"

    case "${kind}" in
        primary)
            fg="255 255 255"
            bg="15 98 254"
            ;;
        success)
            fg="255 255 255"
            bg="66 190 101"
            ;;
        warning)
            fg="22 22 22"
            bg="241 194 27"
            ;;
        error)
            fg="255 255 255"
            bg="218 30 40"
            ;;
        neutral)
            fg="255 255 255"
            bg="57 57 57"
            ;;
        *)
            fg="255 255 255"
            bg="82 82 82"
            ;;
    esac

    if ! map2_shell_use_color; then
        printf '[%s %s]' "${label}" "${value}"
        return 0
    fi

    read -r fg_r fg_g fg_b <<< "${fg}"
    read -r bg_r bg_g bg_b <<< "${bg}"
    reset="$(map2_shell_reset)"
    printf '%b %s %s %b' "$(map2_shell_bg "${bg_r}" "${bg_g}" "${bg_b}")$(map2_shell_fg "${fg_r}" "${fg_g}" "${fg_b}")" "${label}" "${value}" "${reset}"
}

map2_shell_render_title_line() {
    local marker muted reset hostname timestamp
    marker="$(map2_shell_fg 15 98 254)"
    muted="$(map2_shell_fg 198 198 198)"
    reset="$(map2_shell_reset)"
    hostname="${MAP2_SHELL_HOSTNAME:-$(hostname -s 2>/dev/null || printf '%s' 'local')}"
    timestamp="$(date +%H:%M:%S)"
    printf '%b▸%b %s %s%b' "${marker}" "${reset}" "$(map2_product_name)" "$(map2_version)" "${reset}"
    printf '%b · host %s · %s%b\n' "${muted}" "${hostname}" "${timestamp}" "${reset}"
}

map2_shell_render_metrics_line() {
    local tags=()
    local last_status="${1:-0}"

    if (( last_status != 0 )); then
        tags+=("$(map2_shell_tag "Exit" "${last_status}" "error")")
    fi

    tags+=("$(map2_shell_tag "Mode" "${MAP2_SHELL_NODE_STATE}" "primary")")
    tags+=("$(map2_shell_tag "Health" "$(map2_shell_case_title "${MAP2_SHELL_HEALTH}")" "$(map2_shell_state_kind "${MAP2_SHELL_HEALTH}")")")
    tags+=("$(map2_shell_tag "Backend" "$(map2_shell_case_title "${MAP2_SHELL_BACKEND}")" "$(map2_shell_state_kind "${MAP2_SHELL_BACKEND}")")")
    tags+=("$(map2_shell_tag "XRuns" "${MAP2_SHELL_XRUNS}" "$(map2_shell_xrun_kind)")")
    tags+=("$(map2_shell_tag "CPU" "$(map2_shell_percent_text "${MAP2_SHELL_CPU}")" "$(map2_shell_metric_kind "${MAP2_SHELL_CPU}" 70 85)")")
    tags+=("$(map2_shell_tag "Memory" "$(map2_shell_percent_text "${MAP2_SHELL_MEMORY}")" "$(map2_shell_metric_kind "${MAP2_SHELL_MEMORY}" 75 90)")")
    tags+=("$(map2_shell_tag "Audio" "$(map2_shell_case_title "${MAP2_SHELL_AUDIO}")" "$(map2_shell_state_kind "${MAP2_SHELL_AUDIO}")")")

    printf '%s\n' "${tags[*]}"
}

map2_shell_render_context_line() {
    local muted primary reset parts=()
    muted="$(map2_shell_fg 198 198 198)"
    primary="$(map2_shell_fg 120 169 255)"
    reset="$(map2_shell_reset)"

    parts+=("workspace ${MAP2_SHELL_WORKSPACE}")
    if [[ -n "${MAP2_SHELL_GIT_BRANCH}" ]]; then
        parts+=("git ${MAP2_SHELL_GIT_BRANCH}")
    fi
    if [[ -n "${MAP2_SHELL_VENV_NAME}" ]]; then
        parts+=("venv ${MAP2_SHELL_VENV_NAME}")
    fi
    if [[ -n "${SSH_CONNECTION:-}" ]]; then
        parts+=("ssh active")
    fi
    parts+=("map2")
    parts+=("map2-tui")
    parts+=("map2 diag")
    parts+=("map2 touchscreen")
    parts+=("map2 workflow")
    parts+=("Ctrl+G")

    printf '%bAI context%b · %b%s%b\n' "${primary}" "${reset}" "${muted}" "$(map2_shell_join_dots "${parts[@]}")" "${reset}"
}

map2_shell_render_banner() {
    local last_status="${1:-0}"
    map2_shell_refresh_context
    map2_shell_render_title_line
    map2_shell_render_metrics_line "${last_status}"
    map2_shell_render_context_line
}

map2_shell_build_ps1() {
    local last_status ps1_reset ps1_fg ps1_primary ps1_success ps1_error ps1_muted
    local prompt_symbol branch_segment venv_segment

    last_status="${1:-0}"
    ps1_reset=""
    ps1_fg=""
    ps1_primary=""
    ps1_success=""
    ps1_error=""
    ps1_muted=""

    if map2_shell_use_color; then
        ps1_reset='\[\033[0m\]'
        ps1_fg='\[\033[38;2;255;255;255m\]'
        ps1_primary='\[\033[38;2;15;98;254m\]'
        ps1_success='\[\033[38;2;66;190;101m\]'
        ps1_error='\[\033[38;2;218;30;40m\]'
        ps1_muted='\[\033[38;2;198;198;198m\]'
    fi

    prompt_symbol="${ps1_success}▸${ps1_reset}"
    if (( last_status != 0 )); then
        prompt_symbol="${ps1_error}▸${ps1_reset}"
    fi

    branch_segment=""
    if [[ -n "${MAP2_SHELL_GIT_BRANCH}" ]]; then
        branch_segment=" ${ps1_muted}[${MAP2_SHELL_GIT_BRANCH}]${ps1_reset}"
    fi

    venv_segment=""
    if [[ -n "${MAP2_SHELL_VENV_NAME}" ]]; then
        venv_segment=" ${ps1_primary}(${MAP2_SHELL_VENV_NAME})${ps1_reset}"
    fi

    PS1="${prompt_symbol} ${ps1_fg}\\w${ps1_reset}${branch_segment}${venv_segment} \\$ "
}

__map2_prompt_command() {
    local last_status
    last_status=$?
    map2_shell_refresh_status
    map2_shell_render_banner "${last_status}"
    map2_shell_build_ps1 "${last_status}"
    return 0
}

map2_shell_install_prompt() {
    [[ "${MAP2_SHELL_DISABLE_PROMPT:-0}" == "1" ]] && return 0
    if [[ "${PROMPT_COMMAND:-}" == *__map2_prompt_command* ]]; then
        return 0
    fi
    if [[ -n "${PROMPT_COMMAND:-}" ]]; then
        PROMPT_COMMAND="__map2_prompt_command; ${PROMPT_COMMAND}"
    else
        PROMPT_COMMAND="__map2_prompt_command"
    fi
}

map2-restart() {
    local map2_dir backend_pid frontend_pid pids i

    map2_dir="$(map2_repo_root)"
    echo ""
    echo "MAP2 restart"
    echo "────────────────────────────────────────────────────────────"

    echo "[1/4] Stopping backend (port 8080)..."
    pids="$(lsof -t -i :8080 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
        kill -9 ${pids} 2>/dev/null || true
        sleep 1
        echo "  backend stopped"
    else
        echo "  backend already stopped"
    fi

    echo "[2/4] Stopping frontend (port 3000)..."
    pids="$(lsof -t -i :3000 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
        kill -9 ${pids} 2>/dev/null || true
        sleep 1
        echo "  frontend stopped"
    else
        echo "  frontend already stopped"
    fi

    echo "[3/4] Starting backend..."
    (
        cd "${map2_dir}"
        "$(map2_python)" -m uvicorn app.main:app --host 0.0.0.0 --port 8080 > /tmp/map2-backend.log 2>&1 &
        backend_pid=$!
        echo "${backend_pid}" > /tmp/map2-backend.pid
    )
    backend_pid="$(cat /tmp/map2-backend.pid 2>/dev/null || true)"
    rm -f /tmp/map2-backend.pid
    echo "  pid: ${backend_pid:-unknown}"
    for i in {1..30}; do
        if curl -fsS http://localhost:8080/api/health >/dev/null 2>&1; then
            echo "  backend ready: http://localhost:8080"
            break
        fi
        sleep 1
    done

    echo "[4/4] Starting frontend..."
    (
        cd "${map2_dir}/web"
        npm run build > /tmp/map2-frontend-build.log 2>&1
        npm run serve -- --host 0.0.0.0 --port 3000 > /tmp/map2-frontend.log 2>&1 &
        frontend_pid=$!
        echo "${frontend_pid}" > /tmp/map2-frontend.pid
    )
    frontend_pid="$(cat /tmp/map2-frontend.pid 2>/dev/null || true)"
    rm -f /tmp/map2-frontend.pid
    echo "  pid: ${frontend_pid:-unknown}"
    for i in {1..20}; do
        if curl -fsS http://localhost:3000 >/dev/null 2>&1; then
            echo "  frontend ready: http://localhost:3000"
            break
        fi
        sleep 1
    done

    echo ""
    echo "MAP2 restart complete"
    echo "  frontend: http://localhost:3000"
    echo "  backend:  http://localhost:8080"
    echo "  docs:     http://localhost:8080/docs"
}

map2-logs() {
    echo "Tailing MAP2 logs (Ctrl+C to stop)..."
    tail -f /tmp/map2-backend.log /tmp/map2-frontend.log
}

map2-status() {
    local backend_pid frontend_pid

    echo ""
    echo "MAP2 service status"
    echo "────────────────────────────────────────────────────────────"

    if backend_pid="$(lsof -t -i :8080 2>/dev/null | head -1)"; then
        if [[ -n "${backend_pid}" ]]; then
            echo "backend:  running (PID ${backend_pid}) http://localhost:8080"
        else
            echo "backend:  stopped"
        fi
    else
        echo "backend:  stopped"
    fi

    if frontend_pid="$(lsof -t -i :3000 2>/dev/null | head -1)"; then
        if [[ -n "${frontend_pid}" ]]; then
            echo "frontend: running (PID ${frontend_pid}) http://localhost:3000"
        else
            echo "frontend: stopped"
        fi
    else
        echo "frontend: stopped"
    fi
    echo ""
}

map2-stop() {
    local pids

    echo "Stopping MAP2 services..."
    pids="$(lsof -t -i :8080 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
        kill -9 ${pids} 2>/dev/null || true
        echo "  backend stopped"
    else
        echo "  backend already stopped"
    fi

    pids="$(lsof -t -i :3000 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
        kill -9 ${pids} 2>/dev/null || true
        echo "  frontend stopped"
    else
        echo "  frontend already stopped"
    fi

    echo "All services stopped"
}

map2_define_aliases() {
    local root
    root="$(map2_repo_root)"
    unalias map2 2>/dev/null || true
    unalias map2-tui 2>/dev/null || true
    unalias map2-ink 2>/dev/null || true
    unalias map2-touchscreen 2>/dev/null || true
    unalias m2 2>/dev/null || true
    unalias map2-info 2>/dev/null || true
    unalias map2-install 2>/dev/null || true
    alias map2="${root}/map2.sh"
    alias map2-tui="${root}/map2-tui"
    alias map2-ink="${root}/map2-tui"
    alias map2-touchscreen="${root}/map2.sh touchscreen"
    alias m2="${root}/m2.sh"
    alias map2-info="${root}/map2-info"
    alias map2-install="${root}/map2-install"
    if command -v bind >/dev/null 2>&1; then
        bind -x '"\C-g":"map2_shell_actions"'
    fi
}

map2_profile_bootstrap() {
    map2_define_aliases
    map2_shell_install_prompt

    if [[ "${MAP2_WELCOME_BOOTSTRAPPED:-0}" == "1" ]]; then
        return
    fi

    export MAP2_WELCOME_BOOTSTRAPPED=1
    MAP2_SHELL_HOSTNAME="$(hostname -s 2>/dev/null || printf '%s' 'local')"
    map2_shell_welcome
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    map2_shell_welcome
elif [[ $- == *i* ]]; then
    map2_profile_bootstrap
fi
