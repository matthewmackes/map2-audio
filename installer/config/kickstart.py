"""
installer/config/kickstart.py
==============================
Kickstart-inspired YAML serialisation / deserialisation for InstallerConfig.

Anaconda analogy:
  Fedora's Kickstart files are plain-text descriptions of an install that can
  be passed to Anaconda with `inst.ks=...` for fully automated deployments.
  This module provides the same capability: save current TUI choices to YAML,
  reload them later, validate, and replay without any user interaction.

Workflow:
  Generate template:  python -m installer --generate-ks > map2-ks.yaml
  Unattended install: python -m installer --unattended map2-ks.yaml
  Dry-run preview:    python -m installer --unattended map2-ks.yaml --dry-run

Educational note on idempotency:
  A well-written Kickstart file can be replayed on the same machine and produce
  the same result.  We achieve this in the backend drivers by checking current
  state before applying changes (e.g., checking if a package is already
  installed before running dnf install).
"""

from __future__ import annotations

import datetime
from datetime import timezone as _tz
import json
from pathlib import Path
from typing import Union

import yaml

from .schema import InstallerConfig


def save_kickstart(config: InstallerConfig, path: Union[str, Path]) -> None:
    """
    Serialise InstallerConfig to a YAML Kickstart file.

    We use JSON round-trip (model_dump → json_compatible dict) so that
    Path objects and Enums are rendered as plain strings in YAML, which
    keeps the file human-readable and diff-friendly.

    Args:
        config: Fully populated installer config.
        path:   Destination file path (created / overwritten).
    """
    path = Path(path)
    # Stamp the generation time so users can track config versions
    config.generated_at = datetime.datetime.now(_tz.utc).isoformat()

    # model_dump with mode="json" converts Enums to their .value strings
    # and Path objects to str — safe for YAML serialisation.
    data = json.loads(config.model_dump_json())

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        # dump with sort_keys=False preserves field declaration order,
        # which mirrors the installer screen order (more readable for users).
        yaml.dump(
            data,
            f,
            default_flow_style=False,
            sort_keys=False,
            allow_unicode=True,
        )


def load_kickstart(path: Union[str, Path]) -> InstallerConfig:
    """
    Load and validate a Kickstart YAML file into an InstallerConfig.

    Pydantic v2 performs full validation here — if the YAML has an invalid
    buffer_size or malformed CPU core range, a clear ValidationError is raised
    before any changes are made to the system.  This is the "validate first,
    act second" principle central to safe automated installers.

    Args:
        path: Path to the YAML kickstart file.

    Returns:
        Validated InstallerConfig.

    Raises:
        FileNotFoundError:  If the file does not exist.
        yaml.YAMLError:     If the file is not valid YAML.
        pydantic.ValidationError: If schema constraints are violated.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Kickstart file not found: {path}")

    with path.open() as f:
        data = yaml.safe_load(f)

    if not isinstance(data, dict):
        raise ValueError("Kickstart file must be a YAML mapping at the top level.")

    # model_validate performs all Pydantic validators including the
    # model-level apply_mode_defaults validator.
    return InstallerConfig.model_validate(data)


def generate_template(mode: str = "audio") -> InstallerConfig:
    """
    Generate a template InstallerConfig with sensible MAP2 defaults.

    Used by `--generate-ks` to produce a starting-point YAML that users
    can edit before an unattended install — analogous to running
    `ksvalidator` on a Kickstart template.

    Args:
        mode: One of 'audio', 'all-in-one', 'management', 'custom'.
    """
    from .schema import InstallMode
    cfg = InstallerConfig(mode=InstallMode(mode))
    cfg.generated_at = datetime.datetime.now(_tz.utc).isoformat()
    return cfg


def validate_kickstart_file(path: Union[str, Path]) -> list[str]:
    """
    Validate a Kickstart YAML file and return a list of human-readable errors.

    Returns an empty list if the file is valid.
    This is used in CI to gate deployments on config correctness.
    """
    errors: list[str] = []
    try:
        load_kickstart(path)
    except FileNotFoundError as e:
        errors.append(str(e))
    except yaml.YAMLError as e:
        errors.append(f"YAML parse error: {e}")
    except Exception as e:  # pydantic.ValidationError or ValueError
        # Pydantic ValidationError has a user-friendly str() representation
        errors.extend(str(e).splitlines())
    return errors
