from __future__ import annotations

import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BASE_ENV = {
    "MAP2_SHELL_NO_COLOR": "1",
    "TERM": "dumb",
}


def _run(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged_env = os.environ.copy()
    merged_env.update(BASE_ENV)
    if env:
        merged_env.update(env)
    return subprocess.run(
        list(args),
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
        env=merged_env,
    )


def _run_unchecked(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged_env = os.environ.copy()
    merged_env.update(BASE_ENV)
    if env:
        merged_env.update(env)
    return subprocess.run(
        list(args),
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        env=merged_env,
    )


def _run_shell(command: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return _run("bash", "--noprofile", "--norc", "-c", command, env=env)


def test_installable_profile_script_prints_welcome() -> None:
    result = _run("bash", "branding/map2-welcome.sh")
    assert "MAP2 Audio Platform" in result.stdout
    assert "map2 touchscreen opens Quad UI" in result.stdout
    assert "Ctrl+G shows shell actions" in result.stdout


def test_compatibility_welcome_wrapper_prints_welcome() -> None:
    result = _run("bash", "branding/welcome.sh")
    assert "MAP2 Audio Platform" in result.stdout
    assert "Ctrl+G" in result.stdout


def test_login_issue_generator_renders_rack_style_console_banner() -> None:
    result = _run(
        "bash",
        "branding/map2-login-issue.sh",
        env={
            "MAP2_LOGIN_ISSUE_NO_COLOR": "1",
            "MAP2_LOGIN_ISSUE_VERSION_OVERRIDE": "1.24.25.1",
            "MAP2_LOGIN_ISSUE_HOSTNAME_OVERRIDE": "MAP2-TESTBED",
            "MAP2_LOGIN_ISSUE_MODE_OVERRIDE": "all-in-one",
            "MAP2_LOGIN_USERNAME": "mm",
            "MAP2_LOGIN_PASSWORD_HINT": "password",
        },
    )
    assert "Mackes Audio Platform" in result.stdout
    assert "Carbon studio rack login" in result.stdout
    assert "Version" in result.stdout
    assert "1.24.25.1" in result.stdout
    assert "Host" in result.stdout
    assert "MAP2-TESTBED" in result.stdout
    assert "Mode" in result.stdout
    assert "All-In-One" in result.stdout
    assert "Password" in result.stdout
    assert "password" in result.stdout
    assert "[38;2;" not in result.stdout


def test_map2_help_uses_unified_shell_actions() -> None:
    result = _run("bash", "map2.sh", "help")
    assert "map2 touchscreen" in result.stdout
    assert "Quad Cortex touchscreen app" in result.stdout
    assert "map2 workflow" in result.stdout
    assert "Ctrl+Z" in result.stdout


def test_ink_tui_help_is_clean_and_lists_operator_flags() -> None:
    result = _run("bash", "map2.sh", "ink", "--help")
    assert "Usage: map2-tui [screen] [options]" in result.stdout
    assert "--list-screens" in result.stdout
    assert "--screen SCREEN" in result.stdout
    assert "--no-clear" in result.stdout
    assert "map2-ink-tui@" not in result.stdout
    assert "npm --prefix tui start" not in result.stdout


def test_ink_tui_rejects_unknown_flags_before_rendering() -> None:
    result = _run_unchecked("bash", "map2.sh", "ink", "--bogus")
    assert result.returncode == 2
    assert "Unknown option: --bogus" in result.stderr
    assert "Usage: map2-tui [screen] [options]" in result.stderr


def test_legacy_shell_setup_script_is_deprecated_and_has_no_framework_menu() -> None:
    result = _run("bash", "scripts/map2-shell-setup")
    assert "Deprecated:" in result.stdout
    assert "No action taken." in result.stdout
    assert "Starship" not in result.stdout
    assert "Oh-My-Bash" not in result.stdout


def test_shell_banner_renders_dense_metrics_for_prompt() -> None:
    result = _run_shell(
        """
        source branding/map2-welcome.sh
        export MAP2_SHELL_TEST_STATUS_LINES=$'node_state\\tAll-In-One\\nhealth\\tHealthy\\nbackend\\tConnected\\nxruns\\t0\\nxrun_status\\thealthy\\ncpu\\t12.5\\nmemory\\t43.0\\naudio\\tRunning'
        export VIRTUAL_ENV='/tmp/.venv'
        map2_shell_refresh_status 1
        map2_shell_render_banner 0
        """,
        env={"SSH_CONNECTION": "1 2 3 4"},
    )
    assert "[Mode All-In-One]" in result.stdout
    assert "[XRuns 0]" in result.stdout
    assert "[CPU 12.5%]" in result.stdout
    assert "[Memory 43.0%]" in result.stdout
    assert "AI context" in result.stdout
    assert "venv .venv" in result.stdout
    assert "Ctrl+G" in result.stdout


def test_shell_banner_prints_error_when_metrics_are_unavailable() -> None:
    result = _run_shell(
        """
        source branding/map2-welcome.sh
        export MAP2_SHELL_TEST_STATUS_LINES=$'node_state\\tManagement\\nhealth\\tERROR\\nbackend\\tERROR\\nxruns\\tERROR\\nxrun_status\\terror\\ncpu\\tERROR\\nmemory\\tERROR\\naudio\\tERROR'
        map2_shell_refresh_status 1
        map2_shell_render_banner 17
        """,
    )
    assert "[Exit 17]" in result.stdout
    assert "[Mode Management]" in result.stdout
    assert "[Backend ERROR]" in result.stdout
    assert "[XRuns ERROR]" in result.stdout
    assert "[CPU ERROR]" in result.stdout
    assert "[Memory ERROR]" in result.stdout


def test_shell_prompt_includes_path_git_and_venv_context() -> None:
    result = _run_shell(
        """
        source branding/map2-welcome.sh
        MAP2_SHELL_GIT_BRANCH='main*'
        MAP2_SHELL_VENV_NAME='.venv'
        map2_shell_build_ps1 0
        printf '%s' "$PS1"
        """,
    )
    assert "\\w" in result.stdout
    assert "[main*]" in result.stdout
    assert "(.venv)" in result.stdout


def test_shell_prompt_installer_preserves_existing_prompt_command() -> None:
    result = _run_shell(
        """
        source branding/map2-welcome.sh
        PROMPT_COMMAND='printf existing'
        map2_shell_install_prompt
        printf '%s' "$PROMPT_COMMAND"
        """,
    )
    assert result.stdout.startswith("__map2_prompt_command;")
    assert "printf existing" in result.stdout


def test_shell_fallback_commands_are_defined() -> None:
    result = _run_shell(
        """
        source branding/map2-welcome.sh
        declare -F map2-restart
        declare -F map2-logs
        declare -F map2-status
        declare -F map2-stop
        """,
    )
    assert "map2-restart" in result.stdout
    assert "map2-logs" in result.stdout
    assert "map2-status" in result.stdout
    assert "map2-stop" in result.stdout


def test_shell_aliases_include_touchscreen_launcher() -> None:
    result = _run_shell(
        """
        source branding/map2-welcome.sh
        map2_define_aliases
        alias map2-touchscreen
        """,
    )
    assert "map2-touchscreen" in result.stdout
    assert "map2.sh touchscreen" in result.stdout


def test_profile_bootstrap_repairs_conflicting_map2_alias_after_bootstrap() -> None:
    result = _run_shell(
        """
        source branding/map2-welcome.sh
        export MAP2_WELCOME_BOOTSTRAPPED=1
        alias map2='cd /tmp'
        map2_profile_bootstrap
        alias map2
        """,
    )
    assert "map2='/home/mm/map2-audio/map2.sh'" in result.stdout
