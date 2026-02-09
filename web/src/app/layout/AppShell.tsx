import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { PanelsTopLeft, Sparkles, Info, Package, AudioLines, Piano, LayoutGrid, Activity, Sliders, Usb, BookOpen, Monitor, Menu, X, Server, Radio, Flame, Drum, Guitar } from 'lucide-react'
import { useSpecialSettings } from '../hooks/useSpecialSettings'

const enableLegacy = import.meta.env.VITE_ENABLE_LEGACY === 'true'

// Items under the "hic sunt dracones" dropdown
// Grouped with dividerBefore to visually separate categories
const underTheHoodItems = [
  // ── System ──
  {
    to: '/',
    label: 'Overview',
    icon: Sparkles,
    description: 'System status & quick actions',
    color: '#f59e0b',  // Amber
    group: 'System',
  },
  {
    to: '/presets',
    label: 'Presets',
    icon: PanelsTopLeft,
    description: 'Save & recall your sounds',
    color: '#22c55e',  // Green
    group: 'System',
  },

  // ── Content & Plugins ──
  {
    to: '/plugins',
    label: 'LV2 Plugins',
    icon: Package,
    description: 'LV2 plugin manager',
    color: '#06b6d4',  // Teal
    dividerBefore: true,
    group: 'Content & Plugins',
  },
  {
    to: '/library',
    label: 'IR & NAM Library',
    icon: AudioLines,
    description: 'Impulse responses & NAM models',
    color: '#06b6d4',  // Teal
    group: 'Content & Plugins',
  },

  // ── Audio Processing ──
  {
    to: '/metering',
    label: 'Metering',
    icon: Activity,
    description: 'Audio analysis & monitoring',
    color: '#37d6c9',  // Cyan-teal
    dividerBefore: true,
    group: 'Audio Processing',
  },
  {
    to: '/dsp',
    label: 'DSP',
    icon: Sliders,
    description: 'Native JUCE processors — dynamics, EQ, delay, modulation, pitch, reverb, amps & multi-FX',
    color: '#ff6644',  // Orange-red
    group: 'Audio Processing',
  },
  {
    to: '/drums',
    label: 'Drums',
    icon: Drum,
    description: 'Drum machine & practice patterns',
    color: '#f59e0b',  // Amber
    group: 'Audio Processing',
  },

  // ── Control ──
  {
    to: '/midi',
    label: 'MIDI',
    icon: Piano,
    description: 'MIDI mapping & control',
    color: '#ec4899',  // Pink
    dividerBefore: true,
    group: 'Control',
  },

  // ── Hardware & Interfaces ──
  {
    to: '/lcd',
    label: 'LCD Console',
    icon: Monitor,
    description: 'Displays, events, nodes, alerts, hardware & settings',
    color: '#22c55e',  // Green
    dividerBefore: true,
    group: 'Hardware & Interfaces',
  },
  {
    to: '/edirol-ua1000',
    label: 'Edirol UA-1000',
    icon: Usb,
    description: 'USB audio interface control',
    color: '#0066cc',  // Roland blue
    group: 'Hardware & Interfaces',
  },
  {
    to: '/hotone-jogg',
    label: 'HoTone JoGG',
    icon: AudioLines,
    description: 'HoTone audio interface',
    color: '#e53935',  // HoTone red
    group: 'Hardware & Interfaces',
  },
  {
    to: '/pipewire',
    label: 'PipeWire',
    icon: Radio,
    description: 'Audio server graph, latency & controls',
    color: '#a78bfa',  // Purple
    group: 'Hardware & Interfaces',
  },

  // ── Infrastructure ──
  {
    to: '/host-machine',
    label: 'Host Machine',
    icon: Server,
    description: 'Hardware info & real-time health',
    color: '#3b82f6',  // Blue
    dividerBefore: true,
    group: 'Infrastructure',
  },
  {
    to: '/cluster-dashboard',
    label: 'Cluster Dashboard',
    icon: Server,
    description: 'Multi-node cluster monitoring & simulation',
    color: '#00d4ff',  // Cyan
    group: 'Infrastructure',
  },
  {
    to: '/multi-system',
    label: 'Multi-System',
    icon: Monitor,
    description: 'Side-by-side multi-host metrics & comparison',
    color: '#38bdf8',  // Sky blue
    group: 'Infrastructure',
  },
]

