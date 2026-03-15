from __future__ import annotations

from tui.workflows import get_workflow_definitions


def _workflow_map():
    return {workflow.workflow_id: workflow for workflow in get_workflow_definitions()}


def test_workflow_catalog_contains_expected_ids() -> None:
    workflows = _workflow_map()
    assert set(workflows) == {
        "node-install",
        "realtime-setup",
        "avb-setup",
        "avb-ptp-setup",
        "cpu-pinning",
        "mode-set",
    }


def test_node_install_validator_requires_manual_inputs() -> None:
    workflow = _workflow_map()["node-install"]

    assert workflow.validator is not None
    assert workflow.validator({"cluster_join_method": "manual"}) == "Master node IP is required for manual cluster join."
    assert workflow.validator({"cluster_join_method": "token"}) == "Join token is required for token-based cluster join."
    assert (
        workflow.validator(
            {
                "cluster_join_method": "mdns",
                "configure_network": True,
                "network_interface": "",
                "network_ip": "192.168.1.10",
                "network_gateway": "192.168.1.1",
            }
        )
        == "Network Interface is required when static networking is enabled."
    )


def test_node_install_workflow_uses_sectioned_native_form_fields() -> None:
    workflow = _workflow_map()["node-install"]
    section_labels = [field["label"] for field in workflow.fields if field.get("type") == "section"]

    assert section_labels == [
        "Node identity",
        "Cluster join",
        "Network",
        "Audio",
        "Platform access",
    ]
    install_mode = next(field for field in workflow.fields if field["name"] == "install_mode")
    assert "hint" in install_mode
    assert "RPM" in str(install_mode["hint"])


def test_node_install_builder_uses_native_backend_payload() -> None:
    workflow = _workflow_map()["node-install"]
    spec = workflow.builder(
        {
            "install_mode": "rpm",
            "node_id": "node-stage-a",
            "node_name": "Stage A",
            "node_role": "audio",
            "cluster_join_method": "manual",
            "cluster_master_ip": "10.10.10.1",
            "cluster_join_token": "",
            "configure_network": True,
            "network_interface": "enp1s0",
            "network_ip": "10.10.10.20",
            "network_netmask": "255.255.255.0",
            "network_gateway": "10.10.10.1",
            "network_dns": "1.1.1.1",
            "enable_audio": True,
            "audio_device": "hw:0,0",
            "audio_sample_rate": "48000",
            "audio_buffer_size": "128",
            "enable_firewall": False,
        },
        False,
    )

    assert spec.command == []
    assert spec.native_action == "apply-node-install"
    assert spec.requires_passwordless_sudo is False
    assert spec.cleanup_paths == ()
    assert spec.native_payload["config"]["node_id"] == "node-stage-a"
    assert spec.native_payload["config"]["node_name"] == "Stage A"
    assert spec.native_payload["config"]["cluster_master_ip"] == "10.10.10.1"
    assert spec.native_payload["config"]["configure_network"] is True
    assert spec.native_payload["config"]["network_interface"] == "enp1s0"
    assert spec.native_payload["config"]["enable_firewall"] is False
    assert '"dry_run": false' in spec.preview


def test_node_install_preview_uses_native_backend_payload() -> None:
    workflow = _workflow_map()["node-install"]
    spec = workflow.builder({"node_id": "node-preview", "node_name": "Preview"}, True)

    assert spec.command == []
    assert spec.native_action is None
    assert '"node_id": "node-preview"' in spec.preview
    assert '"dry_run": true' in spec.preview


