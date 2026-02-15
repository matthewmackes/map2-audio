import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { SquaresFour, Sparkle, Info, Package, Waveform, MusicNotes, GridFour, Cube, Pulse, Usb, BookOpen, Monitor, List, X, HardDrives, Fire, Stack, Cpu } from '@phosphor-icons/react'
import { useSpecialSettings } from '../hooks/useSpecialSettings'

const enableLegacy = import.meta.env.VITE_ENABLE_LEGACY === 'true'

// Items under the "hic sunt dracones" dropdown
// Grouped with dividerBefore to visually separate categories
const underTheHoodItems = [
  // ── System ──
  {
    to: '/',
    label: 'Overview',
    icon: Sparkle,
    description: 'System status & quick actions',
    color: '#f59e0b',  // Amber
    group: 'System',
  },
  {
    to: '/presets',
    label: 'Presets',
    icon: SquaresFour,
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
    icon: Waveform,
    description: 'Impulse responses & NAM models',
    color: '#06b6d4',  // Teal
    group: 'Content & Plugins',
  },

  // ── Audio Processing ──
  {
    to: '/engine',
    label: 'Audio Engine',
    icon: Pulse,
    description: 'Engine cluster, metering, signal path & diagnostics',
    color: '#3b82f6',  // Blue
    dividerBefore: true,
    group: 'Audio Processing',
  },

  // ── Control ──
  {
    to: '/midi',
    label: 'MIDI',
    icon: MusicNotes,
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
    to: '/motu-rme',
    label: 'MOTU + RME ADAT',
    icon: Stack,
    description: 'MOTU UltraLite-mk5 + RME ADI-8 QS monitoring',
    color: '#00D4FF',  // Cyan
    group: 'Hardware & Interfaces',
  },
  {
    to: '/hotone-jogg',
    label: 'HoTone JoGG',
    icon: Waveform,
    description: 'HoTone audio interface',
    color: '#e53935',  // HoTone red
    group: 'Hardware & Interfaces',
  },
  // ── Infrastructure ──
  {
    to: '/host-machine',
    label: 'Host Machine',
    icon: HardDrives,
    description: 'Hardware info & real-time health',
    color: '#2563eb',  // Blue
    dividerBefore: true,
    group: 'Infrastructure',
  },
  {
    to: '/cpu-performance',
    label: 'CPU Performance',
    icon: Cpu,
    description: 'Intel generation comparison & capacity analysis',
    color: '#0066FF',  // Intel blue
    group: 'Infrastructure',
  },
  {
    to: '/cluster-dashboard',
    label: 'Cluster Dashboard',
    icon: HardDrives,
    description: 'Multi-node cluster monitoring & simulation',
    color: '#2563eb',  // Blue
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
    color: '#60a5fa'
  },
  {
    to: '/grid',
    label: 'Grid',
    icon: GridFour,
    description: 'Cortex-style grid editor',
    color: '#2563eb'
  },
  {
    to: '/grid-3d',
    label: '3D Grid',
    icon: Cube,
    description: '3D signal flow visualization',
    color: '#7c3aed'
  },
  ...(enableLegacy ? [{ to: '/legacy', label: 'Legacy', icon: Sparkle, description: 'Classic interface', color: '#60a5fa' }] : []),
]

// Right-side navigation items (About)
const navItemsRight = [
  {
    to: '/about',
    label: 'About',
    icon: Info,
    description: 'System info',
    color: '#9ca3af'
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
          <Icon size={16} weight="duotone" aria-hidden />
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
            <activeNav.item.icon size={22} weight="duotone" className="nav-active-icon" aria-hidden />
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
                    border: '1px solid rgba(37, 99, 235, 0.3)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    transition: 'background 150ms, border-color 150ms',
                  }}
                  onClick={() => setAdvancedMenuOpen(!advancedMenuOpen)}
                  title="Advanced settings & configuration"
                >
                  <Fire size={16} weight="duotone" style={{ color: '#60a5fa' }} />
                  <span style={{ fontSize: '12px', fontWeight: 500, color: '#60a5fa' }}>Advanced</span>
                </button>
                
                {advancedMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 8px)',
                      background: '#111111',
                      border: '1px solid rgba(37, 99, 235, 0.15)',
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
                              background: 'rgba(37, 99, 235, 0.1)',
                              margin: '8px 0 0 0'
                            }} />
                            {item.group && (
                              <div style={{
                                padding: '6px 16px 2px',
                                fontSize: '10px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                color: '#6b7280',
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
                            color: '#f3f4f6',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(37, 99, 235, 0.08)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                          }}
                        >
                          <item.icon size={16} weight="duotone" style={{ color: '#60a5fa', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.label}</div>
                            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
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
            {navOpen ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
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
                    <Icon size={18} weight="duotone" aria-hidden />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
              
              {/* Message when Advanced Menu is hidden */}
              {!showAdvancedMenu && (
                <div style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: '#6b7280',
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