// Main navigation items (left side, top-level)
const navItemsLeft = [
  {
    to: '/welcome',
    label: 'Guide',
    icon: BookOpen,
    description: 'Platform guide & concepts',
    color: '#22c55e'  // Green
  },
  {
    to: '/grid',
    label: 'Grid',
    icon: LayoutGrid,
    description: 'Cortex-style grid editor',
    color: '#f97316'  // Orange
  },
  ...(enableLegacy ? [{ to: '/legacy', label: 'Legacy', icon: Sparkles, description: 'Classic interface', color: '#ec4899' }] : []),
]

// Right-side navigation items (About)
const navItemsRight = [
  {
    to: '/about',
    label: 'About',
    icon: Info,
    description: 'System info',
    color: '#64748b'  // Slate
  },
]

// Check if current path matches a nav item
function useActiveNavItem() {
  const location = useLocation()

  // Check hic sunt dracones items
  const underTheHoodMatch = underTheHoodItems.find(item =>
    location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/'))
  )

  if (underTheHoodMatch) {
    return { type: 'under-the-hood' as const, item: underTheHoodMatch }
  }

  // Check main nav items (left + right)
  const allMainItems = [...navItemsLeft, ...navItemsRight]
  for (const item of allMainItems) {
    if (location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/'))) {
      return { type: 'main' as const, item }
    }
  }

  // Default to first hic sunt dracones item (Overview)
  return { type: 'under-the-hood' as const, item: underTheHoodItems[0] }
}