def test_mode_and_platform_workflows_use_expected_commands() -> None:
    workflows = _workflow_map()

    mode_apply = workflows["mode-set"].builder({"mode": "management"}, False)
    mode_preview = workflows["mode-set"].builder({"mode": "management"}, True)
    avb = workflows["avb-setup"].builder({"interface": "enp2s0"}, False)
    avb_ptp = workflows["avb-ptp-setup"].builder({"interface": "enp3s0", "domain": "5", "priority": "64"}, True)
    avb_ptp_apply = workflows["avb-ptp-setup"].builder({"interface": "enp3s0", "domain": "5", "priority": "64"}, False)
    cpu = workflows["cpu-pinning"].builder({}, True)
    cpu_apply = workflows["cpu-pinning"].builder({}, False)
    realtime = workflows["realtime-setup"].builder({"profile": "Performance", "force_preflight": False}, True)
    realtime_apply = workflows["realtime-setup"].builder({"profile": "Performance", "force_preflight": True}, False)

    assert mode_apply.command == []
    assert mode_apply.requires_passwordless_sudo is False
    assert mode_apply.native_action == "set-deployment-mode"
    assert mode_apply.native_payload == {"mode": "management"}
    assert mode_apply.preview == 'POST /api/deployment/mode {"mode": "management"}'
    assert mode_preview.command == []
    assert mode_preview.native_action is None
    assert mode_preview.preview == "Native API verification\nGET /api/deployment/mode\nTarget mode: management"
    assert avb.command == []
    assert avb.native_action == "apply-avb-setup"
    assert avb.native_payload == {"interface": "enp2s0"}
    assert avb.preview == 'POST /api/avb/setup {"interface": "enp2s0", "dry_run": false, "auto_yes": true}'
    assert avb_ptp.command == []
    assert avb_ptp.native_action is None
    assert avb_ptp.preview == (
        "Native API verification\n"
        "GET /api/avb/ptp/status\n"
        "GET /api/avb/tsn/status\n"
        'Planned action: POST /api/avb/ptp/setup {"interface": "enp3s0", "domain": 5, "priority": 64, "dry_run": false, "auto_yes": true}'
    )
    assert avb_ptp_apply.command == []
    assert avb_ptp_apply.native_action == "apply-avb-ptp-setup"
    assert avb_ptp_apply.native_payload == {"interface": "enp3s0", "domain": 5, "priority": 64}
    assert cpu.command == []
    assert cpu.native_action is None
    assert cpu.preview == (
        "Native API verification\n"
        "GET /api/system/cpu-isolation/status\n"
        "GET /api/system/cpu-isolation/verify\n"
        "Planned action: POST /api/system/cpu-isolation/reset-to-mode"
    )
    assert cpu_apply.command == []
    assert cpu_apply.native_action == "reset-cpu-isolation"
    assert cpu_apply.preview == "POST /api/system/cpu-isolation/reset-to-mode"
    assert realtime.command == []
    assert realtime.native_action is None
    assert realtime.preview == (
        "Native API verification\n"
        "POST /api/runtime-profiles/rt-harden/verify\n"
        'POST /api/runtime-profiles/switch {"profile": "Performance", "dry_run": true, "force": false}'
    )
    assert realtime_apply.command == []
    assert realtime_apply.native_action == "apply-rt-hardening"
    assert realtime_apply.native_payload == {"profile": "Performance", "force": True}
    assert realtime_apply.preview == (
        'POST /api/runtime-profiles/rt-harden/apply {"dry_run": false, "auto_yes": true}\n'
        'POST /api/runtime-profiles/switch {"profile": "Performance", "dry_run": false, "force": true}'
    )


def test_native_setup_workflows_include_operator_hints() -> None:
    workflows = _workflow_map()

    realtime_section = next(field for field in workflows["realtime-setup"].fields if field.get("type") == "section")
    realtime_profile = next(field for field in workflows["realtime-setup"].fields if field["name"] == "profile")
    avb_section = next(field for field in workflows["avb-setup"].fields if field.get("type") == "section")
    avb_ptp_domain = next(field for field in workflows["avb-ptp-setup"].fields if field["name"] == "domain")
    mode_section = next(field for field in workflows["mode-set"].fields if field.get("type") == "section")

    assert "runtime profile" in str(realtime_section["hint"]).lower()
    assert "Performance" in str(realtime_profile["hint"])
    assert "TSN-capable NIC" in str(avb_section["hint"])
    assert "common default" in str(avb_ptp_domain["hint"])
    assert "system posture" in str(mode_section["hint"])


def test_avb_ptp_workflow_validator_requires_numeric_domain_and_priority() -> None:
    workflow = _workflow_map()["avb-ptp-setup"]

    assert workflow.validator is not None
    assert workflow.validator({"domain": "abc", "priority": "128"}) == "Domain must be numeric."
    assert workflow.validator({"domain": "0", "priority": "high"}) == "Priority must be numeric."
