from __future__ import annotations

import pytest

from tui.quad_cortex_touchscreen.app import QuadCortexTouchscreenApp
from tui.quad_cortex_touchscreen.backend import TouchscreenBackendSnapshot
from tui.quad_cortex_touchscreen.model import OperatingMode, TouchscreenView
from tui.quad_cortex_touchscreen.widgets import GigTile, GridCell, ModeBadge


class _FakeTouchscreenController:
    def __init__(self) -> None:
        self._active_chain_id = 1
        self.saved_presets: list[tuple[int, str]] = []
        self._chains = [
            {
                "id": 1,
                "name": "STAGE CLEAN",
                "is_active": True,
                "plugins": [
                    {"uri": "map2://juce/dynamics/comp", "name": "Studio Comp", "category": "Dynamics", "position": 0, "bypassed": False, "in_ports": 2, "out_ports": 2},
                    {"uri": "map2://juce/amp/us-clean", "name": "US Clean Amp", "category": "Amplifier", "position": 1, "bypassed": False, "in_ports": 2, "out_ports": 2},
                    {"uri": "map2://juce/delay/stereo", "name": "Stereo Delay", "category": "Delay", "position": 2, "bypassed": False, "in_ports": 2, "out_ports": 2},
                ],
            },
            {
                "id": 2,
                "name": "LEAD STACK",
                "is_active": False,
                "plugins": [
                    {"uri": "map2://juce/drive/boost", "name": "Lead Boost", "category": "Drive", "position": 0, "bypassed": False, "in_ports": 2, "out_ports": 2},
                    {"uri": "map2://juce/amp/modern", "name": "Modern Amp", "category": "Amplifier", "position": 1, "bypassed": False, "in_ports": 2, "out_ports": 2},
                    {"uri": "map2://juce/reverb/hall", "name": "Hall Verb", "category": "Reverb", "position": 2, "bypassed": False, "in_ports": 2, "out_ports": 2},
                ],
            },
        ]
        self._details = {
            1: {
                "id": 1,
                "name": "STAGE CLEAN",
                "is_active": True,
                "plugins": [
                    {"uri": "map2://juce/dynamics/comp", "name": "Studio Comp", "author": "MAP2", "category": "Dynamics", "position": 0, "bypassed": False, "in_ports": 2, "out_ports": 2},
                    {"uri": "map2://juce/amp/us-clean", "name": "US Clean Amp", "author": "MAP2", "category": "Amplifier", "position": 1, "bypassed": False, "in_ports": 2, "out_ports": 2},
                    {"uri": "map2://juce/delay/stereo", "name": "Stereo Delay", "author": "MAP2", "category": "Delay", "position": 2, "bypassed": False, "in_ports": 2, "out_ports": 2},
                ],
                "touchscreen": {
                    "stomp_assignments": [
                        {"slot": 1, "plugin_uri": "map2://juce/dynamics/comp", "plugin_position": 0},
                        {"slot": 2, "plugin_uri": "map2://juce/delay/stereo", "plugin_position": 2},
                    ]
                },
            },
            2: {
                "id": 2,
                "name": "LEAD STACK",
                "is_active": False,
                "plugins": [
                    {"uri": "map2://juce/drive/boost", "name": "Lead Boost", "author": "MAP2", "category": "Drive", "position": 0, "bypassed": False, "in_ports": 2, "out_ports": 2},
                    {"uri": "map2://juce/amp/modern", "name": "Modern Amp", "author": "MAP2", "category": "Amplifier", "position": 1, "bypassed": False, "in_ports": 2, "out_ports": 2},
                    {"uri": "map2://juce/reverb/hall", "name": "Hall Verb", "author": "MAP2", "category": "Reverb", "position": 2, "bypassed": False, "in_ports": 2, "out_ports": 2},
                ],
                "touchscreen": {
                    "stomp_assignments": [
                        {"slot": 1, "plugin_uri": "map2://juce/drive/boost", "plugin_position": 0},
                        {"slot": 2, "plugin_uri": "map2://juce/reverb/hall", "plugin_position": 2},
                    ]
                },
            },
        }

    async def close(self) -> None:
        return None

    async def fetch_snapshot(self, preferred_chain_id: int | None = None) -> TouchscreenBackendSnapshot:
        chain_id = preferred_chain_id or self._active_chain_id
        self._sync_active_flags(chain_id)
        return TouchscreenBackendSnapshot(
            chains=self._chains,
            chain_detail=self._details.get(chain_id),
            audio_status={"available": True, "running": True},
            audio_latency={"latency_ms": 1.33},
            audio_metrics={"available": True, "running": True, "cpu_load": 28.0, "xruns": 0, "sample_rate": 48000, "buffer_size": 64},
            midi_status={"available": True, "enabled": True, "devices": 1},
            midi_activity={"messages": [{"type": "cc", "channel": 1}]},
            errors=[],
            reachable=True,
        )

    async def activate_chain(self, chain_id: int) -> str:
        self._active_chain_id = chain_id
        self._sync_active_flags(chain_id)
        return f"Loaded chain {chain_id}"

    async def toggle_plugin_bypass(
        self,
        *,
        chain_id: int,
        plugin_uri: str,
        plugin_position: int | None,
        bypass: bool,
        block_name: str,
    ) -> str:
        for plugin in self._details[chain_id]["plugins"]:
            if plugin["uri"] == plugin_uri and plugin["position"] == plugin_position:
                plugin["bypassed"] = bypass
        for chain in self._chains:
            if chain["id"] != chain_id:
                continue
            for plugin in chain["plugins"]:
                if plugin["uri"] == plugin_uri and plugin["position"] == plugin_position:
                    plugin["bypassed"] = bypass
        return f"{block_name} {'bypassed' if bypass else 'active'}"

    async def save_chain_preset(self, *, chain_id: int, chain_name: str) -> str:
        self.saved_presets.append((chain_id, chain_name))
        return f"Saved {chain_name}"

    async def persist_stomp_assignments(self, *, chain_id: int, assignments) -> str:
        payload = []
        for assignment in assignments:
            if assignment.assigned and assignment.plugin_uri is not None and assignment.plugin_position is not None:
                payload.append(
                    {
                        "slot": assignment.slot,
                        "plugin_uri": assignment.plugin_uri,
                        "plugin_position": assignment.plugin_position,
                    }
                )
        self._details[chain_id]["touchscreen"]["stomp_assignments"] = payload
        return f"Updated live stomps for chain {chain_id}"

    def _sync_active_flags(self, active_chain_id: int) -> None:
        for chain in self._chains:
            chain["is_active"] = chain["id"] == active_chain_id
        for chain_id, detail in self._details.items():
            detail["is_active"] = chain_id == active_chain_id


