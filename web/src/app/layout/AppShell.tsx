import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { Sparkle, Info, GridFour, BookOpen, List, X, Fire, CaretRight } from '@phosphor-icons/react'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { PasswordDialog } from '../components/PasswordDialog'
import { SpecialSettingsDialog } from '../components/SpecialSettingsDialog'
import { advancedMenuItems, hardwareInterfaceMenuItems, type AdvancedMenuItem } from '../data/advancedMenuItems'

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

interface TopNavItem {
  to: string
  label: string
  icon: React.ComponentType<any>
  description: string
  color: string
}

// Main navigation items (left side, top-level)
const navItemsLeft: TopNavItem[] = [
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
  ...(enableLegacy ? [{ to: '/legacy', label: 'Legacy', icon: Sparkle, description: 'Classic interface', color: '#60a5fa' }] : []),
]

// Right-side navigation items (About)
const navItemsRight: TopNavItem[] = [
  {
    to: '/about',
    label: 'About',
    icon: Info,
    description: 'System info',
    color: '#9ca3af'
  },
]

interface AdvancedMenuSection {
  group: string
  items: AdvancedMenuItem[]
}

function groupAdvancedMenuItems(items: AdvancedMenuItem[]): AdvancedMenuSection[] {
  const sections: AdvancedMenuSection[] = []

  for (const item of items) {
    const group = item.group ?? 'Other'
    const existingSection = sections.find(section => section.group === group)
    if (existingSection) {
      existingSection.items.push(item)
      continue
    }
    sections.push({ group, items: [item] })
  }

  return sections
}

const advancedMenuSections = groupAdvancedMenuItems(advancedMenuItems)

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

  // Helper to render a nav item
  const renderNavItem = (item: TopNavItem) => {
    const Icon = item.icon
    return (
      <NavLink
        key={item.to}
        to={item.to}
        className="nav-tab-item"
        title={item.description}
        style={{ '--tab-color': item.color } as React.CSSProperties}
      >
        <span className="nav-tab-icon">
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

  const renderAdvancedMenuGroups = ({
    keyPrefix,
    hardwareOpen,
    setHardwareOpen,
    onNavigate,
  }: {
    keyPrefix: string
    hardwareOpen: boolean
    setHardwareOpen: React.Dispatch<React.SetStateAction<boolean>>
    onNavigate: () => void
  }) => (
    <>
      {showAdvancedMenu && advancedMenuSections.map((section) => (
        <section key={`${keyPrefix}-${section.group}`} className="nav-mobile-advanced-group">
          <div className="nav-mobile-group-label">{section.group}</div>
          <div className="nav-mobile-group-grid">
            {section.items.map((item) => {
              const Icon = item.icon

              if (item.popupMenu === 'hardware-interfaces') {
                return (
                  <div key={`${keyPrefix}-${section.group}-${item.to}`} className="nav-mobile-submenu-wrap">
                    <button
                      type="button"
                      className={`nav-mobile-item nav-mobile-item--submenu${hardwareOpen ? ' is-open' : ''}`}
                      style={{ '--item-color': item.color } as React.CSSProperties}
                      onClick={() => setHardwareOpen(open => !open)}
                      aria-expanded={hardwareOpen}
                    >
                      <Icon size={18} weight="duotone" aria-hidden />
                      <span>{item.label}</span>
                      <CaretRight
                        size={14}
                        weight="bold"
                        className={`nav-mobile-item-caret${hardwareOpen ? ' is-open' : ''}`}
                      />
                    </button>

                    {hardwareOpen && (
                      <div className="nav-mobile-submenu-grid">
                        {hardwareInterfaceMenuItems.map((hardwareItem) => (
                          <NavLink
                            key={`${keyPrefix}-${hardwareItem.label}-${hardwareItem.to}`}
                            to={hardwareItem.to}
                            className="nav-mobile-item nav-mobile-item--child"
                            style={{ '--item-color': hardwareItem.color } as React.CSSProperties}
                            onClick={() => {
                              setHardwareOpen(false)
                              onNavigate()
                            }}
                          >
                            <hardwareItem.icon size={18} weight="duotone" aria-hidden />
                            <span>{hardwareItem.label}</span>
                          </NavLink>
                        ))}

                        <div className="nav-mobile-submenu-note">
                          Reserved space for new hardware profiles.
                        </div>
                      </div>
                    )}
                  </div>
                )
              }

              return (
                <NavLink
                  key={`${keyPrefix}-${section.group}-${item.to}`}
                  to={item.to}
                  className="nav-mobile-item"
                  style={{ '--item-color': item.color } as React.CSSProperties}
                  onClick={() => {
                    setHardwareOpen(false)
                    onNavigate()
                  }}
                >
                  <Icon size={18} weight="duotone" aria-hidden />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        </section>
      ))}

      {!showAdvancedMenu && (
        <div className="nav-mobile-disabled-note">
          Advanced features not enabled.
          <br />
          Enable via dragon icon.
        </div>
      )}
    </>
  )

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
            {rightNavItems.map(renderNavItem)}
            {/* Advanced Menu - only shown when Special is enabled and location is top-nav */}
            {showAdvancedMenu && showInTopNav && (
              <div className="advanced-menu-root" ref={advancedMenuRef}>
                <button
                  type="button"
                  className={`nav-tab-item nav-tab-advanced${advancedMenuOpen ? ' nav-tab-advanced--open' : ''}`}
                  onClick={() => {
                    const nextOpen = !advancedMenuOpen
                    setAdvancedMenuOpen(nextOpen)
                    if (!nextOpen) {
                      setHardwareInterfacesOpen(false)
                    }
                  }}
                  title="Advanced settings & configuration"
                  aria-haspopup="menu"
                  aria-expanded={advancedMenuOpen}
                  aria-controls="advanced-nav-menu"
                >
                  <Fire size={16} weight="duotone" className="nav-tab-advanced-flame" />
                  <span className="nav-tab-advanced-label">Advanced</span>
                  <CaretRight size={12} weight="bold" className={`nav-tab-advanced-caret${advancedMenuOpen ? ' is-open' : ''}`} />
                </button>
                
                {advancedMenuOpen && (
                  <div id="advanced-nav-menu" className="advanced-menu-panel" role="menu">
                    <div className="advanced-menu-header">
                      <p className="advanced-menu-kicker">Operator Controls</p>
                      <p className="advanced-menu-title">Advanced Menu</p>
                      <p className="advanced-menu-subtitle">
                        System-level routing, interfaces, and infrastructure dashboards.
                      </p>
                    </div>

                    <div className="nav-mobile-menu-content nav-mobile-menu-content--desktop">
                      {renderAdvancedMenuGroups({
                        keyPrefix: 'desktop-advanced',
                        hardwareOpen: hardwareInterfacesOpen,
                        setHardwareOpen: setHardwareInterfacesOpen,
                        onNavigate: () => setAdvancedMenuOpen(false),
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

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
              {renderAdvancedMenuGroups({
                keyPrefix: 'mobile-nav',
                hardwareOpen: mobileHardwareInterfacesOpen,
                setHardwareOpen: setMobileHardwareInterfacesOpen,
                onNavigate: () => setNavOpen(false),
              })}
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
