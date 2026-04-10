from app.services.mcu_surface.param_grouping import (
    MCU_BANK_SIZE,
    build_parameter_banks,
    build_plugin_parameter_banks,
    classify_parameter_group,
)


def test_classify_parameter_group_biases_eq_roles_for_eq_plugins() -> None:
    result = classify_parameter_group(
        {
            "index": 0,
            "name": "Band 1 Frequency",
            "symbol": "band1_freq",
            "min": 20.0,
            "max": 20000.0,
            "default": 1000.0,
            "is_toggled": False,
            "is_log": True,
        },
        plugin_name="Parametric EQ",
        plugin_category="EQ",
        plugin_class="EQ",
    )

    assert result["group_id"] == "eq"
    assert result["role_id"] == "frequency"
    assert result["cluster_id"] == "band"
    assert result["cluster_index"] == 1


def test_build_parameter_banks_groups_eq_bands_by_cluster_and_role() -> None:
    banks = build_parameter_banks(
        [
            {"index": 0, "name": "Band 1 Gain", "symbol": "band1_gain", "min": -18.0, "max": 18.0, "default": 0.0, "is_toggled": False, "is_log": False},
            {"index": 1, "name": "Band 2 Q", "symbol": "band2_q", "min": 0.1, "max": 12.0, "default": 1.0, "is_toggled": False, "is_log": False},
            {"index": 2, "name": "Band 1 Frequency", "symbol": "band1_freq", "min": 20.0, "max": 20000.0, "default": 1000.0, "is_toggled": False, "is_log": True},
            {"index": 3, "name": "Band 2 Frequency", "symbol": "band2_freq", "min": 20.0, "max": 20000.0, "default": 2500.0, "is_toggled": False, "is_log": True},
            {"index": 4, "name": "Band 1 Q", "symbol": "band1_q", "min": 0.1, "max": 12.0, "default": 1.0, "is_toggled": False, "is_log": False},
            {"index": 5, "name": "Band 2 Gain", "symbol": "band2_gain", "min": -18.0, "max": 18.0, "default": 0.0, "is_toggled": False, "is_log": False},
        ],
        plugin_name="Surgical EQ",
        plugin_category="EQ",
        plugin_class="EQ",
    )

    assert len(banks) == 1
    assert banks[0]["group_id"] == "eq"
    assert [parameter["symbol"] for parameter in banks[0]["parameters"]] == [
        "band1_freq",
        "band1_gain",
        "band1_q",
        "band2_freq",
        "band2_gain",
        "band2_q",
    ]


def test_build_parameter_banks_groups_dynamics_controls_ahead_of_mixer_tail() -> None:
    banks = build_parameter_banks(
        [
            {"index": 0, "name": "Threshold", "symbol": "threshold", "min": -60.0, "max": 0.0, "default": -24.0, "is_toggled": False, "is_log": False},
            {"index": 1, "name": "Ratio", "symbol": "ratio", "min": 1.0, "max": 20.0, "default": 4.0, "is_toggled": False, "is_log": False},
            {"index": 2, "name": "Attack", "symbol": "attack", "min": 0.1, "max": 500.0, "default": 20.0, "is_toggled": False, "is_log": False},
            {"index": 3, "name": "Release", "symbol": "release", "min": 10.0, "max": 2000.0, "default": 150.0, "is_toggled": False, "is_log": False},
            {"index": 4, "name": "Makeup Gain", "symbol": "makeup_gain", "min": 0.0, "max": 24.0, "default": 0.0, "is_toggled": False, "is_log": False},
            {"index": 5, "name": "Wet Mix", "symbol": "mix", "min": 0.0, "max": 1.0, "default": 1.0, "is_toggled": False, "is_log": False},
        ],
        plugin_name="Studio Compressor",
        plugin_category="Dynamics",
        plugin_class="Compressor",
    )

    assert [bank["group_id"] for bank in banks] == ["dynamics"]
    assert [parameter["symbol"] for parameter in banks[0]["parameters"][:4]] == [
        "threshold",
        "ratio",
        "attack",
        "release",
    ]


def test_build_plugin_parameter_banks_uses_plugin_category_to_keep_mod_mix_with_mod_controls() -> None:
    banks = build_plugin_parameter_banks(
        {
            "name": "Dimension Chorus",
            "category": "Modulation",
            "class_label": "Chorus",
            "parameters": [
                {"index": 0, "name": "Rate", "symbol": "rate", "min": 0.05, "max": 10.0, "default": 0.6, "is_toggled": False, "is_log": False},
                {"index": 1, "name": "Depth", "symbol": "depth", "min": 0.0, "max": 1.0, "default": 0.4, "is_toggled": False, "is_log": False},
                {"index": 2, "name": "Mix", "symbol": "mix", "min": 0.0, "max": 1.0, "default": 0.5, "is_toggled": False, "is_log": False},
                {"index": 3, "name": "Bypass", "symbol": "bypass", "min": 0.0, "max": 1.0, "default": 0.0, "is_toggled": True, "is_log": False},
            ],
        }
    )

    assert [bank["group_id"] for bank in banks] == ["modulation", "switches"]
    assert [parameter["symbol"] for parameter in banks[0]["parameters"]] == ["rate", "depth", "mix"]
    assert [parameter["symbol"] for parameter in banks[1]["parameters"]] == ["bypass"]


def test_build_parameter_banks_paginates_large_utility_groups_into_eight_slot_pages() -> None:
    parameters = [
        {
            "index": index,
            "name": f"Macro {index + 1}",
            "symbol": f"macro_{index + 1}",
            "min": 0.0,
            "max": 1.0,
            "default": 0.0,
            "is_toggled": False,
            "is_log": False,
        }
        for index in range(MCU_BANK_SIZE + 3)
    ]

    banks = build_parameter_banks(parameters, plugin_name="Utility Rack", plugin_category="Utility")

    assert [bank["title"] for bank in banks] == ["Utility 1/2", "Utility 2/2"]
    assert len(banks[0]["parameters"]) == MCU_BANK_SIZE
    assert len(banks[1]["parameters"]) == 3
    assert banks[1]["parameters"][0]["symbol"] == "macro_9"
