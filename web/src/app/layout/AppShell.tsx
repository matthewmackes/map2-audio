import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { PanelsTopLeft, Sparkles, Info, Package, AudioLines, Piano, LayoutGrid, Activity, Sliders, Usb, BookOpen, Monitor, Menu, X } from 'lucide-react'

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
  {
    to: '/lcd',
    label: 'LCD Displays',
    icon: Monitor,
    description: 'LCD screen management & alerts',
    color: '#22c55e'  // Green
  },
  {
    to: '/lcd-dashboard',
    label: 'LCD Dashboard',
    icon: Monitor,
    description: 'Real-time LCD event feed',
    color: '#22c55e'  // Green
  },
  {
    to: '/lcd-nodes',
    label: 'LCD Nodes',
    icon: Monitor,
    description: 'Per-node LCD views',
    color: '#22c55e'  // Green
  },
  {
    to: '/lcd-settings',
    label: 'LCD Settings',
    icon: Monitor,
    description: 'Display configuration',
    color: '#22c55e'  // Green
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

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target as Node)) {
        setNavOpen(false)
      }
    }

    if (navOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [navOpen])

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

        {/* Right: About + Hamburger Menu */}
        <div className="nav-tabs-right-container">
          <nav className="nav-tabs-right" aria-label="Settings navigation">
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
              {/* Under the hood items */}
              {underTheHoodItems.map((item) => {
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
            </div>
          </div>
        )}
      </header>
      <main className="app-content">{children}</main>
    </div>
  )
}
