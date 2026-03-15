"""Native workflow definitions for setup and install operations."""

from __future__ import annotations

import json
import shlex
import socket
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable


REPO_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class WorkflowRunSpec:
    """Executable workflow contract plus cleanup metadata."""

    preview: str
    command: list[str] = field(default_factory=list)
    cwd: Path = REPO_ROOT
    cleanup_paths: tuple[Path, ...] = ()
    requires_passwordless_sudo: bool = False
    native_action: str | None = None
    native_payload: dict[str, object] = field(default_factory=dict)


WorkflowValidator = Callable[[dict[str, object]], str | None]
WorkflowBuilder = Callable[[dict[str, object], bool], WorkflowRunSpec]


@dataclass(frozen=True)
class WorkflowDefinition:
    """Definition for a native workflow exposed in the unified console."""

    workflow_id: str
    label: str
    legacy_source: str
    summary: str
    group: str
    fields: tuple[dict[str, object], ...]
    builder: WorkflowBuilder
    validator: WorkflowValidator | None = None


def _shell(command: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in command)


def _hostname_slug() -> str:
    return socket.gethostname().split(".")[0]


def _default_node_install_fields() -> tuple[dict[str, object], ...]:
    host = _hostname_slug()
    return (
        {
            "name": "section_node_identity",
            "label": "Node identity",
            "type": "section",
            "hint": "Identify this machine in the cluster and choose its operational role.",
        },
        {
            "name": "install_mode",
            "label": "Installation mode",
            "type": "select",
            "required": True,
            "default": "rpm",
            "hint": "Use RPM for stable deployment or Git when you need a live checkout for development.",
            "options": (
                ("RPM package", "rpm"),
                ("Git checkout", "git"),
            ),
        },
        {
            "name": "node_id",
            "label": "Node ID",
            "required": True,
            "default": f"node-{host}",
            "hint": "Use a stable identifier that will remain valid across reboots and cluster sync operations.",
        },
        {
            "name": "node_name",
            "label": "Node name",
            "required": True,
            "default": f"MAP2 Node {host}",
            "hint": "This label is shown to operators in dashboards and node-management views.",
        },
        {
            "name": "node_role",
            "label": "Node role",
            "type": "select",
            "required": True,
            "default": "worker",
            "hint": "Select how this node participates in processing and orchestration.",
            "options": (
                ("Worker", "worker"),
                ("Manager", "manager"),
                ("Audio", "audio"),
            ),
        },
        {
            "name": "section_cluster_join",
            "label": "Cluster join",
            "type": "section",
            "hint": "Choose how this node discovers or authenticates against the target cluster.",
        },
        {
            "name": "cluster_join_method",
            "label": "Cluster join method",
            "type": "select",
            "required": True,
            "default": "mdns",
            "hint": "mDNS is the default path. Manual IP and token modes are available for controlled environments.",
            "options": (
                ("mDNS auto-discovery", "mdns"),
                ("Manual master IP", "manual"),
                ("Join token", "token"),
                ("Skip", "skip"),
            ),
        },
        {
            "name": "cluster_master_ip",
            "label": "Master node IP",
            "default": "",
            "hint": "Required only for manual join. Enter the management IP of the cluster leader.",
        },
        {
            "name": "cluster_join_token",
            "label": "Cluster join token",
            "default": "",
            "hint": "Required only for token join. Paste the issued cluster token exactly as provided.",
        },
        {
            "name": "section_network",
            "label": "Network",
            "type": "section",
            "hint": "Static networking is recommended for production cluster nodes. Leave it disabled for DHCP-based lab setups.",
        },
        {
            "name": "configure_network",
            "label": "Configure static network",
            "type": "checkbox",
            "default": False,
            "hint": "Enable this when the node should come up on a fixed management address.",
        },
        {
            "name": "network_interface",
            "label": "Network interface",
            "default": "",
            "hint": "Use the management-facing NIC, for example enp1s0. Leave blank only when DHCP mode is in use.",
        },
        {
            "name": "network_ip",
            "label": "Static IP address",
            "default": "",
            "hint": "Provide the address this node should advertise to the cluster and service endpoints.",
        },
        {
            "name": "network_netmask",
            "label": "Network netmask",
            "default": "255.255.255.0",
            "hint": "Standard /24 networks use 255.255.255.0 unless your management LAN is segmented differently.",
        },
        {
            "name": "network_gateway",
            "label": "Network gateway",
            "default": "",
            "hint": "Set the default gateway used for package installation and remote management traffic.",
        },
        {
            "name": "network_dns",
            "label": "DNS server",
            "default": "8.8.8.8",
            "hint": "Used during package install and for any hostname-based service discovery outside the local node.",
        },
        {
            "name": "section_audio",
            "label": "Audio",
            "type": "section",
            "hint": "Configure the local audio engine only when this node is expected to process or emit audio directly.",
        },
        {
            "name": "enable_audio",
            "label": "Configure audio subsystem",
            "type": "checkbox",
            "default": True,
            "hint": "Disable this for management-only nodes that will not host realtime audio services.",
        },
        {
            "name": "audio_device",
            "label": "Audio device",
            "default": "default",
            "hint": "Use a concrete ALSA device for deterministic deployments, or keep default for broad compatibility.",
        },
        {
            "name": "audio_sample_rate",
            "label": "Audio sample rate",
            "default": "48000",
            "hint": "48 kHz is the platform default for stage and AVB workflows.",
        },
        {
            "name": "audio_buffer_size",
            "label": "Audio buffer size",
            "default": "256",
            "hint": "Smaller buffers reduce latency but leave less realtime headroom.",
        },
        {
            "name": "section_platform_access",
            "label": "Platform access",
            "type": "section",
            "hint": "Finish by choosing whether the installer should open the default firewall rules for MAP2 services.",
        },
        {
            "name": "enable_firewall",
            "label": "Configure firewall rules",
            "type": "checkbox",
            "default": True,
            "hint": "Recommended unless this node already sits behind a controlled external firewall policy.",
        },
    )


