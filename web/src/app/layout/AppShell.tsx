import type { ReactNode } from 'react'
import { Fragment } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Menu, MenuButton, MenuItem, MenuProvider } from '@ariakit/react'
import { ChevronRight, ChevronDown, PanelsTopLeft, Sparkles, Workflow, Info, Package, Library, Plug, AudioLines } from 'lucide-react'

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

// Main navigation items
const navItems = [
  {
    to: '/',
    label: 'Overview',
    icon: Sparkles,
    description: 'System status & quick actions'
  },
  {
    to: '/chains',
    label: 'Chains',
    icon: Workflow,
    description: 'Build your signal path'
  },
  {
    to: '/chains/flow',
    label: 'Flow',
    icon: Workflow,
    description: 'Visual effects editor'
  },
  {
    to: '/presets',
    label: 'Presets',
    icon: PanelsTopLeft,
    description: 'Save & recall your sounds'
  },
  {
    to: '/about',
    label: 'About',
    icon: Info,
    description: 'System info'
  },
  ...(enableLegacy ? [{ to: '/legacy', label: 'Legacy', icon: Sparkles, description: 'Classic interface' }] : []),
]

// Check if current path is in the library/plugins section
function useIsLibraryPluginsActive() {
  const location = useLocation()
  return libraryPluginsItems.some(item =>
    location.pathname === item.to || location.pathname.startsWith(item.to + '/')
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const isLibraryPluginsActive = useIsLibraryPluginsActive()

  return (
    <div className="app-shell">
      <header className="topbar" style={{ justifyContent: 'center' }}>
        <nav className="nav-links" aria-label="Main navigation" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {navItems.map((item, index) => (
            <Fragment key={item.to}>
              {index > 0 && (
                <ChevronRight
                  size={14}
                  style={{ color: 'var(--muted)', flexShrink: 0, margin: '0 2px' }}
                  aria-hidden
                />
              )}
              {/* Insert Library & Plugins dropdown after Presets */}
              {item.to === '/about' && (
                <>
                  <MenuProvider>
                    <MenuButton
                      className={`nav-link${isLibraryPluginsActive ? ' active' : ''}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                        padding: '6px 12px',
                        minWidth: 80,
                        cursor: 'pointer',
                        border: 'none',
                        background: isLibraryPluginsActive ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Library size={16} aria-hidden />
                        <span style={{ fontWeight: 500 }}>Library & Plugins</span>
                        <ChevronDown size={12} aria-hidden />
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        LV2, VST3, IRs & NAM
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
                  <ChevronRight
                    size={14}
                    style={{ color: 'var(--muted)', flexShrink: 0, margin: '0 2px' }}
                    aria-hidden
                  />
                </>
              )}
              <NavLink
                to={item.to}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 12px', minWidth: 80 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <item.icon size={16} aria-hidden />
                  <span style={{ fontWeight: 500 }}>{item.label}</span>
                </div>
                <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {item.description}
                </span>
              </NavLink>
            </Fragment>
          ))}
        </nav>
      </header>
      <main className="app-content">{children}</main>
    </div>
  )
}