export function AppShell({ children }: { children: ReactNode }) {
  const activeNav = useActiveNavItem()
  const [navOpen, setNavOpen] = useState(false)
  const navMenuRef = useRef<HTMLDivElement>(null)
  const [advancedMenuOpen, setAdvancedMenuOpen] = useState(false)
  const advancedMenuRef = useRef<HTMLDivElement>(null)
  
  // Get special settings to determine if Advanced Menu should be visible
  const { settings: specialSettings } = useSpecialSettings()
  
  // Determine if Advanced Menu should be shown based on special settings
  const showAdvancedMenu = specialSettings?.enabled && specialSettings?.menuLocation !== 'hidden'
  const showInTopNav = specialSettings?.menuLocation === 'top-nav'
  const showInMobileOnly = specialSettings?.menuLocation === 'mobile-only'

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target as Node)) {
        setNavOpen(false)
      }
      if (advancedMenuRef.current && !advancedMenuRef.current.contains(event.target as Node)) {
        setAdvancedMenuOpen(false)
      }
    }

    if (navOpen || advancedMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [navOpen, advancedMenuOpen])

  // Left nav: main items
  const leftNavItems = [...navItemsLeft]

  // Right nav: About
  const rightNavItems = [...navItemsRight]

  // Helper to render a nav item (regular link)
  const renderNavItem = (item: typeof rightNavItems[number]) => {
    const Icon = item.icon

    return (
      <NavLink
        key={item.to}
        to={item.to}
        className="nav-tab-item"
        title={item.description}
      >
        <span className="nav-tab-icon" style={{ '--tab-color': item.color } as React.CSSProperties}>
          <Icon size={16} aria-hidden />
        </span>
        <span className="nav-tab-label">{item.label}</span>
      </NavLink>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar-pro">
        {/* Left: Main navigation tabs (desktop) / Hamburger (mobile) */}
        <nav className="nav-tabs-left" aria-label="Main navigation">
          {leftNavItems.map(renderNavItem)}
        </nav>

        {/* Center: Active tab title - prominent display */}
        <div className="nav-active-title">
          <div
            className="nav-active-display"
            style={{ '--active-color': activeNav.item.color } as React.CSSProperties}
          >
            <activeNav.item.icon size={22} className="nav-active-icon" aria-hidden />
            <span className="nav-active-text">{activeNav.item.label}</span>
          </div>
        </div>

        {/* Right: Advanced Menu (conditional) + About + Hamburger Menu */}
        <div className="nav-tabs-right-container">
          <nav className="nav-tabs-right" aria-label="Settings navigation">
            {/* Advanced Menu - only shown when Special is enabled and location is top-nav */}
            {showAdvancedMenu && showInTopNav && (
              <div style={{ position: 'relative' }} ref={advancedMenuRef}>
                <button
                  className="nav-tab-item"
                  style={{
                    background: 'none',
                    border: '1px solid rgba(220, 38, 38, 0.3)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    transition: 'all 150ms',
                  }}
                  onClick={() => setAdvancedMenuOpen(!advancedMenuOpen)}
                  title="Advanced settings & configuration"
                >
                  <Flame size={16} style={{ color: '#dc2626' }} />
                  <span style={{ fontSize: '12px', fontWeight: 500, color: '#dc2626' }}>Advanced</span>
                </button>
                
                {advancedMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 8px)',
                      background: 'linear-gradient(135deg, rgba(15, 20, 35, 0.95) 0%, rgba(25, 30, 45, 0.95) 100%)',
                      border: '1px solid rgba(220, 38, 38, 0.3)',
                      borderRadius: '8px',
                      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
                      minWidth: '260px',
                      zIndex: 1000,
                      overflow: 'hidden',
                    }}
                  >
                    {underTheHoodItems.map((item, index) => (
                      <div key={item.to}>
                        {item.dividerBefore && (
                          <>
                            <div style={{
                              height: '1px',
                              background: 'rgba(220, 38, 38, 0.2)',
                              margin: '8px 0 0 0'
                            }} />
                            {item.group && (
                              <div style={{
                                padding: '6px 16px 2px',
                                fontSize: '10px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                color: '#71717a',
                              }}>
                                {item.group}
                              </div>
                            )}
                          </>
                        )}
                        <NavLink
                          to={item.to}
                          onClick={() => setAdvancedMenuOpen(false)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px 16px',
                            textDecoration: 'none',
                            transition: 'background 150ms',
                            color: '#f2f6ff',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                          }}
                        >
                          <item.icon size={16} style={{ color: item.color, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.label}</div>
                            <div style={{ fontSize: '11px', color: '#71717a', marginTop: '2px' }}>
                              {item.description}
                            </div>
                          </div>
                        </NavLink>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {rightNavItems.map(renderNavItem)}
          </nav>

          {/* Mobile hamburger button */}
          <button 
            className="nav-hamburger-btn" 
            onClick={() => setNavOpen(!navOpen)}
            aria-label="Toggle navigation menu"
            title="Toggle menu"
          >
            {navOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {navOpen && (
          <div className="nav-mobile-menu" ref={navMenuRef}>
            <div className="nav-mobile-menu-content">
              {/* Advanced menu items - shown if Special is enabled and (top-nav or mobile-only) */}
              {showAdvancedMenu && underTheHoodItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className="nav-mobile-item"
                    style={{ '--item-color': item.color } as React.CSSProperties}
                    onClick={() => setNavOpen(false)}
                  >
                    <Icon size={18} aria-hidden />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
              
              {/* Message when Advanced Menu is hidden */}
              {!showAdvancedMenu && (
                <div style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: '#71717a',
                  fontSize: '13px',
                }}>
                  Advanced features not enabled.
                  <br />
                  Enable via About page.
                </div>
              )}
            </div>
          </div>
        )}
      </header>
      <main className="app-content">{children}</main>
    </div>
  )
}