def _validate_node_install(config: dict[str, object]) -> str | None:
    join_method = str(config.get("cluster_join_method", "mdns"))
    if join_method == "manual" and not str(config.get("cluster_master_ip", "")).strip():
        return "Master node IP is required for manual cluster join."
    if join_method == "token" and not str(config.get("cluster_join_token", "")).strip():
        return "Join token is required for token-based cluster join."

    if bool(config.get("configure_network")):
        required_fields = ("network_interface", "network_ip", "network_gateway")
        for field in required_fields:
            if not str(config.get(field, "")).strip():
                return f"{field.replace('_', ' ').title()} is required when static networking is enabled."

    if bool(config.get("enable_audio")):
        if not str(config.get("audio_device", "")).strip():
            return "Audio device is required when audio setup is enabled."
        for field in ("audio_sample_rate", "audio_buffer_size"):
            if not str(config.get(field, "")).strip().isdigit():
                return f"{field.replace('_', ' ').title()} must be numeric."

    return None


def _build_node_install(config: dict[str, object], dry_run: bool) -> WorkflowRunSpec:
    payload = dict(config)
    if dry_run:
        return WorkflowRunSpec(
            preview=(
                "Native API verification\n"
                "POST /api/system/node-install\n"
                + json.dumps({"config": payload, "dry_run": True, "auto_yes": True}, indent=2, sort_keys=True)
            ),
        )
    return WorkflowRunSpec(
        preview=(
            "POST /api/system/node-install\n"
            + json.dumps({"config": payload, "dry_run": False, "auto_yes": True}, indent=2, sort_keys=True)
        ),
        native_action="apply-node-install",
        native_payload={"config": payload},
    )


def _build_realtime(config: dict[str, object], dry_run: bool) -> WorkflowRunSpec:
    profile = str(config.get("profile", "Performance") or "Performance")
    force = bool(config.get("force_preflight"))
    if dry_run:
        return WorkflowRunSpec(
            preview=(
                "Native API verification\n"
                "POST /api/runtime-profiles/rt-harden/verify\n"
                "POST /api/runtime-profiles/switch "
                f'{{"profile": "{profile}", "dry_run": true, "force": {str(force).lower()}}}'
            ),
        )
    return WorkflowRunSpec(
        preview=(
            "POST /api/runtime-profiles/rt-harden/apply "
            '{"dry_run": false, "auto_yes": true}\n'
            "POST /api/runtime-profiles/switch "
            f'{{"profile": "{profile}", "dry_run": false, "force": {str(force).lower()}}}'
        ),
        native_action="apply-rt-hardening",
        native_payload={"profile": profile, "force": force},
    )


