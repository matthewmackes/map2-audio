# Shared Frontend Surfaces

`web/src/shared/` is reserved for code that is actively consumed by more than one
frontend surface.

## Why `PluginChooser` Stays Here

`components/PluginChooser/` currently has two live consumers in different trees:

- `web/src/map2/components/ChainBuilder.tsx` imports the chooser UI plus
  normalization helpers used by the MAP2 chain builder flow.
- `web/src/app/components/pluginAppearance/PluginAppearanceIcon.tsx` imports
  the chooser's legacy glyph/type compatibility surface
  (`LegacyPluginIcon` + `PluginType`) for plugin-appearance fallbacks.

Because both `map2` and `app` depend on this package today, moving it under
`web/src/app/components/` would create a backward dependency from `map2` into
`app`, which is a worse ownership boundary than keeping it in `shared/`.

## Migration Trigger

Move `PluginChooser` out of `shared/` only after one of these becomes true:

- the MAP2 surface stops importing it, or
- the app/plugin-appearance surface stops reusing its legacy icon/type helpers, or
- a new dedicated cross-surface package replaces `shared/`.

## Current Scope

The active reason this directory exists is `PluginChooser`. The sibling
`shared/constants/` files are currently unreferenced compatibility stubs and do
not change the ownership decision above.