class _OfflineTouchscreenController:
    async def close(self) -> None:
        return None

    async def fetch_snapshot(self, preferred_chain_id: int | None = None) -> TouchscreenBackendSnapshot:
        del preferred_chain_id
        return TouchscreenBackendSnapshot(
            chains=[],
            chain_detail=None,
            audio_status=None,
            audio_latency=None,
            audio_metrics=None,
            midi_status=None,
            midi_activity=None,
            errors=["Cannot connect to backend"],
            reachable=False,
        )


async def _settle(pilot) -> None:
    await pilot.pause()
    await pilot.pause()
    await pilot.pause()


@pytest.mark.asyncio
async def test_touchscreen_launches_into_grid_with_expected_matrix_sizes() -> None:
    app = QuadCortexTouchscreenApp(controller=_FakeTouchscreenController(), animate=False)

    async with app.run_test() as pilot:
        await _settle(pilot)

        assert app.state.view is TouchscreenView.GRID
        assert app.query_one("#qc-content-switcher").current == "qc-grid-view"
        assert len(app.query(GridCell)) == 32
        assert len(app.query(GigTile)) == 8
        assert app.state.chain_name == "STAGE CLEAN"
        assert "AETHER CLEAN" not in str(app.query_one("#qc-chain-name").content)


@pytest.mark.asyncio
async def test_mode_bindings_switch_between_chain_and_stomp_semantics() -> None:
    app = QuadCortexTouchscreenApp(controller=_FakeTouchscreenController(), animate=False)

    async with app.run_test() as pilot:
        await _settle(pilot)
        await pilot.press("2")
        await pilot.press("v")
        await _settle(pilot)

        assert app.state.mode is OperatingMode.STOMP
        assert "STOMP" in str(app.query_one("#qc-mode-badge", ModeBadge).content)
        assert "Studio Comp" in str(app.query_one("#qc-gig-tile-0", GigTile).content)

        await pilot.press("1")
        await _settle(pilot)

        assert app.state.mode is OperatingMode.CHAIN
        assert "STAGE CLEAN" in str(app.query_one("#qc-gig-tile-0", GigTile).content)


