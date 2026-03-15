#!/usr/bin/env python3
"""Prepare a safe rewrite-window bundle for the T082 repo-bloat cleanup."""

from __future__ import annotations

import argparse
import json
import shutil
import stat
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
NOTICE_TEMPLATE_PATH = REPO_ROOT / "docs" / "templates" / "T082_REPO_REWRITE_COLLABORATOR_NOTICE_TEMPLATE.md"
BLOAT_PATTERNS = [
    "node_modules/**",
    "*/node_modules/**",
    "juce-engine/build*/**",
    "juce-engine/**/build*/**",
    "juce-engine/IntelliFX8VoiceChorusPlugin/**",
    "juce-engine/TweedBassmanPlugin/**",
    "data/repair-backups/**",
]


@dataclass(frozen=True)
class RepoFacts:
    repo_path: Path
    git_dir: str
    is_git_repo: bool
    is_bare: bool
    is_mirror_clone: bool
    head: str | None
    remotes: dict[str, str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare the T082 repo-bloat rewrite window bundle.")
    parser.add_argument("--repo", type=Path, default=REPO_ROOT, help="Git repository or mirror-clone path to inspect.")
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for plan artifacts.")
    parser.add_argument(
        "--push-remotes",
        default="origin,gitlab",
        help="Comma-separated remotes that the generated helper should push during the coordinated window.",
    )
    parser.add_argument(
        "--rewrite-window",
        default="TBD - schedule coordinated rewrite window",
        help="Human-readable rewrite-window string for the collaborator notice.",
    )
    parser.add_argument(
        "--branch",
        default="master",
        help="Primary branch name referenced in the collaborator migration notice (default: master).",
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def run_git(repo: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=False)


def detect_repo_facts(repo: Path) -> RepoFacts:
    git_dir_proc = run_git(repo, ["rev-parse", "--git-dir"])
    if git_dir_proc.returncode != 0:
        return RepoFacts(repo, "", False, False, False, None, {})

    is_bare_proc = run_git(repo, ["rev-parse", "--is-bare-repository"])
    is_mirror_proc = run_git(repo, ["config", "--bool", "remote.origin.mirror"])
    head_proc = run_git(repo, ["rev-parse", "--verify", "HEAD"])
    remote_proc = run_git(repo, ["remote", "-v"])

    remotes: dict[str, str] = {}
    if remote_proc.returncode == 0:
        for line in remote_proc.stdout.splitlines():
            fields = line.strip().split()
            if len(fields) >= 2 and fields[0] not in remotes:
                remotes[fields[0]] = fields[1]

    return RepoFacts(
        repo_path=repo,
        git_dir=git_dir_proc.stdout.strip(),
        is_git_repo=True,
        is_bare=is_bare_proc.stdout.strip().lower() == "true",
        is_mirror_clone=is_mirror_proc.stdout.strip().lower() == "true",
        head=head_proc.stdout.strip() if head_proc.returncode == 0 else None,
        remotes=remotes,
    )


def list_tracked_files(facts: RepoFacts) -> list[str]:
    if not facts.is_git_repo or not facts.head:
        return []

    if facts.is_bare:
        proc = run_git(facts.repo_path, ["ls-tree", "-r", "-z", "--name-only", "HEAD"])
    else:
        proc = run_git(facts.repo_path, ["ls-files", "-z"])
    if proc.returncode != 0:
        return []

    return [item for item in proc.stdout.split("\0") if item]


def match_bloat_counts(paths: list[str]) -> tuple[int, list[dict[str, Any]]]:
    matched_unique: set[str] = set()
    pattern_rows: list[dict[str, Any]] = []
    for pattern in BLOAT_PATTERNS:
        matched = sorted({path for path in paths if PurePosixPath(path).match(pattern)})
        matched_unique.update(matched)
        pattern_rows.append(
            {
                "pattern": pattern,
                "count": len(matched),
                "examples": matched[:5],
            }
        )
    return len(matched_unique), pattern_rows


def render_rewrite_helper(push_remotes: list[str]) -> str:
    if push_remotes:
        remote_check_block = "\n".join(
            [
                f'if ! git -C "$REPO_DIR" remote get-url "{remote}" >/dev/null 2>&1; then\n'
                f'  echo "Missing required remote: {remote}" >&2\n'
                f"  exit 2\n"
                f"fi"
                for remote in push_remotes
            ]
        )
        push_lines = "\n".join(
            [f'  git -C "$REPO_DIR" push {remote} --force --all\n  git -C "$REPO_DIR" push {remote} --force --tags' for remote in push_remotes]
        )
    else:
        remote_check_block = ":"
        push_lines = '  echo "No push remotes configured; skipping push stage."'
    filter_lines = " \\\n  ".join([f"--path-glob '{pattern}'" for pattern in BLOAT_PATTERNS])
    return f"""#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${{1:-$(pwd)}}"
PUSH_ENABLED="${{MAP2_REWRITE_PUSH:-0}}"
CONFIRM_VALUE="${{MAP2_REWRITE_CONFIRM:-}}"

if [[ "$CONFIRM_VALUE" != "YES" ]]; then
  echo "Refusing destructive rewrite. Export MAP2_REWRITE_CONFIRM=YES to continue." >&2
  exit 2
fi

if ! git -C "$REPO_DIR" rev-parse --is-bare-repository >/dev/null 2>&1; then
  echo "Target is not a git repository: $REPO_DIR" >&2
  exit 2
fi

if [[ "$(git -C "$REPO_DIR" rev-parse --is-bare-repository)" != "true" ]]; then
  echo "Rewrite helper must run from a bare mirror clone." >&2
  exit 2
fi

if [[ "$(git -C "$REPO_DIR" config --bool remote.origin.mirror || true)" != "true" ]]; then
  echo "Rewrite helper expects a mirror clone (remote.origin.mirror=true)." >&2
  exit 2
fi

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo is not installed." >&2
  exit 2
fi

{remote_check_block}

git -C "$REPO_DIR" filter-repo \\
  {filter_lines} \\
  --invert-paths

git -C "$REPO_DIR" count-objects -vH
git -C "$REPO_DIR" log --stat -1

if [[ "$PUSH_ENABLED" == "1" ]]; then
{push_lines}
else
  echo "Rewrite completed locally. Set MAP2_REWRITE_PUSH=1 to force-push remotes."
fi
"""


def render_notice(template: str, replacements: dict[str, str]) -> str:
    result = template
    for key, value in replacements.items():
        result = result.replace(f"{{{{{key}}}}}", value)
    return result


def render_markdown(summary: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# T082 Repo Rewrite Window Prep ({summary['checked_at_utc']})")
    lines.append("")
    lines.append(f"- overall_status: `{summary['overall_status']}`")
    lines.append(f"- repo_path: `{summary['repo']['path']}`")
    lines.append(f"- is_bare: `{summary['repo']['is_bare']}`")
    lines.append(f"- is_mirror_clone: `{summary['repo']['is_mirror_clone']}`")
    lines.append(f"- git_filter_repo_available: `{summary['git_filter_repo']['available']}`")
    lines.append(f"- unique_tracked_bloat_files: `{summary['tracked_bloat']['unique_matched_files']}`")
    lines.append("")
    lines.append("## Prerequisites")
    lines.append("")
    lines.append("| Check | Status | Detail |")
    lines.append("|---|---|---|")
    lines.append(f"| Git repo | {summary['checks']['git_repo']['status']} | {summary['checks']['git_repo']['detail']} |")
    lines.append(f"| Mirror clone | {summary['checks']['mirror_clone']['status']} | {summary['checks']['mirror_clone']['detail']} |")
    lines.append(f"| git-filter-repo | {summary['checks']['git_filter_repo']['status']} | {summary['checks']['git_filter_repo']['detail']} |")
    lines.append(f"| Push remotes | {summary['checks']['push_remotes']['status']} | {summary['checks']['push_remotes']['detail']} |")
    lines.append("")
    lines.append("## Artifacts")
    lines.append("")
    lines.append(f"- rewrite_helper: `{summary['artifacts']['rewrite_helper']}`")
    lines.append(f"- collaborator_notice: `{summary['artifacts']['collaborator_notice']}`")
    lines.append("")
    lines.append(f"Conclusion: {summary['conclusion']}")
    lines.append("")
    return "\n".join(lines)


def write_text(path: Path, text: str, executable: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    if executable:
        path.chmod(path.stat().st_mode | stat.S_IEXEC)


def build_summary(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    facts = detect_repo_facts(args.repo.resolve())
    tracked_files = list_tracked_files(facts)
    unique_matched_files, pattern_rows = match_bloat_counts(tracked_files)

    push_remotes = [item.strip() for item in str(args.push_remotes).split(",") if item.strip()]
    git_filter_repo_path = shutil.which("git-filter-repo") or ""
    missing_push_remotes = [remote for remote in push_remotes if remote not in facts.remotes]

    helper_path = output_dir / "run_repo_bloat_rewrite_window.sh"
    notice_path = output_dir / "T082_REPO_REWRITE_COLLABORATOR_NOTICE.md"
    notice_template = NOTICE_TEMPLATE_PATH.read_text(encoding="utf-8")

    write_text(helper_path, render_rewrite_helper(push_remotes), executable=True)
    write_text(
        notice_path,
        render_notice(
            notice_template,
            {
                "rewrite_window": args.rewrite_window,
                "branch_name": args.branch,
                "origin_url": facts.remotes.get("origin", "missing"),
                "gitlab_url": facts.remotes.get("gitlab", "missing"),
                "rewrite_scope": ", ".join(BLOAT_PATTERNS),
                "rewrite_helper": str(helper_path),
            },
        ),
    )

    git_repo_status = "PASS" if facts.is_git_repo else "BLOCKED"
    mirror_status = "PASS" if facts.is_bare and facts.is_mirror_clone else "BLOCKED"
    tool_status = "PASS" if git_filter_repo_path else "BLOCKED"
    remotes_status = "PASS" if not missing_push_remotes else "BLOCKED"

    ready = all(status == "PASS" for status in (git_repo_status, mirror_status, tool_status, remotes_status))
    overall_status = "READY" if ready else "BLOCKED"
    conclusion = (
        "Ready: mirror clone, tool availability, and push remotes are in place for the coordinated rewrite window."
        if ready
        else "Blocked: generated the rewrite helper and collaborator notice, but the rewrite window still needs a prepared mirror clone and/or git-filter-repo."
    )

    summary: dict[str, Any] = {
        "task_id": "T082-subD",
        "checked_at_utc": utc_now(),
        "repo": {
            "path": str(facts.repo_path),
            "git_dir": facts.git_dir,
            "is_git_repo": facts.is_git_repo,
            "is_bare": facts.is_bare,
            "is_mirror_clone": facts.is_mirror_clone,
            "head": facts.head,
            "remotes": facts.remotes,
        },
        "git_filter_repo": {
            "available": bool(git_filter_repo_path),
            "path": git_filter_repo_path or None,
        },
        "tracked_bloat": {
            "unique_matched_files": unique_matched_files,
            "patterns": pattern_rows,
        },
        "checks": {
            "git_repo": {
                "status": git_repo_status,
                "detail": "Git repository detected." if facts.is_git_repo else "Target path is not a git repository.",
            },
            "mirror_clone": {
                "status": mirror_status,
                "detail": (
                    "Bare mirror clone detected."
                    if facts.is_bare and facts.is_mirror_clone
                    else "Rewrite must run from a bare mirror clone, not a day-to-day working tree."
                ),
            },
            "git_filter_repo": {
                "status": tool_status,
                "detail": (
                    f"git-filter-repo available at {git_filter_repo_path}."
                    if git_filter_repo_path
                    else "git-filter-repo is not installed on this host."
                ),
            },
            "push_remotes": {
                "status": remotes_status,
                "detail": (
                    "All required push remotes are configured."
                    if not missing_push_remotes
                    else f"Missing required push remotes: {', '.join(missing_push_remotes)}"
                ),
            },
        },
        "artifacts": {
            "rewrite_helper": str(helper_path),
            "collaborator_notice": str(notice_path),
        },
        "overall_status": overall_status,
        "conclusion": conclusion,
    }

    summary_path = output_dir / "t082-rewrite-window-plan.json"
    markdown_path = output_dir / "T082_REPO_BLOAT_REWRITE_WINDOW_PLAN.md"
    write_text(summary_path, json.dumps(summary, indent=2) + "\n")
    write_text(markdown_path, render_markdown(summary))
    summary["artifacts"]["summary_json"] = str(summary_path)
    summary["artifacts"]["summary_markdown"] = str(markdown_path)
    write_text(summary_path, json.dumps(summary, indent=2) + "\n")
    return (0 if ready else 2), summary


def main() -> int:
    args = parse_args()
    exit_code, summary = build_summary(args)
    print(json.dumps({"overall_status": summary["overall_status"], "summary_file": summary["artifacts"]["summary_json"]}))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
