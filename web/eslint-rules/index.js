/**
 * MAP2 local ESLint plugin (T2481-A3 — Carbon Deepening Pass, Foundation Phase).
 *
 * Hosts the bespoke rules that protect the Carbon discipline contract:
 *   - `map2/no-mui-import`           — bans `@mui/*` and `@emotion/styled`
 *                                       imports. MUI was retired 2026-04-30
 *                                       in T2475-E1; this rule prevents
 *                                       reintroduction.
 *   - `map2/no-ad-hoc-transition`    — bans inline `transition: ... ease`
 *                                       declarations in JSX `style={...}`
 *                                       and `style.transition = ...` writes.
 *                                       Carbon motion durations + easings
 *                                       (`--map2-dur-*`, `--map2-ease-*`)
 *                                       must come from the design-language
 *                                       token surface.
 *   - `map2/no-hardcoded-px-spacing` — bans raw `Npx` literals on
 *                                       padding/margin/gap/inset/top/right/
 *                                       bottom/left properties inside JSX
 *                                       `style={...}`. Spacing must use
 *                                       Carbon tokens (`var(--cds-spacing-*)`,
 *                                       `var(--map2-spacing-*)`).
 *
 * Each rule supports a `// carbon-allow: <reason>` escape hatch on the
 * preceding line so CI doesn't break on legitimate hardware-skin / device-
 * graphics exemptions (per CARBON_CONFORMANCE_STANDARD §10.5).
 *
 * The plugin lives in-tree under `web/eslint-rules/` (no separate package)
 * and is imported into `web/eslint.config.js` directly.
 */

const noMuiImport = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'MUI was retired in T2475-E1 (2026-04-30). All chrome must come from @carbon/react.',
    },
    schema: [],
    messages: {
      banned:
        'Do not import "{{source}}". MUI was retired (T2475-E1, 2026-04-30); use @carbon/react. ' +
        'If you genuinely need MUI for a hardware-skin (CARBON_CONFORMANCE_STANDARD §10.5) ' +
        'add a `// carbon-allow: <reason> + <worklist-link>` comment on the line above.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()

    function hasCarbonAllowOnPrecedingLine(node) {
      const comments = sourceCode.getCommentsBefore(node)
      return comments.some((c) => /carbon-allow\s*:/i.test(c.value))
    }

    function check(node, source) {
      if (typeof source !== 'string') return
      const banned =
        source === '@mui' ||
        source.startsWith('@mui/') ||
        source === '@emotion/styled' ||
        source.startsWith('@emotion/styled/')
      if (!banned) return
      if (hasCarbonAllowOnPrecedingLine(node)) return
      context.report({ node, messageId: 'banned', data: { source } })
    }

    return {
      ImportDeclaration(node) {
        check(node, node.source && node.source.value)
      },
      ImportExpression(node) {
        if (node.source && node.source.type === 'Literal') {
          check(node, node.source.value)
        }
      },
      CallExpression(node) {
        if (
          node.callee &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'Literal'
        ) {
          check(node, node.arguments[0].value)
        }
      },
    }
  },
}

