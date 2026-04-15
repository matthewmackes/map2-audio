/**
 * Expression Pedal Control - Premium Audio Device Design Tokens
 * Inspired by professional audio devices (Digitech, AxeFX, Boss)
 */

export const expressionTokens = {
  // ============================================================================
  // COLOR PALETTE - Premium Audio Device Aesthetic
  // ============================================================================
  
  colors: {
    // Backgrounds
    background: '#161616',      // Deep black
    panelPrimary: '#262626',    // Dark charcoal
    panelSecondary: '#333333',  // Medium charcoal
    panelTertiary: '#1f1f1f',   // Very dark
    
    // Interactive & Accent Colors
    primary: '#0f62fe',         // IBM Blue - Primary interactive
    primaryHover: '#0353e9',    // Darker blue on hover
    primaryActive: '#024cbd',   // Darkest blue when active
    
    // Audio Device Colors
    liveIndicator: '#009d9a',   // Teal - Real-time feedback
    curve: '#8a3ffc',           // Purple - Response visualization
    
    // Status Colors
    active: '#24a148',          // Green - Active state
    warning: '#f1c21b',         // Amber - Attention
    error: '#da1e28',           // Red - Errors, disabled
    
    // Text Colors
    textPrimary: '#f4f4f4',     // Main text
    textSecondary: '#c6c6c6',   // Secondary text
    textTertiary: '#8d8d8d',    // Muted/helper text
    textMuted: '#525252',       // Very muted text
    
    // Borders & Dividers
    border: '#525252',          // Standard border
    borderSubtle: '#3d3d3d',    // Subtle border
    borderStrong: '#666666',    // Strong border
  },
  
  // ============================================================================
  // TYPOGRAPHY
  // ============================================================================
  
  typography: {
    fontFamily: {
      ui: 'var(--font-ui)',
      mono: 'var(--font-mono)',
      display: 'var(--font-display)',
    },
    
    // Page Title
    pageTitle: {
      fontSize: '26px',
      fontWeight: 700,
      letterSpacing: '0.01em',
      lineHeight: 1.2,
    },
    
    // Section Headers
    sectionHeader: {
      fontSize: '14px',
      fontWeight: 600,
      letterSpacing: '0.02em',
      textTransform: 'uppercase' as const,
      lineHeight: 1.3,
    },
    
    // Field Labels
    fieldLabel: {
      fontSize: '12px',
      fontWeight: 500,
      letterSpacing: '0.01em',
      lineHeight: 1.2,
    },
    
    // Body Text
    bodySmall: {
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: 1.4,
    },
    
    bodyMedium: {
      fontSize: '13px',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    
    // Monospace (for values, code)
    monospaceSmall: {
      fontSize: '11px',
      fontWeight: 400,
      letterSpacing: '0.02em',
      lineHeight: 1.3,
    },
    
    monospaceMedium: {
      fontSize: '13px',
      fontWeight: 400,
      letterSpacing: '0.01em',
      lineHeight: 1.4,
    },
  },
  
  // ============================================================================
  // SPACING
  // ============================================================================
  
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    xxl: '24px',
    xxxl: '32px',
  },
  
  // ============================================================================
  // BORDER RADIUS
  // ============================================================================
  
  borderRadius: {
    sm: '4px',
    md: '6px',
    lg: '8px',
  },
  
  // ============================================================================
  // SHADOWS & DEPTH
  // ============================================================================
  
  shadows: {
    // Subtle elevation shadows (professional audio device style)
    elevation1: '0 1px 2px rgba(0, 0, 0, 0.3)',
    elevation2: '0 2px 4px rgba(0, 0, 0, 0.4)',
    elevation3: '0 4px 8px rgba(0, 0, 0, 0.5)',
    
    // Focus state
    focus: '0 0 0 2px rgba(15, 98, 254, 0.3)',
    
    // Glow effects for active elements
    glowTeal: '0 0 8px rgba(0, 157, 154, 0.3)',
    glowBlue: '0 0 8px rgba(15, 98, 254, 0.3)',
    glowPurple: '0 0 8px rgba(138, 63, 252, 0.3)',
  },
  
  // ============================================================================
  // TRANSITIONS & ANIMATIONS
  // ============================================================================
  
  transitions: {
    fast: '0.12s ease-in-out',
    normal: '0.2s ease-in-out',
    slow: '0.3s ease-in-out',
  },
  
  animations: {
    // Easing functions for Framer Motion
    easeIn: [0.4, 0, 1, 1],
    easeOut: [0, 0, 0.2, 1],
    easeInOut: [0.4, 0, 0.2, 1],
    easeQuad: [0.25, 0.46, 0.45, 0.94],
    easeCubic: [0.25, 0.46, 0.45, 0.94],
  },
  
  // ============================================================================
  // COMPONENT-SPECIFIC SIZES
  // ============================================================================
  
  sizes: {
    assignmentCardHeight: '56px',
    assignmentCardHeightCompact: '48px',
    meterWidth: '40px',
    meterHeight: '200px',
    curvePreviewSize: '120px',
    curveEditorSize: '200px',
  },
  
  // ============================================================================
  // Z-INDEX SCALE
  // ============================================================================
  
  zIndex: {
    base: 0,
    content: 1,
    dropdown: 100,
    modal: 200,
    tooltip: 300,
  },
} as const

