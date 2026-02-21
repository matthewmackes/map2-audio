import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { Sparkle, Info, GridFour, Cube, BookOpen, List, X, Fire, ShareNetwork, CaretRight } from '@phosphor-icons/react'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { PasswordDialog } from '../components/PasswordDialog'
import { SpecialSettingsDialog } from '../components/SpecialSettingsDialog'
import { advancedMenuItems, hardwareInterfaceMenuItems } from '../data/advancedMenuItems'

const enableLegacy = import.meta.env.VITE_ENABLE_LEGACY === 'true'

const DragonIcon = ({ size = 16, color = '#dc2626' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2C10.5 2 9 3 8.5 4.5C8 6 8.5 7.5 9.5 8.5L7 11C6 10.5 4.5 10.5 3.5 11.5C2.5 12.5 2.5 14 3 15L2 16L3 17L4 16C5 16.5 6.5 16.5 7.5 15.5L10 18C9 19 9 20.5 9.5 21.5C10 22.5 11.5 23 13 22.5C14.5 22 15.5 20.5 15.5 19L18.5 16C19.5 17 21 17 22 16C22 14.5 21.5 13 20 12.5L21 10L19.5 9.5L18.5 11C17.5 10.5 16 11 15 12L12.5 9.5C13.5 8.5 14 7 13.5 5.5C13 4 11.5 3 10 3"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={color}
      fillOpacity="0.2"
    />
    <circle cx="10" cy="5" r="1" fill={color} />
  </svg>
)

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
    to: '/avb-routing',
    label: 'AVB',
    icon: ShareNetwork,
    description: 'AVB routing matrix',
    color: '#06b6d4'
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
  const advancedNavItems = [
    ...advancedMenuItems.filter(item => !item.popupMenu),
    ...hardwareInterfaceMenuItems,
  ]

  // Check hic sunt dracones items
  const underTheHoodMatch = advancedNavItems.find(item =>
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
  return { type: 'under-the-hood' as const, item: advancedMenuItems[0] }
}

export function AppShell({ children }: { children: ReactNode }) {
  const activeNav = useActiveNavItem()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const navMenuRef = useRef<HTMLDivElement>(null)
  const [advancedMenuOpen, setAdvancedMenuOpen] = useState(false)
  const [hardwareInterfacesOpen, setHardwareInterfacesOpen] = useState(false)
  const [mobileHardwareInterfacesOpen, setMobileHardwareInterfacesOpen] = useState(false)
  const advancedMenuRef = useRef<HTMLDivElement>(null)
  
  // Get special settings to determine if Advanced Menu should be visible
  const {
    settings: specialSettings,
    isLoading: specialSettingsLoading,
    updateSettings: updateSpecialSettings,
  } = useSpecialSettings()
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [showSpecialSettings, setShowSpecialSettings] = useState(false)
  
  // Determine if Advanced Menu should be shown based on special settings
  const showAdvancedMenu = specialSettings?.enabled && specialSettings?.menuLocation !== 'hidden'
  const showInTopNav = specialSettings?.menuLocation === 'top-nav'

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target as Node)) {
        setNavOpen(false)
        setMobileHardwareInterfacesOpen(false)
      }
      if (advancedMenuRef.current && !advancedMenuRef.current.contains(event.target as Node)) {
        setAdvancedMenuOpen(false)
        setHardwareInterfacesOpen(false)
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

  const isFullBleedRoute = location.pathname === '/avb-routing' || location.pathname.startsWith('/avb-routing/')

  const handleDragonIconClick = () => {
    if (specialSettingsLoading) return
    setShowPasswordDialog(true)
  }

  const handlePasswordSuccess = async () => {
    setShowPasswordDialog(false)
    const nextMenuLocation = specialSettings?.menuLocation ?? 'top-nav'
    const nextHiddenPlugins = specialSettings?.hiddenPlugins ?? []
    const nextEnabled = specialSettings?.enabled ?? false

    try {
      if (!nextEnabled) {
        await updateSpecialSettings({
          enabled: true,
          hiddenPlugins: nextHiddenPlugins,
          menuLocation: nextMenuLocation,
        })
      }
    } catch (err) {
      console.error('Failed to enable special mode after authentication:', err)
    } finally {
      setShowSpecialSettings(true)
    }
  }

  const handleSpecialSettingsSave = async (settings: {
    enabled: boolean
    hiddenPlugins: string[]
    menuLocation: 'top-nav' | 'mobile-only' | 'hidden'
  }) => {
    await updateSpecialSettings(settings)
    setShowSpecialSettings(false)
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
                  onClick={() => {
                    const nextOpen = !advancedMenuOpen
                    setAdvancedMenuOpen(nextOpen)
                    if (!nextOpen) {
                      setHardwareInterfacesOpen(false)
                    }
                  }}
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
                      overflow: 'visible',
                    }}
                  >
                    {advancedMenuItems.map((item) => (
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
                        {item.popupMenu === 'hardware-interfaces' ? (
                          <div
                            style={{ position: 'relative' }}
                            onMouseEnter={() => setHardwareInterfacesOpen(true)}
                            onMouseLeave={() => setHardwareInterfacesOpen(false)}
                          >
                            <button
                              type="button"
                              onClick={() => setHardwareInterfacesOpen(open => !open)}
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '12px 16px',
                                border: 'none',
                                background: 'transparent',
                                textAlign: 'left',
                                transition: 'background 150ms',
                                color: '#f3f4f6',
                                cursor: 'pointer',
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
                              <CaretRight size={14} weight="bold" style={{ color: '#9ca3af' }} />
                            </button>

                            {hardwareInterfacesOpen && (
                              <div
                                style={{
                                  position: 'absolute',
                                  left: 'calc(100% - 6px)',
                                  top: 0,
                                  background: '#111111',
                                  border: '1px solid rgba(37, 99, 235, 0.15)',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
                                  minWidth: '300px',
                                  zIndex: 1010,
                                  overflow: 'hidden',
                                }}
                              >
                                {hardwareInterfaceMenuItems.map((hardwareItem) => (
                                  <NavLink
                                    key={`${hardwareItem.label}-${hardwareItem.to}`}
                                    to={hardwareItem.to}
                                    onClick={() => {
                                      setHardwareInterfacesOpen(false)
                                      setAdvancedMenuOpen(false)
                                    }}
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
                                    <hardwareItem.icon size={16} weight="duotone" style={{ color: '#60a5fa', flexShrink: 0 }} />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{hardwareItem.label}</div>
                                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                        {hardwareItem.description}
                                      </div>
                                    </div>
                                  </NavLink>
                                ))}
                                <div
                                  style={{
                                    margin: '8px 10px 10px',
                                    border: '1px dashed rgba(96, 165, 250, 0.3)',
                                    borderRadius: '6px',
                                    padding: '10px 12px',
                                    fontSize: '11px',
                                    color: '#6b7280',
                                  }}
                                >
                                  Reserved space for new hardware profiles.
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <NavLink
                            to={item.to}
                            onClick={() => {
                              setHardwareInterfacesOpen(false)
                              setAdvancedMenuOpen(false)
                            }}
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
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {rightNavItems.map(renderNavItem)}
            <button
              type="button"
              className="nav-tab-item nav-tab-special"
              disabled={specialSettingsLoading}
              aria-label="Open special settings"
              onClick={handleDragonIconClick}
              onMouseEnter={(e) => {
                if (!specialSettingsLoading) {
                  e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.45)'
                }
              }}
              onMouseLeave={(e) => {
                if (!specialSettingsLoading) {
                  e.currentTarget.style.borderColor = 'transparent'
                }
              }}
              title="Open Special settings (password required)"
            >
              <DragonIcon size={14} color={specialSettings?.enabled ? '#dc2626' : '#6b7280'} />
            </button>
          </nav>

          {/* Mobile hamburger button */}
          <button 
            className="nav-hamburger-btn" 
            onClick={() => {
              const nextOpen = !navOpen
              setNavOpen(nextOpen)
              if (!nextOpen) {
                setMobileHardwareInterfacesOpen(false)
              }
            }}
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
              {showAdvancedMenu && advancedMenuItems.map((item) => {
                const Icon = item.icon

                if (item.popupMenu === 'hardware-interfaces') {
                  return (
                    <button
                      key={item.to}
                      type="button"
                      className="nav-mobile-item"
                      onClick={() => setMobileHardwareInterfacesOpen(open => !open)}
                    >
                      <Icon size={18} weight="duotone" aria-hidden />
                      <span>{item.label}</span>
                    </button>
                  )
                }

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className="nav-mobile-item"
                    style={{ '--item-color': item.color } as React.CSSProperties}
                    onClick={() => {
                      setMobileHardwareInterfacesOpen(false)
                      setNavOpen(false)
                    }}
                  >
                    <Icon size={18} weight="duotone" aria-hidden />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}

              {showAdvancedMenu && mobileHardwareInterfacesOpen && hardwareInterfaceMenuItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={`${item.label}-${item.to}-mobile`}
                    to={item.to}
                    className="nav-mobile-item"
                    style={{ '--item-color': item.color } as React.CSSProperties}
                    onClick={() => {
                      setMobileHardwareInterfacesOpen(false)
                      setNavOpen(false)
                    }}
                  >
                    <Icon size={18} weight="duotone" aria-hidden />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}

              {showAdvancedMenu && mobileHardwareInterfacesOpen && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    border: '1px dashed rgba(96, 165, 250, 0.25)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '11px',
                    color: '#6b7280',
                    textAlign: 'center',
                  }}
                >
                  Reserved space for new hardware profiles.
                </div>
              )}
              
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
                  Enable via dragon icon.
                </div>
              )}
            </div>
          </div>
        )}
      </header>
      <PasswordDialog
        isOpen={showPasswordDialog}
        onClose={() => setShowPasswordDialog(false)}
        onSuccess={handlePasswordSuccess}
      />
      <SpecialSettingsDialog
        isOpen={showSpecialSettings}
        onClose={() => setShowSpecialSettings(false)}
        onSave={handleSpecialSettingsSave}
      />
      <main className={isFullBleedRoute ? 'app-content app-content--full' : 'app-content'}>{children}</main>
    </div>
  )
}
