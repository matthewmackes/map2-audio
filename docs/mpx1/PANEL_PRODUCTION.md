# MPX1 Panel Production Workflow

## Goal
Create and maintain a high-fidelity MPX1 front panel SVG for `/mpx1/panel` with deterministic control IDs and LED hooks.

## Source Capture
1. Capture a straight-on, high-resolution MPX1 front panel photo (minimum 3000px wide).
2. Correct perspective in image editor before vector tracing.
3. Export a neutral reference PNG with no lens distortion.

## Figma Vectorization
1. Import reference PNG into Figma.
2. Lock reference layer and set opacity to ~35%.
3. Rebuild panel geometry with vector primitives (do not auto-trace text).
4. Preserve physical proportions from service-manual dimensions.
5. Name control layers with stable IDs:
   - `data-mpx1-control="<param_id>"` for editable controls.
   - `data-mpx1-led="<led_id>"` for LED circles.
6. Keep LCD text layer separate and replace with runtime text node in code.

## Export
1. Export as optimized SVG.
2. Remove editor-specific metadata and transforms.
3. Ensure numeric precision is <= 2 decimal places.
4. Validate SVG opens in browser and scales correctly.

## Integration Checklist
1. Place SVG markup inline in `web/src/app/components/MPX1/MPX1Panel.tsx`.
2. Confirm all control IDs map to registry parameters.
3. Confirm LED IDs used by runtime update effect.
4. Verify offline/bypass overlays remain readable on panel background.
5. Verify click targets are large enough for touch (>= 36px).

## Runtime Validation
1. Open `/mpx1/panel` while device connected.
2. Move mapped hardware controls and confirm LED/LCD update behavior.
3. Click controls and confirm popover editor updates parameter state.
4. Validate `last SysEx activity` readout updates without blocking UI.