def _build_avb(config: dict[str, object], dry_run: bool) -> WorkflowRunSpec:
    interface = str(config.get("interface", "")).strip()
    interface_json = json.dumps(interface)
    if dry_run:
        return WorkflowRunSpec(
            preview=(
                "Native API verification\n"
                "GET /api/avb/status\n"
                "GET /api/avb/config/compatibility\n"
                f'Planned action: POST /api/avb/setup {{"interface": {interface_json}, "dry_run": false, "auto_yes": true}}'
            ),
        )
    return WorkflowRunSpec(
        preview=f'POST /api/avb/setup {{"interface": {interface_json}, "dry_run": false, "auto_yes": true}}',
        native_action="apply-avb-setup",
        native_payload={"interface": interface},
    )


def _validate_avb_ptp(config: dict[str, object]) -> str | None:
    for field in ("domain", "priority"):
        value = str(config.get(field, "")).strip()
        if not value.isdigit():
            return f"{field.title()} must be numeric."
    return None


def _build_avb_ptp(config: dict[str, object], dry_run: bool) -> WorkflowRunSpec:
    interface = str(config.get("interface", "")).strip()
    domain = int(str(config.get("domain", "0") or "0").strip())
    priority = int(str(config.get("priority", "128") or "128").strip())
    interface_json = json.dumps(interface)
    if dry_run:
        return WorkflowRunSpec(
            preview=(
                "Native API verification\n"
                "GET /api/avb/ptp/status\n"
                "GET /api/avb/tsn/status\n"
                f'Planned action: POST /api/avb/ptp/setup {{"interface": {interface_json}, "domain": {domain}, "priority": {priority}, "dry_run": false, "auto_yes": true}}'
            ),
        )
    return WorkflowRunSpec(
        preview=(
            f'POST /api/avb/ptp/setup {{"interface": {interface_json}, '
            f'"domain": {domain}, "priority": {priority}, "dry_run": false, "auto_yes": true}}'
        ),
        native_action="apply-avb-ptp-setup",
        native_payload={"interface": interface, "domain": domain, "priority": priority},
    )


def _build_cpu_pinning(config: dict[str, object], dry_run: bool) -> WorkflowRunSpec:
    del config
    if dry_run:
        return WorkflowRunSpec(
            preview=(
                "Native API verification\n"
                "GET /api/system/cpu-isolation/status\n"
                "GET /api/system/cpu-isolation/verify\n"
                "Planned action: POST /api/system/cpu-isolation/reset-to-mode"
            ),
        )
    return WorkflowRunSpec(
        preview="POST /api/system/cpu-isolation/reset-to-mode",
        native_action="reset-cpu-isolation",
    )


def _build_mode_set(config: dict[str, object], dry_run: bool) -> WorkflowRunSpec:
    mode = str(config.get("mode", "all-in-one") or "all-in-one")
    if dry_run:
        return WorkflowRunSpec(
            preview=(
                "Native API verification\n"
                "GET /api/deployment/mode\n"
                f"Target mode: {mode}"
            ),
        )
    return WorkflowRunSpec(
        preview=f"POST /api/deployment/mode {{\"mode\": \"{mode}\"}}",
        native_action="set-deployment-mode",
        native_payload={"mode": mode},
    )


