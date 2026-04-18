"""Profile registry and retained-mode scene wrapping for Maschine MK1."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.services.maschine.fonts import BitmapFontAtlas, build_default_font_roster
from app.services.maschine.render import FlexNode, RetainedRenderer, SceneNode, TextNode

from .base import JsonMaschineProfile, MaschineProfile, ReactiveBindingResolver
from .t9_effect_chain_editor import T9EffectChainEditorProfile


PROFILE_ALIASES = {
    "audio_grid": "t1_ctrl",
    "stats": "t16_monitor",
}


@dataclass(frozen=True)
class RuntimeProfileRender:
    profile_id: str
    profile_name: str
    description: str
    left: dict[str, Any]
    right: dict[str, Any]
    meta: dict[str, Any]


@dataclass(frozen=True)
class RegisteredProfile:
    profile: MaschineProfile
    category: str
    order: int
    hidden_from_cycle: bool = False
    admin_only: bool = False


class MaschineProfileRuntime:
    def __init__(self) -> None:
        self._resolver = ReactiveBindingResolver()
        self._fonts = build_default_font_roster()
        base_path = Path(__file__).resolve().parent / "json"
        registrations = [
            RegisteredProfile(JsonMaschineProfile(base_path / "t1_ctrl.json"), category="Control", order=1),
            RegisteredProfile(JsonMaschineProfile(base_path / "t2_step.json"), category="Control", order=2),
            RegisteredProfile(JsonMaschineProfile(base_path / "t3_brws.json"), category="Sampler", order=3),
            RegisteredProfile(JsonMaschineProfile(base_path / "t4_smpl.json"), category="Sampler", order=4),
            RegisteredProfile(JsonMaschineProfile(base_path / "t5_snap.json"), category="Control", order=5),
            RegisteredProfile(JsonMaschineProfile(base_path / "t6_auto.json"), category="Control", order=6),
            RegisteredProfile(JsonMaschineProfile(base_path / "t7_b_l.json"), category="Brain", order=7),
            RegisteredProfile(JsonMaschineProfile(base_path / "t8_b_r.json"), category="Brain", order=8),
            RegisteredProfile(JsonMaschineProfile(base_path / "t11_tuner.json"), category="Monitor", order=11),
            RegisteredProfile(JsonMaschineProfile(base_path / "t12_metronome.json"), category="Monitor", order=12),
            RegisteredProfile(JsonMaschineProfile(base_path / "t13_incident_log.json"), category="Admin", order=13),
            RegisteredProfile(JsonMaschineProfile(base_path / "t14_kit_browser.json"), category="Sampler", order=14),
            RegisteredProfile(JsonMaschineProfile(base_path / "t15_quad_morph_editor.json"), category="Brain", order=15),
            RegisteredProfile(JsonMaschineProfile(base_path / "t16_monitor.json"), category="Monitor", order=16),
            RegisteredProfile(JsonMaschineProfile(base_path / "t17_system_health.json"), category="Monitor", order=17),
            RegisteredProfile(
                JsonMaschineProfile(base_path / "t18_admin_console.json"),
                category="Admin",
                order=18,
                hidden_from_cycle=True,
                admin_only=True,
            ),
            RegisteredProfile(JsonMaschineProfile(base_path / "t19_midi_learn.json"), category="Control", order=19),
            RegisteredProfile(JsonMaschineProfile(base_path / "t20_macro_recorder.json"), category="Control", order=20),
            RegisteredProfile(JsonMaschineProfile(base_path / "t21_diagnostics.json"), category="Monitor", order=21),
            RegisteredProfile(JsonMaschineProfile(base_path / "t22_log_viewer.json"), category="Admin", order=22),
            RegisteredProfile(JsonMaschineProfile(base_path / "t23_preferences.json"), category="Admin", order=23),
            RegisteredProfile(JsonMaschineProfile(base_path / "t24_help_manual.json"), category="Help", order=24),
            RegisteredProfile(JsonMaschineProfile(base_path / "t25_reference_card.json"), category="Help", order=25),
            RegisteredProfile(JsonMaschineProfile(base_path / "t10_brain_seq.json"), category="Brain", order=10),
            RegisteredProfile(T9EffectChainEditorProfile(), category="Chain", order=9),
        ]
        profiles = [registration.profile for registration in registrations]
        self._profiles = {profile.profile_id: profile for profile in profiles}
        self._registrations = {registration.profile.profile_id: registration for registration in registrations}
        self._renderers: dict[tuple[str, str], RetainedRenderer] = {}
        for profile in profiles:
            self._renderers[(profile.profile_id, "left")] = RetainedRenderer(255, 64)
            self._renderers[(profile.profile_id, "right")] = RetainedRenderer(255, 64)

    @property
    def fonts(self) -> dict[str, BitmapFontAtlas]:
        return self._fonts

    def resolve_profile(self, profile_id: str | None = None, *, context: str | None = None) -> MaschineProfile:
        resolved = str(profile_id or context or "t1_ctrl").strip()
        resolved = PROFILE_ALIASES.get(resolved, resolved)
        return self._profiles.get(resolved, self._profiles["t1_ctrl"])

    def menu_items(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for profile_id, registration in sorted(self._registrations.items(), key=lambda item: item[1].order):
            profile = registration.profile
            items.append(
                {
                    "profile_id": profile.profile_id,
                    "name": profile.profile_name,
                    "description": profile.description,
                    "category": registration.category,
                    "order": registration.order,
                    "hidden_from_cycle": registration.hidden_from_cycle,
                    "admin_only": registration.admin_only,
                }
            )
        return items

    def render(self, state: dict[str, Any], *, profile_id: str | None = None, context: str | None = None) -> RuntimeProfileRender:
        profile = self.resolve_profile(profile_id, context=context)
        registration = self._registrations[profile.profile_id]
        scene = profile.build_scene(state, self._resolver)
        left_panel = self._wrap_panel(scene.left, scene.bars.get("left") or {})
        right_panel = self._wrap_panel(scene.right, scene.bars.get("right") or {})
        left_result = self._renderers[(profile.profile_id, "left")].render(left_panel, fonts=self._fonts)
        right_result = self._renderers[(profile.profile_id, "right")].render(right_panel, fonts=self._fonts)
        return RuntimeProfileRender(
            profile_id=profile.profile_id,
            profile_name=profile.profile_name,
            description=profile.description,
            left=self._serialize_panel(left_result.frame, damage=left_result.damage),
            right=self._serialize_panel(right_result.frame, damage=right_result.damage),
            meta={
                **scene.meta,
                "profile_id": profile.profile_id,
                "profile_name": profile.profile_name,
                "description": profile.description,
                "category": registration.category,
                "order": registration.order,
                "hidden_from_cycle": registration.hidden_from_cycle,
                "admin_only": registration.admin_only,
                "menu_items": self.menu_items(),
            },
        )

    @staticmethod
    def _wrap_panel(body: SceneNode, bars: dict[str, str]) -> SceneNode:
        top = FlexNode(
            direction="row",
            padding=2,
            background=9,
            children=[
                TextNode(str(bars.get("top_left") or "MAP2"), font="spleen"),
                TextNode(str(bars.get("top_right") or "MK1"), font="spleen", align="right"),
            ],
            child_flex=[3, 2],
        )
        bottom = FlexNode(
            direction="row",
            padding=2,
            background=6,
            children=[
                TextNode(str(bars.get("bottom_left") or ""), font="unscii"),
                TextNode(str(bars.get("bottom_right") or ""), font="unscii", align="right"),
            ],
            child_flex=[3, 2],
        )
        return FlexNode(
            direction="column",
            children=[top, body, bottom],
            child_flex=[12, 40, 12],
        )

    @staticmethod
    def _serialize_panel(frame, *, damage) -> dict[str, Any]:
        return {
            "width": frame.width,
            "height": frame.height,
            "format": "xbm",
            "data": frame.to_xbm_hex(),
            "framebuffer": frame.to_mk1_framebuffer().hex(),
            "damage": [rect.__dict__ for rect in damage],
        }
