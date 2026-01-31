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
      <header className="topbar" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '0 16px',
        gap: 0,
      }}>
        {/* Inactive tabs - icons only, left-aligned */}
        <nav
          className="nav-links"
          aria-label="Main navigation"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flex: '0 0 auto',
          }}
        >
          {allNavItems.map((item) => {
            const isActive = item.to === 'library-dropdown'
              ? activeNav.type === 'library'
              : (location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/')))

            // Skip rendering the active item here - it goes in the center
            if (isActive) return null

            const Icon = item.icon

            // Render dropdown for library section
            if (item.to === 'library-dropdown') {
              return (
                <MenuProvider key="library">
                  <MenuButton
                    className="nav-link"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 36,
                      height: 36,
                      padding: 0,
                      cursor: 'pointer',
                      border: 'none',
                      borderRadius: 8,
                      background: 'rgba(255, 255, 255, 0.05)',
                      transition: 'all 0.2s ease',
                    }}
                    title={item.label}
                  >
                    <Icon size={18} style={{ color: item.color }} aria-hidden />
                  </MenuButton>
                  <Menu
                    className="menu"
                    gutter={8}
                    style={{ minWidth: 220 }}
                  >
                    {libraryPluginsItems.map((subItem) => (
                      <MenuItem
                        key={subItem.to}
                        className="menu-item"
                        render={<NavLink to={subItem.to} />}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 16px',
                          textDecoration: 'none',
                          color: 'inherit',
                        }}
                      >
                        <subItem.icon size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 500 }}>{subItem.label}</span>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{subItem.description}</span>
                        </div>
                      </MenuItem>
                    ))}
                  </Menu>
                </MenuProvider>
              )
            }

            // Regular nav link - icon only when inactive
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className="nav-link"
                title={`${item.label} - ${item.description}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  padding: 0,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.05)',
                  transition: 'all 0.2s ease',
                }}
              >
                <Icon size={18} style={{ color: item.color }} aria-hidden />
              </NavLink>
            )
          })}
        </nav>

        {/* Active tab - expanded, centered */}
        <div style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          {activeNav.type === 'library' ? (
            <MenuProvider>
              <MenuButton
                className="nav-link active"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '10px 24px',
                  cursor: 'pointer',
                  border: 'none',
                  borderRadius: 12,
                  background: `linear-gradient(135deg, ${libraryPluginsNav.color}20, ${libraryPluginsNav.color}10)`,
                  borderBottom: `2px solid ${libraryPluginsNav.color}`,
                  boxShadow: `0 4px 20px ${libraryPluginsNav.color}30`,
                  transition: 'all 0.3s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Library size={20} style={{ color: libraryPluginsNav.color }} aria-hidden />
                  <span style={{
                    fontWeight: 700,
                    fontSize: 16,
                    color: libraryPluginsNav.color,
                  }}>
                    {libraryPluginsNav.label}
                  </span>
                  <ChevronDown size={14} style={{ color: libraryPluginsNav.color }} aria-hidden />
                </div>
                <span style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}>
                  {libraryPluginsNav.description}
                </span>
              </MenuButton>
              <Menu
                className="menu"
                gutter={8}
                style={{ minWidth: 220 }}
              >
                {libraryPluginsItems.map((subItem) => (
                  <MenuItem
                    key={subItem.to}
                    className="menu-item"
                    render={<NavLink to={subItem.to} />}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <subItem.icon size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontWeight: 500 }}>{subItem.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{subItem.description}</span>
                    </div>
                  </MenuItem>
                ))}
              </Menu>
            </MenuProvider>
          ) : (
            <div
              className="nav-link active"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '10px 24px',
                borderRadius: 12,
                background: `linear-gradient(135deg, ${activeNav.item.color}20, ${activeNav.item.color}10)`,
                borderBottom: `2px solid ${activeNav.item.color}`,
                boxShadow: `0 4px 20px ${activeNav.item.color}30`,
                transition: 'all 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <activeNav.item.icon size={20} style={{ color: activeNav.item.color }} aria-hidden />
                <span style={{
                  fontWeight: 700,
                  fontSize: 16,
                  color: activeNav.item.color,
                }}>
                  {activeNav.item.label}
                </span>
              </div>
              <span style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}>
                {activeNav.item.description}
              </span>
            </div>
          )}
        </div>

        {/* Spacer to balance the layout */}
        <div style={{ flex: '0 0 auto', width: allNavItems.filter(item => {
          const isActive = item.to === 'library-dropdown'
            ? activeNav.type === 'library'
            : (location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/')))
          return !isActive
        }).length * 40 }} />
      </header>
      <main className="app-content">{children}</main>
    </div>
  )
}
