#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def run(cmd: list[str], *, check: bool = True, capture: bool = False) -> str:
    print(f"+ {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        cwd=ROOT,
        check=check,
        text=True,
        capture_output=capture,
    )
    if capture:
        return result.stdout.strip()
    return ""


def git_status() -> str:
    return run(["git", "status", "--short"], capture=True)


def ensure_commit(commit_message: str | None) -> None:
    status = git_status()
    if not status:
        print("No local changes to commit.")
        return
    if not commit_message:
        raise SystemExit("Refusing to auto-commit dirty worktree without --commit-message.")
    run(["git", "add", "-A"])
    run(["git", "commit", "-m", commit_message])


def sync_and_push() -> None:
    run(["git", "fetch", "origin", "master"])
    run(["git", "fetch", "gitlab", "master"])

    local_head = run(["git", "rev-parse", "HEAD"], capture=True)
    origin_head = run(["git", "rev-parse", "origin/master"], capture=True)
    if local_head != origin_head:
        merge_base = run(["git", "merge-base", "HEAD", "origin/master"], capture=True)
        if merge_base != origin_head:
            run(["git", "merge", "--no-edit", "origin/master"])

    run(["git", "push", "origin", "master"])
    run(["git", "push", "gitlab", "master"])


def deploy(skip_build: bool) -> None:
    if skip_build and (ROOT / "web" / "dist" / "index.html").exists():
        run(["npm", "--prefix", "web", "run", "deploy:restart"])
    else:
        run(["npm", "--prefix", "web", "run", "deploy"])


def verify() -> None:
    run(["systemctl", "status", "map2-web-prod", "--no-pager"])
    run(["curl", "-I", "--max-time", "10", "http://localhost:3000/"])
    print(f"HEAD={run(['git', 'rev-parse', 'HEAD'], capture=True)}")
    print(f"origin/master={run(['git', 'rev-parse', 'origin/master'], capture=True)}")
    print(f"gitlab/master={run(['git', 'rev-parse', 'gitlab/master'], capture=True)}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the no-pause MAP2 ship loop: commit, sync both remotes, deploy, verify.",
    )
    parser.add_argument(
        "--commit-message",
        help="Commit message to use when the worktree is dirty.",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Use deploy:restart when web/dist/index.html already exists.",
    )
    parser.add_argument(
        "--no-deploy",
        action="store_true",
        help="Commit and push only; skip deploy/restart.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    ensure_commit(args.commit_message)
    sync_and_push()
    if not args.no_deploy:
        deploy(skip_build=args.skip_build)
        verify()
    return 0


if __name__ == "__main__":
    sys.exit(main())
