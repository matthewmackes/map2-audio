import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Menu, MenuButton, MenuItem, MenuProvider } from '@ariakit/react'
import { ChevronDown, PanelsTopLeft, Sparkles, Info, Package, AudioLines, Piano, LayoutGrid, Settings2, Activity, Sliders, Usb } from 'lucide-react'

const enableLegacy = import.meta.env.VITE_ENABLE_LEGACY === 'true'

// Items under the "hic sunt dracones" dropdown
const underTheHoodItems = [
  {
    to: '/',
    label: 'Overview',
    icon: Sparkles,
    description: 'System status & quick actions',
    color: '#f59e0b'  // Amber
  },
  {
    to: '/presets',
    label: 'Presets',
    icon: PanelsTopLeft,
    description: 'Save & recall your sounds',
    color: '#22c55e'  // Green
  },
  {
    to: '/midi',
    label: 'MIDI',
    icon: Piano,
    description: 'MIDI mapping & control',
    color: '#ec4899'  // Pink
  },
  {
    to: '/plugins',
    label: 'LV2 Plugins',
    icon: Package,
    description: 'LV2 plugin manager',
    color: '#06b6d4'  // Teal
  },
  {
    to: '/library',
    label: 'IR & NAM Library',
    icon: AudioLines,
    description: 'Impulse responses & NAM models',
    color: '#06b6d4'  // Teal
  },
  {
    to: '/metering',
    label: 'Metering',
    icon: Activity,
    description: 'Audio analysis & monitoring',
    color: '#37d6c9'  // Cyan-teal
  },
  {
    to: '/dsp',
    label: 'DSP',
    icon: Sliders,
    description: 'Dynamics & EQ processors',
    color: '#ff6644'  // Orange-red
  },
  {
    to: '/edirol-ua1000',
    label: 'Edirol UA-1000',
    icon: Usb,
    description: 'USB audio interface control',
    color: '#0066cc'  // Roland blue
  },
  {
    to: '/hotone-jogg',
    label: 'HoTone JoGG',
    icon: AudioLines,
    description: 'HoTone audio interface',
    color: '#e53935'  // HoTone red
  },
]

// Main navigation items (left side, top-level)
const navItemsLeft = [
  {
    to: '/grid',
    label: 'Grid',
    icon: LayoutGrid,
    description: 'Cortex-style grid editor',
    color: '#f97316'  // Orange
  },
  ...(enableLegacy ? [{ to: '/legacy', label: 'Legacy', icon: Sparkles, description: 'Classic interface', color: '#ec4899' }] : []),
]

// Right-side navigation items (hic sunt dracones dropdown + About)
const navItemsRight = [
  {
    to: '/about',
    label: 'About',
    icon: Info,
    description: 'System info',
    color: '#64748b'  // Slate
  },
]

// hic sunt dracones dropdown nav item
const underTheHoodNav = {
  label: 'hic sunt dracones',
  icon: Settings2,
  description: 'Advanced settings & configuration',
  color: '#a855f7'  // Purple
}

// Check if current path matches a nav item
function useActiveNavItem() {
  const location = useLocation()

  // Check hic sunt dracones items
  const underTheHoodMatch = underTheHoodItems.find(item =>
    location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/'))
  )

  if (underTheHoodMatch) {
    return { type: 'under-the-hood' as const, item: underTheHoodMatch, parentNav: underTheHoodNav }
  }

  // Check main nav items (left + right)
  const allMainItems = [...navItemsLeft, ...navItemsRight]
  for (const item of allMainItems) {
    if (location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/'))) {
      return { type: 'main' as const, item }
    }
  }

  // Default to first hic sunt dracones item (Overview)
  return { type: 'under-the-hood' as const, item: underTheHoodItems[0], parentNav: underTheHoodNav }
}

export function AppShell({ children }: { children: ReactNode }) {
  const activeNav = useActiveNavItem()

  // Left nav: main items
  const leftNavItems = [...navItemsLeft]

  // Right nav: hic sunt dracones dropdown + About
  const rightNavItems = [
    { ...underTheHoodNav, to: 'under-the-hood-dropdown', isDropdown: true },
    ...navItemsRight,
  ]

  // Helper to render a nav item (regular link or dropdown)
  const renderNavItem = (item: typeof rightNavItems[number]) => {
    const Icon = item.icon

    // Dropdown for hic sunt dracones section
    if (item.to === 'under-the-hood-dropdown') {
      return (
        <MenuProvider key="under-the-hood">
          <MenuButton
            className={`nav-tab-item ${activeNav.type === 'under-the-hood' ? 'nav-tab-active' : ''}`}
            title={item.description}
          >
            <span className="nav-tab-icon" style={{ '--tab-color': item.color } as React.CSSProperties}>
              <Icon size={16} aria-hidden />
            </span>
            <span className="nav-tab-label">{item.label}</span>
            <ChevronDown size={12} className="nav-tab-chevron" aria-hidden />
          </MenuButton>
          <Menu className="menu" gutter={8} style={{ minWidth: 260 }}>
            {underTheHoodItems.map((subItem) => (
              <MenuItem
                key={subItem.to}
                className="menu-item"
                render={<NavLink to={subItem.to} />}
              >
                <subItem.icon size={16} style={{ color: subItem.color, flexShrink: 0 }} />
                <div className="menu-item-content">
                  <span className="menu-item-label">{subItem.label}</span>
                  <span className="menu-item-desc">{subItem.description}</span>
                </div>
              </MenuItem>
            ))}
          </Menu>
        </MenuProvider>
      )
    }

    // Regular nav link
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
        {/* Left: Main navigation tabs */}
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

        {/* Right: hic sunt dracones + About */}
        <nav className="nav-tabs-right" aria-label="Settings navigation">
          {rightNavItems.map(renderNavItem)}
        </nav>
      </header>
      <main className="app-content">{children}</main>
    </div>
  )
}