/**
 * Create inline style objects for common component patterns
 */
export const expressionStyles = {
  // Assignment card
  assignmentCard: (selected: boolean, highlighted: boolean): React.CSSProperties => ({
    border: selected 
      ? `1px solid ${expressionTokens.colors.primary}`
      : highlighted
        ? `1px solid ${expressionTokens.colors.liveIndicator}`
        : `1px solid ${expressionTokens.colors.border}`,
    background: selected
      ? `${expressionTokens.colors.primary}1f`
      : highlighted
        ? `${expressionTokens.colors.liveIndicator}0d`
        : expressionTokens.colors.panelPrimary,
    borderRadius: expressionTokens.borderRadius.md,
    padding: `${expressionTokens.spacing.md} ${expressionTokens.spacing.lg}`,
    cursor: 'pointer',
    transition: `all ${expressionTokens.transitions.fast}`,
  }),
  
  // Input field
  inputField: (): React.CSSProperties => ({
    width: '100%',
    background: expressionTokens.colors.panelSecondary,
    color: expressionTokens.colors.textPrimary,
    border: `1px solid ${expressionTokens.colors.border}`,
    borderRadius: expressionTokens.borderRadius.sm,
    padding: `6px 8px`,
    fontSize: expressionTokens.typography.monospaceMedium.fontSize,
    fontFamily: expressionTokens.typography.fontFamily.mono,
    outline: 'none',
    transition: `all ${expressionTokens.transitions.fast}`,
  }),
  
  // Button base
  buttonBase: (variant: 'primary' | 'secondary' | 'danger' = 'primary'): React.CSSProperties => {
    const variants = {
      primary: {
        background: expressionTokens.colors.primary,
        color: '#fff',
        border: 'none',
        hover: expressionTokens.colors.primaryHover,
      },
      secondary: {
        background: 'transparent',
        color: expressionTokens.colors.textSecondary,
        border: `1px solid ${expressionTokens.colors.border}`,
        hover: expressionTokens.colors.panelSecondary,
      },
      danger: {
        background: 'transparent',
        color: expressionTokens.colors.error,
        border: `1px solid ${expressionTokens.colors.error}`,
        hover: `${expressionTokens.colors.error}22`,
      },
    }
    
    const v = variants[variant]
    return {
      background: v.background,
      color: v.color,
      border: v.border,
      borderRadius: expressionTokens.borderRadius.sm,
      fontFamily: expressionTokens.typography.fontFamily.ui,
      fontSize: '13px',
      fontWeight: 500,
      padding: '8px 12px',
      cursor: 'pointer',
      transition: `all ${expressionTokens.transitions.fast}`,
    }
  },
  
  // Field label
  fieldLabel: (): React.CSSProperties => ({
    display: 'block',
    fontFamily: expressionTokens.typography.fontFamily.ui,
    color: expressionTokens.colors.textTertiary,
    fontSize: expressionTokens.typography.fieldLabel.fontSize,
    marginBottom: expressionTokens.spacing.sm,
    fontWeight: 500,
    letterSpacing: '0.01em',
  }),
  
  // Panel container
  panelContainer: (): React.CSSProperties => ({
    background: expressionTokens.colors.panelPrimary,
    border: `1px solid ${expressionTokens.colors.border}`,
    borderRadius: expressionTokens.borderRadius.md,
    padding: expressionTokens.spacing.lg,
    transition: `all ${expressionTokens.transitions.normal}`,
  }),
}

export default expressionTokens
