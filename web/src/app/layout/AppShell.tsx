import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Menu, MenuButton, MenuItem, MenuProvider } from '@ariakit/react'
import { ChevronDown, PanelsTopLeft, Sparkles, Workflow, Info, Package, Library, Plug, AudioLines } from 'lucide-react'

const enableLegacy = import.meta.env.VITE_ENABLE_LEGACY === 'true'

// Submenu items for Library & Plugins dropdown
const libraryPluginsItems = [
  {
    to: '/plugins',
    label: 'LV2 Plugins',
    icon: Package,
    description: 'LV2 plugin manager'
  },
  {
    to: '/plugins/vst3',
    label: 'VST3 Plugins',
    icon: Plug,
    description: 'VST3 plugin manager'
  },
  {
    to: '/library',
    label: 'IR & NAM Library',
    icon: AudioLines,
    description: 'Impulse responses & NAM models'
  },
]

// Main navigation items with colors for inactive icons
const navItems = [
  {
    to: '/',
    label: 'Overview',
    icon: Sparkles,
    description: 'System status & quick actions',
    color: '#f59e0b'  // Amber
  },
  {
    to: '/chains',
    label: 'Chains',
    icon: Workflow,
    description: 'Build your signal path',
    color: '#00d4ff'  // Cyan
  },
  {
    to: '/chains/flow',
    label: 'Flow',
    icon: Workflow,
    description: 'Visual effects editor',
    color: '#8b5cf6'  // Purple
  },
  {
    to: '/presets',
    label: 'Presets',
    icon: PanelsTopLeft,
    description: 'Save & recall your sounds',
    color: '#22c55e'  // Green
  },
  {
    to: '/about',
    label: 'About',
    icon: Info,
    description: 'System info',
    color: '#64748b'  // Slate
  },
  ...(enableLegacy ? [{ to: '/legacy', label: 'Legacy', icon: Sparkles, description: 'Classic interface', color: '#ec4899' }] : []),
]

// Library & Plugins item (special handling)
const libraryPluginsNav = {
  label: 'Library & Plugins',
  icon: Library,
  description: 'LV2, VST3, IRs & NAM',
  color: '#06b6d4'  // Teal
}

// Check if current path matches a nav item
function useActiveNavItem() {
  const location = useLocation()

  // Check library/plugins items
  const isLibraryActive = libraryPluginsItems.some(item =>
    location.pathname === item.to || location.pathname.startsWith(item.to + '/')
  )

  if (isLibraryActive) {
    return { type: 'library' as const, item: libraryPluginsNav }
  }

  // Check main nav items
  for (const item of navItems) {
    if (location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/'))) {
      return { type: 'main' as const, item }
    }
  }

  // Default to Overview
  return { type: 'main' as const, item: navItems[0] }
}

export function AppShell({ children }: { children: ReactNode }) {
  const activeNav = useActiveNavItem()
  const location = useLocation()

  // Get all nav items in order, including library in the right position
  const allNavItems = [
    ...navItems.slice(0, 4),  // Overview, Chains, Flow, Presets
    { ...libraryPluginsNav, to: 'library-dropdown', isDropdown: true },
    ...navItems.slice(4),     // About, Legacy
  ]

  return (
    <div className="app-shell">
      <header className="topbar-pro">
        {/* Left: Inactive navigation tabs with icon + label */}
        <nav className="nav-tabs-left" aria-label="Main navigation">
          {allNavItems.map((item) => {
            const isActive = item.to === 'library-dropdown'
              ? activeNav.type === 'library'
              : (location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/')))

            // Skip active item - it goes in center
            if (isActive) return null

            const Icon = item.icon

            // Dropdown for library section
            if (item.to === 'library-dropdown') {
              return (
                <MenuProvider key="library">
                  <MenuButton
                    className="nav-tab-item"
                    title={item.description}
                  >
                    <span className="nav-tab-icon" style={{ '--tab-color': item.color } as React.CSSProperties}>
                      <Icon size={16} aria-hidden />
                    </span>
                    <span className="nav-tab-label">{item.label}</span>
                    <ChevronDown size={12} className="nav-tab-chevron" aria-hidden />
                  </MenuButton>
                  <Menu className="menu" gutter={8} style={{ minWidth: 240 }}>
                    {libraryPluginsItems.map((subItem) => (
                      <MenuItem
                        key={subItem.to}
                        className="menu-item"
                        render={<NavLink to={subItem.to} />}
                      >
                        <subItem.icon size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
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
          })}
        </nav>

        {/* Center: Active tab title - prominent display */}
        <div className="nav-active-title">
          {activeNav.type === 'library' ? (
            <MenuProvider>
              <MenuButton
                className="nav-active-btn"
                style={{ '--active-color': libraryPluginsNav.color } as React.CSSProperties}
              >
                <Library size={22} className="nav-active-icon" aria-hidden />
                <span className="nav-active-text">{libraryPluginsNav.label}</span>
                <ChevronDown size={14} className="nav-active-chevron" aria-hidden />
              </MenuButton>
              <Menu className="menu" gutter={8} style={{ minWidth: 240 }}>
                {libraryPluginsItems.map((subItem) => (
                  <MenuItem
                    key={subItem.to}
                    className="menu-item"
                    render={<NavLink to={subItem.to} />}
                  >
                    <subItem.icon size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <div className="menu-item-content">
                      <span className="menu-item-label">{subItem.label}</span>
                      <span className="menu-item-desc">{subItem.description}</span>
                    </div>
                  </MenuItem>
                ))}
              </Menu>
            </MenuProvider>
          ) : (
            <div
              className="nav-active-display"
              style={{ '--active-color': activeNav.item.color } as React.CSSProperties}
            >
              <activeNav.item.icon size={22} className="nav-active-icon" aria-hidden />
              <span className="nav-active-text">{activeNav.item.label}</span>
            </div>
          )}
        </div>

        {/* Right: Balance spacer */}
        <div className="nav-spacer" />
      </header>
      <main className="app-content">{children}</main>
    </div>
  )
}
