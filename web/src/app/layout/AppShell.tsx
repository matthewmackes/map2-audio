import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { Sparkle, Info, GridFour, Cube, BookOpen, List, X, Fire, CaretRight } from '@phosphor-icons/react'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { PasswordDialog } from '../components/PasswordDialog'
import { SpecialSettingsDialog } from '../components/SpecialSettingsDialog'
import { MPX1MegaMenu } from '../components/MPX1/MPX1MegaMenu'
import { advancedMenuItems, hardwareInterfaceMenuItems, type AdvancedMenuItem } from '../data/advancedMenuItems'
import { mpx1Api, useMPX1State } from '../../map2/mpx1Api'

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

const LexiconRackIcon = ({
  size = 16,
  color = '#3b82f6',
  className,
  ...rest
}: {
  size?: number
  color?: string
  className?: string
  weight?: string
} & React.SVGProps<SVGSVGElement>) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...rest}
  >
    <rect x="2" y="6" width="20" height="12" rx="2.5" stroke={color} strokeWidth="1.5" fill={`${color}1A`} />
    <rect x="5.5" y="9" width="7.5" height="6" rx="1" fill={`${color}2F`} stroke={color} strokeWidth="1" />
    <circle cx="17.5" cy="10" r="1.25" fill={color} />
    <circle cx="17.5" cy="14" r="1.25" fill={color} />
    <circle cx="20.5" cy="10" r="0.95" fill={color} opacity="0.7" />
    <circle cx="20.5" cy="14" r="0.95" fill={color} opacity="0.7" />
  </svg>
)

interface TopNavItem {
  to: string
  label: string
  icon: React.ComponentType<any>
  description: string
  color: string
  megaMenu?: boolean
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
  {
    to: '/grid-3d',
    label: '3D Grid',
    icon: Cube,
    description: '3D signal flow visualization',
    color: '#7c3aed'
  },
  {
    to: '/mpx1',
    label: 'Lexicon MPX1',
    icon: LexiconRackIcon,
    description: 'Hardware rack editor + MIDI mapping',
    color: '#3b82f6',
    megaMenu: true,
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function normalizeMidiValue(value: number, max = 127): number {
  if (!Number.isFinite(value)) return 0
  return clamp01(value / max)
}

function formatProgramName(program: number, fallback?: string): string {
  if (fallback && fallback.trim().length > 0) return fallback
  return `Program ${Math.max(0, program).toString().padStart(3, '0')}`
}

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
  const [mpx1MenuOpen, setMpx1MenuOpen] = useState(false)
  const mpx1MenuRef = useRef<HTMLDivElement>(null)

  const {
    state: mpx1State,
    programs: mpx1Programs,
    shadow: mpx1Shadow,
    setProgram: setMpx1Program,
    refresh: refreshMpx1State,
  } = useMPX1State({ autoConnectWs: false })

  const currentProgram = mpx1State?.current_program ?? 0
  const currentProgramEntry = mpx1Programs.find((program) => program.program === currentProgram)
  const currentProgramName = formatProgramName(currentProgram, currentProgramEntry?.name)
  const mixMeter = normalizeMidiValue(Number(mpx1Shadow['program.master_mix'] ?? mpx1Shadow['program.mix'] ?? 0))
  const levelMeter = normalizeMidiValue(Number(mpx1Shadow['program.master_level'] ?? mpx1Shadow['program.level'] ?? 0))
  const hasMidiMappings = false
  
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
      if (mpx1MenuRef.current && !mpx1MenuRef.current.contains(event.target as Node)) {
        setMpx1MenuOpen(false)
      }
    }

    if (navOpen || advancedMenuOpen || mpx1MenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [navOpen, advancedMenuOpen, mpx1MenuOpen])

  // Left nav: main items
  const leftNavItems = [...navItemsLeft]

  // Right nav: About
  const rightNavItems = [...navItemsRight]

  const handleMpx1Rescan = async () => {
    try {
      await mpx1Api.getMidiPorts()
      await refreshMpx1State()
    } catch (err) {
      console.error('MPX1 MIDI rescan failed:', err)
    }
  }