@pytest.mark.asyncio
async def test_arrow_navigation_and_enter_toggle_selected_block_bypass() -> None:
    controller = _FakeTouchscreenController()
    app = QuadCortexTouchscreenApp(controller=controller, animate=False)

    async with app.run_test() as pilot:
        await _settle(pilot)
        assert app.state.selected_block() is not None
        assert app.state.selected_block().name == "Studio Comp"
        assert app.state.selected_block().bypassed is False

        await pilot.press("enter")
        await _settle(pilot)

        assert app.state.selected_block().bypassed is True
        assert controller._details[1]["plugins"][0]["bypassed"] is True
        assert app.query_one("#qc-grid-cell-1", GridCell).has_class("-bypassed")


@pytest.mark.asyncio
async def test_b_binding_arms_and_disarms_live_stomp_assignments() -> None:
    app = QuadCortexTouchscreenApp(controller=_FakeTouchscreenController(), animate=False)

    async with app.run_test() as pilot:
        await _settle(pilot)

        assert app.state.selected_block() is not None
        assert app.state.selected_block().stomp_slot == 1

        await pilot.press("b")
        await _settle(pilot)
        assert app.state.selected_block().stomp_slot is None
        assert app.state.active_chain.stomp_assignments[0].assigned is False

        await pilot.press("b")
        await _settle(pilot)
        assert app.state.selected_block().stomp_slot == 1
        assert app.state.active_chain.stomp_assignments[0].assigned is True


@pytest.mark.asyncio
async def test_mouse_clicks_select_grid_cells_and_activate_gig_tiles() -> None:
    app = QuadCortexTouchscreenApp(controller=_FakeTouchscreenController(), animate=False)

    async with app.run_test() as pilot:
        await _settle(pilot)
        await pilot.click(app.query_one("#qc-grid-cell-2", GridCell), offset=(1, 0))
        await _settle(pilot)

        assert app.state.selected_grid_index == 2

        await pilot.press("v")
        await _settle(pilot)
        await pilot.click(app.query_one("#qc-gig-tile-1", GigTile), offset=(1, 1))
        await _settle(pilot)

        assert app.state.current_chain_index == 1
        assert app.state.chain_name == "LEAD STACK"


@pytest.mark.asyncio
async def test_small_terminal_uses_compact_density_without_collapsing_matrix_structure() -> None:
    app = QuadCortexTouchscreenApp(controller=_FakeTouchscreenController(), animate=False)

    async with app.run_test(size=(72, 20)) as pilot:
        await _settle(pilot)

        grid_text = str(app.query_one("#qc-grid-cell-1", GridCell).content)
        footer_text = str(app.query_one("#qc-footer-hints").content)

        assert len(app.query(GridCell)) == 32
        assert "\n" not in grid_text
        assert "Arrows Move" not in footer_text

        await pilot.press("v")
        await _settle(pilot)

        gig_text = str(app.query_one("#qc-gig-tile-0", GigTile).content)
        assert len(app.query(GigTile)) == 8
        assert gig_text.count("\n") <= 1
        assert "3 blocks" not in gig_text


@pytest.mark.asyncio
async def test_large_terminal_restores_full_density_copy() -> None:
    app = QuadCortexTouchscreenApp(controller=_FakeTouchscreenController(), animate=False)

    async with app.run_test(size=(140, 40)) as pilot:
        await _settle(pilot)

        grid_text = str(app.query_one("#qc-grid-cell-1", GridCell).content)
        footer_text = str(app.query_one("#qc-footer-hints").content)

        assert grid_text.count("\n") == 2
        assert "Arrows Move" in footer_text

        await pilot.press("v")
        await _settle(pilot)

        gig_text = str(app.query_one("#qc-gig-tile-0", GigTile).content)
        assert gig_text.count("\n") == 2
        assert "3 blocks" in gig_text


@pytest.mark.asyncio
async def test_backend_offline_state_shows_no_mock_rigs() -> None:
    app = QuadCortexTouchscreenApp(controller=_OfflineTouchscreenController(), animate=False)

    async with app.run_test() as pilot:
        await _settle(pilot)

        header_text = str(app.query_one("#qc-chain-name").content)
        footer_text = str(app.query_one("#qc-footer-hints").content)

        assert "AETHER CLEAN" not in header_text
        assert "NO ACTIVE CHAIN" in header_text
        assert "Cannot connect to backend" in footer_text or "Backend unavailable" in footer_text


@pytest.mark.asyncio
async def test_save_binding_uses_real_backend_save_surface() -> None:
    controller = _FakeTouchscreenController()
    app = QuadCortexTouchscreenApp(controller=controller, animate=False)

    async with app.run_test() as pilot:
        await _settle(pilot)
        await pilot.press("s")
        await _settle(pilot)

        assert controller.saved_presets == [(1, "STAGE CLEAN")]
        assert "Saved STAGE CLEAN" in str(app.query_one("#qc-footer-hints").content)
