# MAP2 Brand Mark System Brief

## Goal

Use the blue grid mark as the canonical MAP2 platform brand image and apply it in one standard system across the UI.

## Approved Direction

- The attached image is a visual reference, not a locked final raster.
- Production usage must be transparent-background artwork.
- The primary product shorthand remains `MAP2`.
- The supporting secondary text is `Mackes Audio Platform` plus the version number in the smallest IBM-aligned caption treatment.
- Non-home routes use the mark as a subtle background or shell/header accent, not as a repeated large hero.
- No route families are excluded in advance; all routes inherit the system unless a later validation issue forces a tracked exception.

## Placement Model

1. Home:
   Use the mark as the primary hero expression with the strongest visual weight.

2. Shared shell:
   Show a compact brand lockup in the top bar so the platform identity is always visible.

3. Shared page headers:
   Show a restrained lockup on standard headers when a page does not already provide its own explicit logo.

4. Global background:
   Apply a low-opacity fixed watermark treatment behind the full app frame so every route inherits the brand image without layout-specific duplication.

## Implementation Notes

- Canonical asset: `web/src/assets/map2-brand-mark.svg`
- Shared brand helpers: `web/src/app/components/branding/map2Branding.tsx`
- Shell integration: `web/src/app/layout/AppShell.tsx`
- Header integration: `web/src/app/components/PageHeader.tsx`
- Hero integration: `web/src/app/pages/HomePage.tsx`

## Validation Standard

- Preserve readability and operational hierarchy on dense routes.
- Keep the watermark low-contrast and non-interactive.
- Keep the top-bar lockup compact enough to avoid navigation regression on small screens.
- Verify with focused frontend tests, `npm --prefix web run typecheck`, and `npm --prefix web run build`.