  const handleMpx1Disconnect = async () => {
    try {
      await mpx1Api.disconnectMidi()
      await refreshMpx1State()
    } catch (err) {
      console.error('MPX1 disconnect failed:', err)
    }
  }

  // Helper to render a nav item (regular link or mega menu trigger)
  const renderNavItem = (item: TopNavItem) => {
    const Icon = item.icon

    if (item.megaMenu) {
      return (
        <div key={item.to} className="mpx1-nav-root" ref={mpx1MenuRef}>
          <button
            type="button"
            className={`nav-tab-item nav-tab-mpx1${mpx1MenuOpen ? ' nav-tab-mpx1--open' : ''}`}
            onClick={() => {
              const nextOpen = !mpx1MenuOpen
              setMpx1MenuOpen(nextOpen)
              if (nextOpen) {
                setAdvancedMenuOpen(false)
                setHardwareInterfacesOpen(false)
              }
            }}
            title={item.description}
            aria-haspopup="menu"
            aria-expanded={mpx1MenuOpen}
            aria-controls="mpx1-mega-menu"
          >
            <span className="nav-tab-icon" style={{ '--tab-color': item.color } as React.CSSProperties}>
              <Icon size={16} weight="duotone" aria-hidden />
            </span>
            <span className="nav-tab-label">{item.label}</span>
            <CaretRight size={12} weight="bold" className={`nav-tab-advanced-caret${mpx1MenuOpen ? ' is-open' : ''}`} />
          </button>

          {mpx1MenuOpen && (
            <MPX1MegaMenu
              menuId="mpx1-mega-menu"
              connected={Boolean(mpx1State?.connected)}
              currentProgram={currentProgram}
              currentProgramName={currentProgramName}
              mixMeter={mixMeter}
              levelMeter={levelMeter}
              hasMidiMappings={hasMidiMappings}
              onClose={() => setMpx1MenuOpen(false)}
              onRescan={handleMpx1Rescan}
              onDisconnect={handleMpx1Disconnect}
              onProgramStep={async (delta) => {
                const nextProgram = Math.max(0, currentProgram + delta)
                try {
                  await setMpx1Program(nextProgram)
                } catch (err) {
                  console.error('MPX1 program change failed:', err)
                }
              }}
            />
          )}
        </div>
      )
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        className="nav-tab-item"
        title={item.description}
        onClick={() => setMpx1MenuOpen(false)}
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
                    if (nextOpen) {
                      setMpx1MenuOpen(false)
                    }
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

                    <div className="advanced-menu-sections">
                      {advancedMenuSections.map((section) => (
                        <section key={section.group} className="advanced-menu-section" aria-label={section.group}>
                          <div className="advanced-menu-section-label">{section.group}</div>

                          {section.items.map((item) => {
                            if (item.popupMenu === 'hardware-interfaces') {
                              return (
                                <div
                                  key={`${section.group}-${item.to}`}
                                  className="advanced-menu-item-row"
                                  onMouseEnter={() => setHardwareInterfacesOpen(true)}
                                  onMouseLeave={() => setHardwareInterfacesOpen(false)}
                                  style={{ '--advanced-item-color': item.color } as React.CSSProperties}
                                >
                                  <button
                                    type="button"
                                    className="advanced-menu-item advanced-menu-item--button"
                                    onClick={() => setHardwareInterfacesOpen(open => !open)}
                                    aria-haspopup="menu"
                                    aria-expanded={hardwareInterfacesOpen}
                                  >
                                    <item.icon size={16} weight="duotone" className="advanced-menu-item-icon" />
                                    <div className="advanced-menu-item-content">
                                      <div className="advanced-menu-item-title">{item.label}</div>
                                      <div className="advanced-menu-item-description">{item.description}</div>
                                    </div>
                                    <CaretRight
                                      size={14}
                                      weight="bold"
                                      className={`advanced-menu-item-caret${hardwareInterfacesOpen ? ' is-open' : ''}`}
                                    />
                                  </button>

                                  {hardwareInterfacesOpen && (
                                    <div className="advanced-submenu-panel" role="menu">
                                      {hardwareInterfaceMenuItems.map((hardwareItem) => (
                                        <NavLink
                                          key={`${hardwareItem.label}-${hardwareItem.to}`}
                                          to={hardwareItem.to}
                                          className={({ isActive }) =>
                                            `advanced-menu-item${isActive ? ' advanced-menu-item--active' : ''}`
                                          }
                                          style={{ '--advanced-item-color': hardwareItem.color } as React.CSSProperties}
                                          onClick={() => {
                                            setHardwareInterfacesOpen(false)
                                            setAdvancedMenuOpen(false)
                                          }}
                                        >
                                          <hardwareItem.icon size={16} weight="duotone" className="advanced-menu-item-icon" />
                                          <div className="advanced-menu-item-content">
                                            <div className="advanced-menu-item-title">{hardwareItem.label}</div>
                                            <div className="advanced-menu-item-description">{hardwareItem.description}</div>
                                          </div>
                                        </NavLink>
                                      ))}
                                      <div className="advanced-submenu-note">
                                        Reserved space for new hardware profiles.
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            }

                            return (
                              <NavLink
                                key={`${section.group}-${item.to}`}
                                to={item.to}
                                className={({ isActive }) => `advanced-menu-item${isActive ? ' advanced-menu-item--active' : ''}`}
                                style={{ '--advanced-item-color': item.color } as React.CSSProperties}
                                onClick={() => {
                                  setHardwareInterfacesOpen(false)
                                  setAdvancedMenuOpen(false)
                                }}
                              >
                                <item.icon size={16} weight="duotone" className="advanced-menu-item-icon" />
                                <div className="advanced-menu-item-content">
                                  <div className="advanced-menu-item-title">{item.label}</div>
                                  <div className="advanced-menu-item-description">{item.description}</div>
                                </div>
                              </NavLink>
                            )
                          })}
                        </section>
                      ))}
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
              if (nextOpen) {
                setMpx1MenuOpen(false)
              }
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
              {showAdvancedMenu && advancedMenuSections.map((section) => (
                <section key={`mobile-${section.group}`} className="nav-mobile-advanced-group">
                  <div className="nav-mobile-group-label">{section.group}</div>
                  <div className="nav-mobile-group-grid">
                    {section.items.map((item) => {
                      const Icon = item.icon

                      if (item.popupMenu === 'hardware-interfaces') {
                        return (
                          <div key={`mobile-${section.group}-${item.to}`} className="nav-mobile-submenu-wrap">
                            <button
                              type="button"
                              className={`nav-mobile-item nav-mobile-item--submenu${mobileHardwareInterfacesOpen ? ' is-open' : ''}`}
                              style={{ '--item-color': item.color } as React.CSSProperties}
                              onClick={() => setMobileHardwareInterfacesOpen(open => !open)}
                              aria-expanded={mobileHardwareInterfacesOpen}
                            >
                              <Icon size={18} weight="duotone" aria-hidden />
                              <span>{item.label}</span>
                              <CaretRight
                                size={14}
                                weight="bold"
                                className={`nav-mobile-item-caret${mobileHardwareInterfacesOpen ? ' is-open' : ''}`}
                              />
                            </button>

                            {mobileHardwareInterfacesOpen && (
                              <div className="nav-mobile-submenu-grid">
                                {hardwareInterfaceMenuItems.map((hardwareItem) => (
                                  <NavLink
                                    key={`${hardwareItem.label}-${hardwareItem.to}-mobile`}
                                    to={hardwareItem.to}
                                    className="nav-mobile-item nav-mobile-item--child"
                                    style={{ '--item-color': hardwareItem.color } as React.CSSProperties}
                                    onClick={() => {
                                      setMobileHardwareInterfacesOpen(false)
                                      setNavOpen(false)
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
                          key={`mobile-${section.group}-${item.to}`}
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
                  </div>
                </section>
              ))}
              
              {/* Message when Advanced Menu is hidden */}
              {!showAdvancedMenu && (
                <div className="nav-mobile-disabled-note">
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
