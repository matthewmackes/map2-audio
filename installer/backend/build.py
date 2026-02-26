"""
installer/backend/build.py
===========================
Build orchestration — JUCE C++ engine (CMake) and React web frontend (npm).

Educational note on the MAP2 build chain:
  1. CMake configures the JUCE 8.0.0 build via FetchContent (downloads JUCE).
  2. cmake --build compiles Map2AudioEngine, JuceAudioIO, JuceAudioGraph, etc.
  3. npm install + npm run build compiles the React/TypeScript frontend.

Build flags:
  -O3 -march=native  — Optimise for the exact CPU of the target machine.
                       Do NOT use march=native in Docker/VM if building for
                       a different target machine — SIGILL will result.
  -ffast-math OFF    — Disabled by default to avoid IEEE 754 violations that
                       cause subtle audio artifacts (NaN propagation issues).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from .executor import CommandExecutor, CommandResult

logger = logging.getLogger("installer.build")


class JUCEBuilder:
    """Configure and build the JUCE audio engine."""

    def __init__(self, executor: CommandExecutor, install_dir: str):
        self.executor    = executor
        self.juce_dir    = Path(install_dir) / "juce-engine"
        self.build_dir   = self.juce_dir / "build"

    def configure(self, jobs: Optional[int] = None) -> CommandResult:
        """Run cmake configuration step."""
        return self.executor.run(
            ["cmake", "-B", str(self.build_dir), "-DCMAKE_BUILD_TYPE=Release"],
            cwd=str(self.juce_dir),
            timeout=300,
        )

    def build(self, jobs: Optional[int] = None) -> CommandResult:
        """Run the cmake build step."""
        cmd = ["cmake", "--build", str(self.build_dir)]
        if jobs:
            cmd += [f"-j{jobs}"]
        return self.executor.run(cmd, cwd=str(self.juce_dir), timeout=1800, retries=1)


class FrontendBuilder:
    """Install dependencies and build the React/TypeScript web frontend."""

    def __init__(self, executor: CommandExecutor, install_dir: str):
        self.executor    = executor
        self.install_dir = Path(install_dir)

    def install_deps(self) -> CommandResult:
        """Run npm install (idempotent — skipped if node_modules exists and up-to-date)."""
        return self.executor.run(
            ["npm", "install", "--prefer-offline"],
            cwd=str(self.install_dir),
            timeout=300,
            retries=2,
        )

    def build(self) -> CommandResult:
        """Run npm run build to compile TypeScript + bundle assets."""
        return self.executor.run(
            ["npm", "run", "build"],
            cwd=str(self.install_dir),
            timeout=300,
        )


class PythonEnvBuilder:
    """Set up the Python virtual environment and install dependencies."""

    def __init__(self, executor: CommandExecutor, install_dir: str, venv_dir: str):
        self.executor    = executor
        self.install_dir = Path(install_dir)
        self.venv_dir    = Path(venv_dir)

    def create_venv(self) -> CommandResult:
        """Create the virtual environment (idempotent)."""
        if self.venv_dir.exists():
            return CommandResult(0, "venv exists", "", self.executor.dry_run, [])
        return self.executor.run(["python3", "-m", "venv", str(self.venv_dir)])

    def install_deps(self) -> CommandResult:
        """Install Python requirements into the venv."""
        pip    = self.venv_dir / "bin" / "pip"
        req    = self.install_dir / "requirements.txt"
        return self.executor.run(
            [str(pip), "install", "-r", str(req), "--upgrade"],
            timeout=300,
            retries=2,
        )
