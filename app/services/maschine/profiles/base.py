"""Maschine MK1 profile definitions and reactive binding helpers."""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.services.maschine.render import FlexNode, ProgressNode, RuleNode, SceneNode, TextNode


@dataclass(frozen=True)
class ProfileScene:
    left: SceneNode
    right: SceneNode
    meta: dict[str, Any]
    bars: dict[str, dict[str, str]]


class ReactiveBindingResolver:
    def resolve(self, expression: str | None, state: dict[str, Any], *, local: dict[str, Any] | None = None) -> Any:
        if expression is None:
            return None
        token = str(expression).strip()
        if not token:
            return None
        if token in {"true", "false"}:
            return token == "true"
        if token.isdigit():
            return int(token)
        scope: dict[str, Any] = dict(state)
        if local:
            scope.update(local)
        current: Any = scope
        for chunk in token.split("."):
            if isinstance(current, dict):
                current = current.get(chunk)
            elif isinstance(current, list):
                try:
                    current = current[int(chunk)]
                except Exception:
                    return None
            else:
                current = getattr(current, chunk, None)
            if current is None:
                return None
        return current

    def render_template(self, template: str, state: dict[str, Any], *, local: dict[str, Any] | None = None) -> str:
        text = str(template or "")
        for token in set(part.strip() for part in text.split("{{") if "}}" in part):
            expression = token.split("}}", 1)[0].strip()
            value = self.resolve(expression, state, local=local)
            text = text.replace(f"{{{{{expression}}}}}", "" if value is None else str(value))
        return " ".join(text.split())


class MaschineProfile(ABC):
    profile_id: str
    profile_name: str
    description: str

    @abstractmethod
    def build_scene(self, state: dict[str, Any], resolver: ReactiveBindingResolver) -> ProfileScene:
        raise NotImplementedError


class JsonMaschineProfile(MaschineProfile):
    def __init__(self, path: Path) -> None:
        self.path = path
        payload = json.loads(path.read_text(encoding="utf-8"))
        self.profile_id = str(payload["id"])
        self.profile_name = str(payload["name"])
        self.description = str(payload["description"])
        self._payload = payload

    def build_scene(self, state: dict[str, Any], resolver: ReactiveBindingResolver) -> ProfileScene:
        return ProfileScene(
            left=self._compile_descriptor(self._payload["left"], state, resolver, local={}),
            right=self._compile_descriptor(self._payload["right"], state, resolver, local={}),
            meta={
                "profile_id": self.profile_id,
                "profile_name": self.profile_name,
                "description": self.description,
            },
            bars=self._resolve_bars(state, resolver),
        )

    def _resolve_bars(self, state: dict[str, Any], resolver: ReactiveBindingResolver) -> dict[str, dict[str, str]]:
        raw = dict(self._payload.get("bars") or {})
        bars: dict[str, dict[str, str]] = {}
        for panel in ("left", "right"):
            panel_payload = dict(raw.get(panel) or {})
            bars[panel] = {
                "top_left": resolver.render_template(str(panel_payload.get("top_left", self.profile_name)), state),
                "top_right": resolver.render_template(str(panel_payload.get("top_right", "MAP2")), state),
                "bottom_left": resolver.render_template(str(panel_payload.get("bottom_left", self.description)), state),
                "bottom_right": resolver.render_template(str(panel_payload.get("bottom_right", "LIVE")), state),
            }
        return bars

    def _compile_descriptor(
        self,
        descriptor: dict[str, Any],
        state: dict[str, Any],
        resolver: ReactiveBindingResolver,
        *,
        local: dict[str, Any],
    ) -> SceneNode:
        kind = str(descriptor.get("type") or "text")
        if kind == "row" or kind == "column":
            children = [
                self._compile_descriptor(child, state, resolver, local=local)
                for child in list(descriptor.get("children") or [])
            ]
            return FlexNode(
                direction="row" if kind == "row" else "column",
                children=children,
                gap=int(descriptor.get("gap", 0) or 0),
                padding=int(descriptor.get("padding", 0) or 0),
                background=int(descriptor["background"]) if descriptor.get("background") is not None else None,
                child_flex=[int(child.get("flex", 1) or 1) for child in list(descriptor.get("children") or [])] or None,
            )
        if kind == "repeat":
            items = resolver.resolve(str(descriptor.get("binding") or ""), state, local=local)
            template = dict(descriptor.get("template") or {})
            children = []
            for item in list(items or [])[: int(descriptor.get("limit", 5) or 5)]:
                children.append(self._compile_descriptor(template, state, resolver, local={**local, "item": item}))
            return FlexNode(
                direction=str(descriptor.get("direction") or "column"),
                children=children,
                gap=int(descriptor.get("gap", 0) or 0),
                padding=int(descriptor.get("padding", 0) or 0),
            )
        if kind == "rule":
            return RuleNode(brightness=int(descriptor.get("brightness", 18) or 18))
        if kind == "progress":
            value = resolver.resolve(str(descriptor.get("value") or "0"), state, local=local)
            min_value = float(resolver.resolve(str(descriptor.get("min") or "0"), state, local=local) or 0.0)
            max_value = float(resolver.resolve(str(descriptor.get("max") or "1"), state, local=local) or 1.0)
            numeric_value = float(value or 0.0)
            ratio = 0.0 if max_value <= min_value else (numeric_value - min_value) / (max_value - min_value)
            return ProgressNode(
                ratio=max(0.0, min(1.0, ratio)),
                fill_brightness=int(descriptor.get("fill_brightness", 31) or 31),
                track_brightness=int(descriptor.get("track_brightness", 6) or 6),
            )
        text = resolver.render_template(str(descriptor.get("text", "")), state, local=local)
        return TextNode(
            text=text,
            font=str(descriptor.get("font", "spleen") or "spleen"),
            brightness=int(descriptor.get("brightness", 31) or 31),
            align=str(descriptor.get("align", "left") or "left"),
            invert_background=bool(resolver.resolve(str(descriptor.get("invert_when") or "false"), state, local=local)),
        )

