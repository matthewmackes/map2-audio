"""Python-tier T9 Effect Chain Editor profile."""

from __future__ import annotations

from typing import Any

from app.services.maschine.render import FlexNode, ProgressNode, RuleNode, TextNode

from .base import MaschineProfile, ProfileScene, ReactiveBindingResolver


def _short(value: Any, fallback: str, *, limit: int = 18) -> str:
    text = str(value or fallback).strip().upper()
    return text[:limit] if text else fallback


class T9EffectChainEditorProfile(MaschineProfile):
    profile_id = "t9_effect_chain_editor"
    profile_name = "T9 EFFECT CHAIN EDITOR"
    description = "Python profile for focused chain editing on the selected block."

    def build_scene(self, state: dict[str, Any], resolver: ReactiveBindingResolver) -> ProfileScene:
        rows = list(state.get("block_rows") or [])[:4]
        if not rows:
            rows = [{"display": "NO ACTIVE BLOCKS", "is_selected": True}]
        selected_block = dict(state.get("selected_block") or {})
        parameters = list(selected_block.get("top_parameters") or [])[:3]
        if not parameters:
            parameters = [{"param_id": "STATE", "value": "IDLE"}]
        left = FlexNode(
            direction="column",
            gap=2,
            children=[
                TextNode("CHAIN SELECT", font="cozette"),
                RuleNode(18),
                *[
                    TextNode(
                        str(row.get("display") or "---"),
                        font="cozette",
                        invert_background=bool(row.get("is_selected")),
                    )
                    for row in rows
                ],
            ],
            child_flex=[1, 1, 2, 2, 2, 2][: 2 + len(rows)],
        )
        right = FlexNode(
            direction="column",
            gap=2,
            children=[
                TextNode(_short(selected_block.get("plugin_name"), "NO BLOCK"), font="tamsyn"),
                TextNode(_short(selected_block.get("chain_name"), "CHAIN"), font="cozette"),
                RuleNode(18),
                *[
                    FlexNode(
                        direction="column",
                        gap=1,
                        children=[
                            TextNode(_short(param.get("param_id"), "PARAM"), font="spleen"),
                            ProgressNode(
                                ratio=max(0.0, min(1.0, float(state.get("selected_index", 0) + 1) / max(1.0, float(len(state.get("blocks") or [1]))))),
                                fill_brightness=31,
                                track_brightness=8,
                            ),
                            TextNode(_short(param.get("value"), "0"), font="cozette"),
                        ],
                    )
                    for param in parameters
                ],
            ],
            child_flex=[2, 2, 1, 4, 4, 4][: 3 + len(parameters)],
        )
        return ProfileScene(
            left=left,
            right=right,
            meta={
                "profile_id": self.profile_id,
                "profile_name": self.profile_name,
                "description": self.description,
            },
            bars={
                "left": {
                    "top_left": "T9 FX EDIT",
                    "top_right": str(state.get("snapshot_name") or "LIVE"),
                    "bottom_left": "NAV BLOCKS",
                    "bottom_right": f"{len(state.get('blocks') or [])} SLOTS",
                },
                "right": {
                    "top_left": _short(selected_block.get("plugin_name"), "DETAIL"),
                    "top_right": "ENC LIVE",
                    "bottom_left": "SHIFT+ENC MAP",
                    "bottom_right": _short(state.get("selected_block_id"), "READY", limit=10),
                },
            },
        )

