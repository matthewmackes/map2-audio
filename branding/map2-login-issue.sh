#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=branding/map2-welcome.sh
source "${SCRIPT_DIR}/map2-welcome.sh"

map2_login_issue_use_color() {
    [[ "${MAP2_LOGIN_ISSUE_NO_COLOR:-0}" != "1" ]]
}

map2_login_issue_sgr() {
    map2_login_issue_use_color || return 0
    printf '\033[%sm' "$1"
}

map2_login_issue_reset() {
    map2_login_issue_sgr "0"
}

map2_login_issue_border_color() {
    map2_login_issue_sgr "1;94"
}

map2_login_issue_title_color() {
    map2_login_issue_sgr "1;97"
}

map2_login_issue_label_color() {
    map2_login_issue_sgr "0;37"
}

map2_login_issue_value_color() {
    map2_login_issue_sgr "1;96"
}

map2_login_issue_warning_color() {
    map2_login_issue_sgr "1;93"
}

map2_login_issue_product_name() {
    printf '%s\n' "${MAP2_LOGIN_ISSUE_PRODUCT_NAME:-Mackes Audio Platform}"
}

map2_login_issue_version() {
    if [[ -n "${MAP2_LOGIN_ISSUE_VERSION_OVERRIDE:-}" ]]; then
        printf '%s\n' "${MAP2_LOGIN_ISSUE_VERSION_OVERRIDE}"
        return 0
    fi
    map2_version
}

map2_login_issue_hostname() {
    if [[ -n "${MAP2_LOGIN_ISSUE_HOSTNAME_OVERRIDE:-}" ]]; then
        printf '%s\n' "${MAP2_LOGIN_ISSUE_HOSTNAME_OVERRIDE}"
        return 0
    fi
    hostname -s 2>/dev/null || printf '%s\n' "local"
}

map2_login_issue_mode() {
    if [[ -n "${MAP2_LOGIN_ISSUE_MODE_OVERRIDE:-}" ]]; then
        map2_shell_mode_display "${MAP2_LOGIN_ISSUE_MODE_OVERRIDE}"
        return 0
    fi
    map2_shell_detect_node_state
}

map2_login_issue_username() {
    if [[ -n "${MAP2_LOGIN_USERNAME:-}" ]]; then
        printf '%s\n' "${MAP2_LOGIN_USERNAME}"
        return 0
    fi

    if command -v getent >/dev/null 2>&1; then
        local detected
        detected="$(getent passwd 1000 2>/dev/null | cut -d: -f1)"
        if [[ -n "${detected}" ]]; then
            printf '%s\n' "${detected}"
            return 0
        fi
    fi

    printf '%s\n' "mm"
}

map2_login_issue_password_hint() {
    printf '%s\n' "${MAP2_LOGIN_PASSWORD_HINT:-password}"
}

map2_login_issue_note() {
    printf '%s\n' "${MAP2_LOGIN_ISSUE_NOTE:-change after login}"
}

map2_login_issue_repeat() {
    local count char
    count="$1"
    char="$2"
    while (( count > 0 )); do
        printf '%s' "${char}"
        count=$((count - 1))
    done
}

map2_login_issue_pad() {
    printf '%-*.*s' "$1" "$1" "$2"
}

map2_login_issue_center() {
    local width content length left_pad right_pad
    width="$1"
    content="$2"
    length="${#content}"
    if (( length >= width )); then
        printf '%.*s' "$width" "$content"
        return 0
    fi
    left_pad=$(( (width - length) / 2 ))
    right_pad=$(( width - length - left_pad ))
    map2_login_issue_repeat "${left_pad}" " "
    printf '%s' "${content}"
    map2_login_issue_repeat "${right_pad}" " "
}

map2_login_issue_border_line() {
    local left_char right_char border reset
    left_char="$1"
    right_char="$2"
    border="$(map2_login_issue_border_color)"
    reset="$(map2_login_issue_reset)"
    printf '%b%s' "${border}" "${left_char}"
    map2_login_issue_repeat 61 "═"
    printf '%s%b\n' "${right_char}" "${reset}"
}

map2_login_issue_line() {
    local content border reset
    content="$1"
    border="$(map2_login_issue_border_color)"
    reset="$(map2_login_issue_reset)"
    printf '%b║%b %s %b║%b\n' "${border}" "${reset}" "${content}" "${border}" "${reset}"
}

map2_login_issue_color_text() {
    local color reset
    color="$1"
    reset="$(map2_login_issue_reset)"
    printf '%b%s%b' "${color}" "$2" "${reset}"
}

map2_login_issue_cell_plain() {
    local label value
    label="$1"
    value="$2"
    printf '%-29.29s' "$(printf '%-8s %s' "${label}" "${value}")"
}

map2_login_issue_cell_colorize() {
    local plain label value label_color value_color reset colored
    plain="$1"
    label="$2"
    value="$3"
    label_color="$(map2_login_issue_label_color)"
    value_color="${4:-$(map2_login_issue_value_color)}"
    reset="$(map2_login_issue_reset)"
    colored="${plain/${label}/${label_color}${label}${reset}}"
    if [[ -n "${value}" ]]; then
        colored="${colored/${value}/${value_color}${value}${reset}}"
    fi
    printf '%s' "${colored}"
}

map2_login_issue_row() {
    local left_plain right_plain left right value_color
    left_plain="$(map2_login_issue_cell_plain "$1" "$2")"
    right_plain="$(map2_login_issue_cell_plain "$3" "$4")"
    left="$(map2_login_issue_cell_colorize "${left_plain}" "$1" "$2")"
    value_color="$(map2_login_issue_value_color)"
    if [[ -n "${5:-}" ]]; then
        value_color="$5"
    fi
    right="$(map2_login_issue_cell_colorize "${right_plain}" "$3" "$4" "${value_color}")"
    map2_login_issue_line "${left}   ${right}"
}

map2_login_issue_print() {
    local title subtitle version hostname mode username password_hint note
    local title_color border label_color value_color warning_color

    title="$(map2_login_issue_product_name)"
    subtitle="Carbon studio rack login"
    version="$(map2_login_issue_version)"
    hostname="$(map2_login_issue_hostname)"
    mode="$(map2_login_issue_mode)"
    username="$(map2_login_issue_username)"
    password_hint="$(map2_login_issue_password_hint)"
    note="$(map2_login_issue_note)"

    title_color="$(map2_login_issue_title_color)"
    border="$(map2_login_issue_border_color)"
    label_color="$(map2_login_issue_label_color)"
    value_color="$(map2_login_issue_value_color)"
    warning_color="$(map2_login_issue_warning_color)"

    map2_login_issue_border_line "╔" "╗"
    map2_login_issue_line "$(map2_login_issue_color_text "${title_color}" "$(map2_login_issue_center 61 "${title}")")"
    map2_login_issue_line "$(map2_login_issue_color_text "${label_color}" "$(map2_login_issue_center 61 "${subtitle}")")"
    map2_login_issue_border_line "╠" "╣"
    map2_login_issue_row "Version" "${version}" "Host" "${hostname}"
    map2_login_issue_row "Mode" "${mode}" "Login" "${username}"
    map2_login_issue_row "Password" "${password_hint}" "Note" "${note}" "${warning_color}"
    map2_login_issue_border_line "╚" "╝"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    map2_login_issue_print
fi
