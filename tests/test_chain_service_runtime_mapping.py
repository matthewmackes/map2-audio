from types import SimpleNamespace

from app.services.chain_service import ChainService


def test_match_runtime_plugin_items_resolves_duplicate_uris_by_position():
    chain_plugins = [
        SimpleNamespace(plugin_uri="urn:test:duplicate", position=0),
        SimpleNamespace(plugin_uri="urn:test:duplicate", position=2),
        SimpleNamespace(plugin_uri="urn:test:other", position=3),
    ]
    pedalboard_items = [
        {"uri": "urn:test:duplicate", "instance_id": 11, "position": 0},
        {"uri": "urn:test:other", "instance_id": 33, "position": 3},
        {"uri": "urn:test:duplicate", "instance_id": 22, "position": 2},
    ]

    match_map = ChainService._match_runtime_plugin_items(chain_plugins, pedalboard_items)  # noqa: SLF001

    assert match_map[0]["instance_id"] == 11
    assert match_map[2]["instance_id"] == 22
    assert match_map[3]["instance_id"] == 33


def test_resolve_reorder_chain_plugins_uses_positions_for_duplicate_uris():
    chain_plugins = [
        SimpleNamespace(plugin_uri="urn:test:duplicate", position=0, id=101),
        SimpleNamespace(plugin_uri="urn:test:duplicate", position=1, id=102),
        SimpleNamespace(plugin_uri="urn:test:other", position=2, id=103),
    ]

    resolved = ChainService._resolve_reorder_chain_plugins(  # noqa: SLF001
        chain_plugins,
        [
            {"plugin_uri": "urn:test:duplicate", "plugin_position": 1},
            {"plugin_uri": "urn:test:other", "plugin_position": 2},
            {"plugin_uri": "urn:test:duplicate", "plugin_position": 0},
        ],
    )

    assert [plugin.id for plugin in resolved] == [102, 103, 101]


def test_resolve_reorder_chain_plugins_preserves_legacy_duplicate_uri_order():
    chain_plugins = [
        SimpleNamespace(plugin_uri="urn:test:duplicate", position=0, id=201),
        SimpleNamespace(plugin_uri="urn:test:duplicate", position=1, id=202),
        SimpleNamespace(plugin_uri="urn:test:other", position=2, id=203),
    ]

    resolved = ChainService._resolve_reorder_chain_plugins(  # noqa: SLF001
        chain_plugins,
        [
            "urn:test:duplicate",
            "urn:test:other",
            "urn:test:duplicate",
        ],
    )

    assert [plugin.id for plugin in resolved] == [201, 203, 202]