def get_workflow_definitions() -> list[WorkflowDefinition]:
    """Return the canonical workflow catalog for the host app."""

    return [
        WorkflowDefinition(
            workflow_id="node-install",
            label="Node install",
            legacy_source="scripts/install-node.sh",
            summary="Install and configure a MAP2 node with native form-driven inputs.",
            group="System",
            fields=_default_node_install_fields(),
            builder=_build_node_install,
            validator=_validate_node_install,
        ),
        WorkflowDefinition(
            workflow_id="realtime-setup",
            label="Realtime setup",
            legacy_source="scripts/setup_realtime.sh",
            summary="Apply realtime scheduling, PipeWire, IRQ, and low-latency tuning.",
            group="System",
            fields=(
                {
                    "name": "section_runtime_profile",
                    "label": "Runtime posture",
                    "type": "section",
                    "hint": "Choose the runtime profile that should be active after RT hardening is applied.",
                },
                {
                    "name": "profile",
                    "label": "Runtime profile",
                    "type": "select",
                    "required": True,
                    "default": "Performance",
                    "hint": "Performance enforces the strictest audio posture. Edit keeps more graph flexibility on supported nodes.",
                    "options": (
                        ("Performance", "Performance"),
                        ("Edit", "Edit"),
                    ),
                },
                {
                    "name": "force_preflight",
                    "label": "Allow preflight override",
                    "type": "checkbox",
                    "default": False,
                    "hint": "Leave this off unless you have reviewed the preflight blockers and intentionally want to override them.",
                },
            ),
            builder=_build_realtime,
        ),
        WorkflowDefinition(
            workflow_id="avb-setup",
            label="AVB setup",
            legacy_source="scripts/setup_avb.sh",
            summary="Configure AVB/TSN services and qdisc state for the selected interface.",
            group="System",
            fields=(
                {
                    "name": "section_avb_interface",
                    "label": "AVB interface",
                    "type": "section",
                    "hint": "Select the TSN-capable NIC that will carry AVB traffic. Leave the interface blank to auto-detect.",
                },
                {
                    "name": "interface",
                    "label": "AVB interface",
                    "default": "",
                    "placeholder": "Leave blank to auto-detect",
                    "hint": "Examples: enp2s0, eno1, or the management-approved AVB uplink name for this host.",
                },
            ),
            builder=_build_avb,
        ),
        WorkflowDefinition(
            workflow_id="avb-ptp-setup",
            label="AVB/PTP setup",
            legacy_source="scripts/setup_avb_ptp.sh",
            summary="Configure IEEE 802.1AS PTP and hardware-timestamped synchronization.",
            group="System",
            fields=(
                {
                    "name": "section_ptp_interface",
                    "label": "PTP transport",
                    "type": "section",
                    "hint": "Choose the interface and timing domain used for AVB clock distribution on this host.",
                },
                {
                    "name": "interface",
                    "label": "PTP interface",
                    "default": "",
                    "placeholder": "Leave blank to auto-detect",
                    "hint": "Leave blank to let the bootstrap detect the preferred hardware-timestamped NIC.",
                },
                {
                    "name": "domain",
                    "label": "PTP domain",
                    "default": "0",
                    "hint": "Use the domain assigned by your AVB environment. Domain 0 is the common default.",
                },
                {
                    "name": "priority",
                    "label": "Priority1",
                    "default": "128",
                    "hint": "Lower values increase master-election preference. Keep the site standard unless you are deliberately overriding it.",
                },
            ),
            builder=_build_avb_ptp,
            validator=_validate_avb_ptp,
        ),
        WorkflowDefinition(
            workflow_id="cpu-pinning",
            label="CPU pinning",
            legacy_source="scripts/configure_cpu_pinning.sh",
            summary="Apply IRQ and service CPU affinity for realtime audio workloads.",
            group="System",
            fields=(),
            builder=_build_cpu_pinning,
        ),
        WorkflowDefinition(
            workflow_id="mode-set",
            label="Mode management",
            legacy_source="scripts/map2-mode.sh",
            summary="Apply the deployment mode using the canonical mode manager.",
            group="Settings",
            fields=(
                {
                    "name": "section_mode_selection",
                    "label": "Deployment mode",
                    "type": "section",
                    "hint": "Choose the system posture you want to apply across backend services and runtime configuration.",
                },
                {
                    "name": "mode",
                    "label": "Target mode",
                    "type": "select",
                    "required": True,
                    "default": "all-in-one",
                    "hint": "Audio is for dedicated DSP hosts, all-in-one runs UI and audio together, management disables local audio processing.",
                    "options": (
                        ("Audio", "audio"),
                        ("All-in-one", "all-in-one"),
                        ("Management", "management"),
                    ),
                },
            ),
            builder=_build_mode_set,
        ),
    ]