const TRANSITION_AD_HOC_VALUES = /\b(?:ease|ease-in|ease-out|ease-in-out)\b/i
const TRANSITION_TOKEN_REF = /var\(\s*--(?:map2-dur|map2-ease|cds-)/

function reportIfAdHocTransition(context, node, valueText) {
  if (typeof valueText !== 'string') return
  if (!TRANSITION_AD_HOC_VALUES.test(valueText)) return
  if (TRANSITION_TOKEN_REF.test(valueText)) return
  context.report({
    node,
    messageId: 'adhoc',
    data: { value: valueText.trim() },
  })
}

const noAdHocTransition = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Use Carbon motion tokens (--map2-dur-*, --map2-ease-*) for transitions instead of ad-hoc ease/ease-in-out.',
    },
    schema: [],
    messages: {
      adhoc:
        'Ad-hoc transition `{{value}}`. Use Carbon motion tokens — ' +
        '`var(--map2-dur-fast-01)` ... `var(--map2-dur-slow-02)` paired with ' +
        '`var(--map2-ease-productive-*)` or `var(--map2-ease-expressive-*)`. ' +
        'Audio-domain motion (meter ballistics, gate LED, tuner needle, AVB grid hover) ' +
        'is exempt — annotate with `// carbon-allow: <reason>`.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()
    function hasCarbonAllowOnPrecedingLine(node) {
      const comments = sourceCode.getCommentsBefore(node)
      return comments.some((c) => /carbon-allow\s*:/i.test(c.value))
    }
    return {
      // Inline JSX style={{ transition: 'all 200ms ease-in-out' }}
      Property(node) {
        if (
          node.key &&
          ((node.key.type === 'Identifier' && node.key.name === 'transition') ||
            (node.key.type === 'Literal' && node.key.value === 'transition'))
        ) {
          if (
            node.value &&
            node.value.type === 'Literal' &&
            typeof node.value.value === 'string'
          ) {
            if (hasCarbonAllowOnPrecedingLine(node)) return
            reportIfAdHocTransition(context, node, node.value.value)
          } else if (
            node.value &&
            node.value.type === 'TemplateLiteral' &&
            node.value.quasis.length === 1
          ) {
            if (hasCarbonAllowOnPrecedingLine(node)) return
            reportIfAdHocTransition(
              context,
              node,
              node.value.quasis[0].value.cooked,
            )
          }
        }
      },
    }
  },
}

const SPACING_PROPS = new Set([
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingInline',
  'paddingInlineStart',
  'paddingInlineEnd',
  'paddingBlock',
  'paddingBlockStart',
  'paddingBlockEnd',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginInline',
  'marginInlineStart',
  'marginInlineEnd',
  'marginBlock',
  'marginBlockStart',
  'marginBlockEnd',
  'gap',
  'rowGap',
  'columnGap',
  'inset',
  'top',
  'right',
  'bottom',
  'left',
])

const PX_LITERAL = /-?\d+(?:\.\d+)?px\b/i
const PX_TOKEN_REF = /var\(\s*--(?:map2-spacing|map2-space|cds-spacing)/

function reportIfHardcodedPx(context, node, propName, valueText) {
  if (typeof valueText !== 'string') return
  if (!PX_LITERAL.test(valueText)) return
  if (PX_TOKEN_REF.test(valueText)) return
  // Permit `0` and the canonical reset shapes — they come through as numeric
  // values in the AST so we never get here.
  context.report({
    node,
    messageId: 'hardcoded',
    data: { prop: propName, value: valueText.trim() },
  })
}

const noHardcodedPxSpacing = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Use Carbon spacing tokens (--map2-spacing-01..13 / --cds-spacing-*) for padding/margin/gap/inset/top/right/bottom/left instead of raw px.',
    },
    schema: [],
    messages: {
      hardcoded:
        'Hardcoded `{{value}}` on `{{prop}}`. Use Carbon spacing tokens — ' +
        '`var(--map2-spacing-01..13)` or `var(--cds-spacing-*)`. ' +
        'Audio-domain pixel-exact cases (meter needles, signal-flow line widths, etc.) ' +
        'are exempt — annotate with `// carbon-allow: <reason>`.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()
    function hasCarbonAllowOnPrecedingLine(node) {
      const comments = sourceCode.getCommentsBefore(node)
      return comments.some((c) => /carbon-allow\s*:/i.test(c.value))
    }
    return {
      Property(node) {
        if (!node.key) return
        const propName =
          node.key.type === 'Identifier'
            ? node.key.name
            : node.key.type === 'Literal' && typeof node.key.value === 'string'
            ? node.key.value
            : null
        if (!propName || !SPACING_PROPS.has(propName)) return
        if (
          node.value &&
          node.value.type === 'Literal' &&
          typeof node.value.value === 'string'
        ) {
          if (hasCarbonAllowOnPrecedingLine(node)) return
          reportIfHardcodedPx(context, node, propName, node.value.value)
        } else if (
          node.value &&
          node.value.type === 'TemplateLiteral' &&
          node.value.quasis.length === 1
        ) {
          if (hasCarbonAllowOnPrecedingLine(node)) return
          reportIfHardcodedPx(
            context,
            node,
            propName,
            node.value.quasis[0].value.cooked,
          )
        }
      },
    }
  },
}

