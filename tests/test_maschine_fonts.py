from __future__ import annotations

from app.services.maschine.fonts import build_default_font_roster


def test_map2_display_face_includes_logo_tokens_and_music_symbols() -> None:
    atlas = build_default_font_roster()["map2_display_32"]

    for token in ("MAP2_LOGO", "MAP2_MONOGRAM", "♪", "♫", "♩", "♬", "♭", "♯"):
        glyph = atlas.glyph(token)
        assert len(glyph) == atlas.pixel_height
        assert any("1" in row for row in glyph)


def test_map2_display_face_aliases_logo_tokens_for_single_character_rendering() -> None:
    atlas = build_default_font_roster()["map2_display_32"]

    assert atlas.glyph("¤") == atlas.glyph("MAP2_LOGO")
    assert atlas.glyph("§") == atlas.glyph("MAP2_MONOGRAM")
