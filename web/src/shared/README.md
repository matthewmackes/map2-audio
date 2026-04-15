# Shared Frontend Surfaces

`web/src/shared/` is reserved for code that is actively consumed by more than one
frontend surface.

## Why `PluginChooser` Stays Here

`components/PluginChooser/` currently has one live app consumer, but it still
stays here as a compatibility boundary until a dedicated owner package replaces
`shared/`.

- `web/src/app/components/pluginAppearance/PluginAppearanceIcon.tsx` imports
  the chooser's legacy glyph/type compatibility surface
  (`LegacyPluginIcon` + `PluginType`) for plugin-appearance fallbacks.

The legacy `map2` chain-builder consumer has been removed, but the chooser has
not been relocated yet. Keeping it in `shared/` avoids mixing that follow-up
ownership move into unrelated cleanup passes.

## Migration Trigger

Move `PluginChooser` out of `shared/` when either:

- the app/plugin-appearance surface stops reusing its legacy icon/type helpers, or
- a new dedicated cross-surface package replaces `shared/`.

## Current Scope

The active reason this directory still exists is `PluginChooser`.