const FONT_FAMILY_LITERAL_BANS = /\b(?:IBM Plex (?:Sans|Mono)|Helvetica Neue|Arial|Georgia|Menlo|Consolas|SFMono-Regular|SF Mono|Segoe UI|Courier New|monospace|sans-serif|serif|system-ui|ui-monospace)\b/i
const FONT_FAMILY_TOKEN_REF = /var\(\s*--(?:font-ui|font-mono|map2-type|cds-(?:body|heading|code|label|helper|productive|expressive|legal)|shell-f-)/

function reportIfHardcodedFontFamily(context, node, valueText) {
  if (typeof valueText !== 'string') return
  if (!FONT_FAMILY_LITERAL_BANS.test(valueText)) return
  if (FONT_FAMILY_TOKEN_REF.test(valueText)) return
  context.report({
    node,
    messageId: 'hardcoded',
    data: { value: valueText.trim() },
  })
}

const noHardcodedFontFamily = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Use platform font tokens (--font-ui, --font-mono) or Carbon type tokens (--cds-body-*, --cds-heading-*, --cds-code-*) for fontFamily instead of literal font-stack strings.',
    },
    schema: [],
    messages: {
      hardcoded:
        'Hardcoded fontFamily `{{value}}`. Use the platform token surface — ' +
        '`var(--font-ui, ...)` for UI prose, `var(--font-mono, ...)` for numeric readouts, ' +
        'or a Carbon type token `var(--cds-{body,heading,code,label}-*-font-family, ...)`. ' +
        'Hardware-skin / device-graphics renderings (CARBON_CONFORMANCE_STANDARD §10.5) ' +
        'are exempt — annotate with `// carbon-allow: <reason>`.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()
    function hasCarbonAllowOnPrecedingLine(node) {
      const comments = sourceCode.getCommentsBefore(node)
      return comments.some((c) => /carbon-allow\s*:/i.test(c.value))
    }
    return {
      // JSX style={{ fontFamily: '...' }}
      Property(node) {
        if (!node.key) return
        const propName =
          node.key.type === 'Identifier'
            ? node.key.name
            : node.key.type === 'Literal' && typeof node.key.value === 'string'
            ? node.key.value
            : null
        if (propName !== 'fontFamily') return
        if (
          node.value &&
          node.value.type === 'Literal' &&
          typeof node.value.value === 'string'
        ) {
          if (hasCarbonAllowOnPrecedingLine(node)) return
          reportIfHardcodedFontFamily(context, node, node.value.value)
        } else if (
          node.value &&
          node.value.type === 'TemplateLiteral' &&
          node.value.quasis.length === 1
        ) {
          if (hasCarbonAllowOnPrecedingLine(node)) return
          reportIfHardcodedFontFamily(
            context,
            node,
            node.value.quasis[0].value.cooked,
          )
        }
      },
      // SVG <text fontFamily="..."> attribute
      JSXAttribute(node) {
        if (!node.name || node.name.name !== 'fontFamily') return
        if (
          node.value &&
          node.value.type === 'Literal' &&
          typeof node.value.value === 'string'
        ) {
          if (hasCarbonAllowOnPrecedingLine(node)) return
          reportIfHardcodedFontFamily(context, node, node.value.value)
        }
      },
    }
  },
}

const plugin = {
  rules: {
    'no-mui-import': noMuiImport,
    'no-ad-hoc-transition': noAdHocTransition,
    'no-hardcoded-px-spacing': noHardcodedPxSpacing,
    'no-hardcoded-font-family': noHardcodedFontFamily,
  },
}

export default plugin
