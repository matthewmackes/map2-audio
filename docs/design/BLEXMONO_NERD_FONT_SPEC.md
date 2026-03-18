# BlexMono Nerd Font Typography and Glyph Spec

## Source

- Family: `BlexMono Nerd Font`
- Upstream vendor: Nerd Fonts
- Pinned release: `v3.4.0`
- Upstream asset: `IBMPlexMono.zip`
- Delivery model: self-hosted web subsets under `web/public/fonts/blexmono-nerd/v3.4.0/`

## System Rules

- `BlexMono Nerd Font` is the default UI family for active and legacy frontend surfaces unless a documented authenticity exemption applies.
- Carbon and MAP SVG icons remain the primary icon system.
- Nerd Font glyphs are secondary compact affordances for dense/mobile UI, telemetry, status chips, and constrained action clusters.
- Desktop may keep text labels when space allows.
- Mobile and tight layouts may use glyph-only controls, but those controls must preserve accessible naming via ARIA or equivalent hidden text.
- If a Carbon icon is clearer than a Nerd Font glyph, use the Carbon icon.
- Any glyph not in the approved list below is out of policy until added to this spec.

## Typography Tokens

- `--font-ui`: default UI family
- `--font-ui-tight`: compact UI family for dense surfaces; same family, tighter spacing rules
- `--font-mono`: code/log/readout family
- Carbon-compatible aliases remain mapped onto the same family

## Approved Nerd Font PUA Glyph Set

The initial web subset includes only this explicit allowlist of Private Use Area glyphs.

| Codepoint | Name | Intended use |
| --- | --- | --- |
| `U+E0A0` | `pl-branch` | branch or split-path metadata |
| `U+E0B0` | `pl-left_hard_divider` | compact segmented pills |
| `U+E0B1` | `pl-left_soft_divider` | compact segmented pills |
| `U+E0B2` | `pl-right_hard_divider` | compact segmented pills |
| `U+E0B3` | `pl-right_soft_divider` | compact segmented pills |
| `U+E0B6` | `ple-left_half_circle_thick` | compact badge framing |
| `U+E0B7` | `ple-left_half_circle_thin` | compact badge framing |
| `U+EA6C` | `cod-warning` | tight warning affordances |
| `U+EA6D` | `cod-search` | compact search affordances |
| `U+EA76` | `cod-close` | compact close affordances |
| `U+EA78` | `cod-desktop_download` | download status/action shorthand |
| `U+EA80` | `cod-new_folder` | new-group/create collection affordances |
| `U+EA83` | `cod-folder` | collection/library shorthand |
| `U+EAB2` | `cod-check` | compact success or selected state |
| `U+EAF1` | `cod-filter` | filter shorthand |
| `U+EB03` | `cod-graph` | metrics/graph shorthand |
| `U+EB14` | `cod-link_external` | outbound/open detail affordances |
| `U+EB15` | `cod-link` | link or connection shorthand |
| `U+EB2C` | `cod-play` | transport/play action shorthand |
| `U+EB4E` | `cod-search_stop` | stop scan/search shorthand |
| `U+EB50` | `cod-server` | host/service shorthand |
| `U+EB51` | `cod-settings_gear` | settings/config affordances |
| `U+EB83` | `cod-list_filter` | dense list filtering |
| `U+EBA5` | `cod-stop_circle` | stop action shorthand |
| `U+EBA6` | `cod-play_circle` | play action shorthand |
| `U+EBA7` | `cod-record` | record/capture shorthand |
| `U+EBB1` | `cod-check_all` | batch selected/complete state |
| `U+EBCE` | `cod-filter_filled` | active filter state |
| `U+EC19` | `cod-chip` | CPU/chip/device shorthand |
| `U+EC1B` | `cod-music` | audio/music shorthand |
| `U+F017` | `fa-clock_o` | time/status shorthand |
| `U+F026` | `fa-volume_off` | muted state |
| `U+F027` | `fa-volume_low` | low output state |
| `U+F028` | `fa-volume_up` | output/audio state |
| `U+F071` | `fa-warning` | warning shorthand |
| `U+F0C1` | `fa-link` | connection/link shorthand |
| `U+F1EB` | `fa-wifi` | network/wireless shorthand |
| `U+F233` | `fa-server` | server/host shorthand |
| `U+F2DB` | `fa-microchip` | processor/hardware shorthand |
| `U+F418` | `oct-git_branch` | route/branch topology shorthand |
| `U+F422` | `oct-search` | search shorthand |
| `U+F437` | `oct-graph` | analytics shorthand |
| `U+F43A` | `oct-clock` | clock/timing shorthand |
| `U+F44C` | `oct-link` | connection shorthand |
| `U+F498` | `oct-desktop_download` | desktop download shorthand |
| `U+F529` | `oct-unlink` | disconnect/unlink shorthand |

## Standard Unicode Allowed

Standard Unicode symbols remain preferred when they are clearer and interoperable:

- arrows and chevrons
- box drawing and block elements
- geometric shapes
- common transport and warning symbols
- mathematical, timing, and relationship marks used in technical readouts

## Exemptions

- Authenticated or period-faithful device emulation surfaces may retain local typography where BlexMono would reduce authenticity.
- Any exemption must be documented in the worklist or code comment near the override.
