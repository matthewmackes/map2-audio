import { GithubLogo, ArrowSquareOut, Info, MusicNote, Code, Lightning, DesktopTower, PenNib, Cpu, Package, Pulse, Sliders, Palette, CaretDown, Scales, Database, Globe, Stack, Cube, Terminal, FileCode, Headphones, Broadcast, BookOpen, Shield, Heart, TrendUp } from '@phosphor-icons/react'
import { useEffect, useState, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { Menu, MenuButton, MenuItem, MenuProvider } from '@ariakit/react'
import { themes, themeOrder, applyTheme, getSavedThemeId, saveCustomTheme, getCustomThemes, deleteCustomTheme, getAllThemes } from '../theme'
import type { Theme } from '../theme'
import { ThemeCreatorDialog } from '../components/ThemeCreatorDialog'
import { PasswordDialog } from '../components/PasswordDialog'
import { SpecialSettingsDialog } from '../components/SpecialSettingsDialog'
import { ShoppingSearchDialog } from '../components/ShoppingSearchDialog'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { advancedMenuItems } from '../data/advancedMenuItems'

// Dragon icon for "hic sunt dracones" menu
const DragonIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2C10.5 2 9 3 8.5 4.5C8 6 8.5 7.5 9.5 8.5L7 11C6 10.5 4.5 10.5 3.5 11.5C2.5 12.5 2.5 14 3 15L2 16L3 17L4 16C5 16.5 6.5 16.5 7.5 15.5L10 18C9 19 9 20.5 9.5 21.5C10 22.5 11.5 23 13 22.5C14.5 22 15.5 20.5 15.5 19L18.5 16C19.5 17 21 17 22 16C22 14.5 21.5 13 20 12.5L21 10L19.5 9.5L18.5 11C17.5 10.5 16 11 15 12L12.5 9.5C13.5 8.5 14 7 13.5 5.5C13 4 11.5 3 10 3"
      stroke="#dc2626"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="#dc2626"
      fillOpacity="0.2"
    />
    <circle cx="10" cy="5" r="1" fill="#dc2626" />
  </svg>
)

interface VersionInfo {
  version?: string
  build_date?: string
  commit?: string
}

interface WelcomeBannerStatus {
  installed: boolean
  path?: string
}

interface BootSplashStatus {
  installed: boolean
  theme_exists?: boolean
  plymouth_installed?: boolean
  current_theme?: string
  is_active?: boolean
}

interface RateLimitingStatus {
  enabled: boolean
}

interface ProjectCredit {
  name: string
  description: string
  website: string
  color: string
  icon: React.ReactNode
  role: string
  license: string
}

interface LicenseInfo {
  id: string
  name: string
  shortName: string
  color: string
  url: string
  description: string
  permissions: string[]
  conditions: string[]
  limitations: string[]
}

// Core technologies that power MAP2
const CORE_PROJECTS: ProjectCredit[] = [
  {
    name: 'JUCE',
    description: 'Cross-platform C++ audio application framework with support for VST, VST3, AU, AUv3, LV2, and AAX plugins',
    website: 'https://juce.com/',
    color: '#1e40af',
    icon: <MusicNote size={20} weight="duotone" />,
    role: 'Audio Engine',
    license: 'GPLv3 / Commercial',
  },
  {
    name: 'Neural Amp Modeler',
    description: 'Deep learning technology for modeling guitar amplifiers, pedals, and signal chains using WaveNet architecture',
    website: 'https://www.neuralampmodeler.com/',
    color: '#60a5fa',
    icon: <Lightning size={20} weight="duotone" />,
    role: 'AI Amp Modeling',
    license: 'MIT',
  },
  {
    name: 'LV2',
    description: 'Extensible open standard audio plugin format specification for cross-DAW plugin compatibility',
    website: 'https://lv2plug.in/',
    color: '#059669',
    icon: <Cpu size={20} weight="duotone" />,
    role: 'Plugin Format',
    license: 'ISC',
  },
  {
    name: 'Fedora PREEMPT_RT',
    description: 'Fedora Linux distribution with real-time kernel support for deterministic low-latency performance',
    website: 'https://fedoraproject.org/',
    color: '#0b57a4',
    icon: <PenNib size={20} weight="duotone" />,
    role: 'Real-time OS',
    license: 'Various (GPL)',
  },
]

// Backend & API technologies
const BACKEND_PROJECTS: ProjectCredit[] = [
  {
    name: 'FastAPI',
    description: 'Modern, high-performance Python web framework for building APIs with automatic OpenAPI documentation',
    website: 'https://fastapi.tiangolo.com/',
    color: '#0ea5e9',
    icon: <DesktopTower size={20} weight="duotone" />,
    role: 'Backend API',
    license: 'MIT',
  },
  {
    name: 'Uvicorn',
    description: 'Lightning-fast ASGI server implementation using uvloop and httptools',
    website: 'https://www.uvicorn.org/',
    color: '#2dd4bf',
    icon: <Broadcast size={20} weight="duotone" />,
    role: 'ASGI Server',
    license: 'BSD-3-Clause',
  },
  {
    name: 'SQLAlchemy',
    description: 'Python SQL toolkit and Object-Relational Mapping library for database interactions',
    website: 'https://www.sqlalchemy.org/',
    color: '#dc2626',
    icon: <Database size={20} weight="duotone" />,
    role: 'Database ORM',
    license: 'MIT',
  },
  {
    name: 'Pydantic',
    description: 'Data validation and settings management using Python type annotations',
    website: 'https://docs.pydantic.dev/',
    color: '#e91e63',
    icon: <Shield size={20} weight="duotone" />,
    role: 'Data Validation',
    license: 'MIT',
  },
]

// Frontend technologies
const FRONTEND_PROJECTS: ProjectCredit[] = [
  {
    name: 'React',
    description: 'Open-source JavaScript library for building user interfaces with component-based architecture',
    website: 'https://react.dev/',
    color: '#60a5fa',
    icon: <Code size={20} weight="duotone" />,
    role: 'UI Framework',
    license: 'MIT',
  },
  {
    name: 'Vite',
    description: 'Next-generation frontend tooling with instant server start and lightning-fast HMR',
    website: 'https://vitejs.dev/',
    color: '#646cff',
    icon: <Lightning size={20} weight="duotone" />,
    role: 'Build Tool',
    license: 'MIT',
  },
  {
    name: 'TypeScript',
    description: 'Strongly typed programming language that builds on JavaScript with type safety',
    website: 'https://www.typescriptlang.org/',
    color: '#3178c6',
    icon: <FileCode size={20} weight="duotone" />,
    role: 'Type System',
    license: 'Apache-2.0',
  },
  {
    name: 'Material UI',
    description: 'React component library implementing Google\'s Material Design with customizable themes',
    website: 'https://mui.com/',
    color: '#007fff',
    icon: <Stack size={20} weight="duotone" />,
    role: 'UI Components',
    license: 'MIT',
  },
  {
    name: 'React Flow',
    description: 'Highly customizable library for building node-based editors and interactive diagrams',
    website: 'https://reactflow.dev/',
    color: '#60a5fa',
    icon: <Globe size={20} weight="duotone" />,
    role: 'Flow Editor',
    license: 'MIT',
  },
  {
    name: 'Lucide React',
    description: 'Beautiful & consistent icon toolkit with 1000+ carefully crafted icons',
    website: 'https://lucide.dev/',
    color: '#f56565',
    icon: <Heart size={20} weight="duotone" />,
    role: 'Icons',
    license: 'ISC',
  },
]

// Audio & DSP libraries
const AUDIO_PROJECTS: ProjectCredit[] = [
  {
    name: 'Eigen',
    description: 'C++ template library for linear algebra: matrices, vectors, numerical solvers',
    website: 'https://eigen.tuxfamily.org/',
    color: '#1f77b4',
    icon: <Cube size={20} weight="duotone" />,
    role: 'Linear Algebra',
    license: 'MPL-2.0',
  },
  {
    name: 'lilv',
    description: 'C library to discover, load, and run LV2 plugins with RDF-based metadata',
    website: 'https://drobilla.net/software/lilv.html',
    color: '#22c55e',
    icon: <Package size={20} weight="duotone" />,
    role: 'Plugin Discovery',
    license: 'ISC',
  },
  {
    name: 'PyTorch',
    description: 'Open source machine learning framework for neural network training and inference',
    website: 'https://pytorch.org/',
    color: '#ee4c2c',
    icon: <Lightning size={20} weight="duotone" />,
    role: 'ML Framework',
    license: 'BSD-3-Clause',
  },
  {
    name: 'NumPy',
    description: 'Fundamental package for scientific computing with Python arrays and matrices',
    website: 'https://numpy.org/',
    color: '#013243',
    icon: <Terminal size={20} weight="duotone" />,
    role: 'Numerical Computing',
    license: 'BSD-3-Clause',
  },
  {
    name: 'SciPy',
    description: 'Python library for scientific and technical computing with signal processing',
    website: 'https://scipy.org/',
    color: '#8caae6',
    icon: <Pulse size={20} weight="duotone" />,
    role: 'Signal Processing',
    license: 'BSD-3-Clause',
  },
  {
    name: 'python-rtmidi',
    description: 'Python bindings for RtMidi providing cross-platform real-time MIDI I/O',
    website: 'https://github.com/SpotlightKid/python-rtmidi',
    color: '#60a5fa',
    icon: <MusicNote size={20} weight="duotone" />,
    role: 'MIDI Interface',
    license: 'MIT',
  },
]

// Additional utilities
const UTILITY_PROJECTS: ProjectCredit[] = [
  {
    name: 'nlohmann/json',
    description: 'Modern C++ JSON library with intuitive syntax and excellent performance',
    website: 'https://github.com/nlohmann/json',
    color: '#f5a623',
    icon: <FileCode size={20} weight="duotone" />,
    role: 'JSON Parser (C++)',
    license: 'MIT',
  },
  {
    name: 'pybind11',
    description: 'Seamless operability between C++11 and Python for creating bindings',
    website: 'https://pybind11.readthedocs.io/',
    color: '#306998',
    icon: <Code size={20} weight="duotone" />,
    role: 'Python Bindings',
    license: 'BSD-3-Clause',
  },
  {
    name: 'TanStack Query',
    description: 'Powerful asynchronous state management for data fetching and caching',
    website: 'https://tanstack.com/query',
    color: '#60a5fa',
    icon: <Database size={20} weight="duotone" />,
    role: 'Data Fetching',
    license: 'MIT',
  },
  {
    name: 'React Router',
    description: 'Declarative routing library for React applications with nested routes',
    website: 'https://reactrouter.com/',
    color: '#ca4245',
    icon: <Globe size={20} weight="duotone" />,
    role: 'Routing',
    license: 'MIT',
  },
  {
    name: 'Recharts',
    description: 'Composable charting library built on React components for data visualization',
    website: 'https://recharts.org/',
    color: '#60a5fa',
    icon: <Pulse size={20} weight="duotone" />,
    role: 'Charts',
    license: 'MIT',
  },
  {
    name: 'Ariakit',
    description: 'Accessible React component library with unstyled, primitive components',
    website: 'https://ariakit.org/',
    color: '#007acc',
    icon: <Stack size={20} weight="duotone" />,
    role: 'Accessibility',
    license: 'MIT',
  },
]

// License information
const LICENSES: LicenseInfo[] = [
  {
    id: 'mit',
    name: 'MIT License',
    shortName: 'MIT',
    color: '#22c55e',
    url: 'https://opensource.org/licenses/MIT',
    description: 'A short and simple permissive license with conditions only requiring preservation of copyright and license notices.',
    permissions: ['Commercial use', 'Modification', 'Distribution', 'Private use'],
    conditions: ['License and copyright notice'],
    limitations: ['Liability', 'Warranty'],
  },
  {
    id: 'apache2',
    name: 'Apache License 2.0',
    shortName: 'Apache-2.0',
    color: '#ef4444',
    url: 'https://opensource.org/licenses/Apache-2.0',
    description: 'A permissive license that also provides an express grant of patent rights from contributors.',
    permissions: ['Commercial use', 'Modification', 'Distribution', 'Patent use', 'Private use'],
    conditions: ['License and copyright notice', 'State changes'],
    limitations: ['Liability', 'Warranty', 'Trademark use'],
  },
  {
    id: 'bsd3',
    name: 'BSD 3-Clause License',
    shortName: 'BSD-3-Clause',
    color: '#f59e0b',
    url: 'https://opensource.org/licenses/BSD-3-Clause',
    description: 'A permissive license similar to MIT but with a clause restricting use of contributor names.',
    permissions: ['Commercial use', 'Modification', 'Distribution', 'Private use'],
    conditions: ['License and copyright notice'],
    limitations: ['Liability', 'Warranty'],
  },
  {
    id: 'gpl3',
    name: 'GNU General Public License v3.0',
    shortName: 'GPLv3',
    color: '#3b82f6',
    url: 'https://www.gnu.org/licenses/gpl-3.0.html',
    description: 'Strong copyleft license requiring source code disclosure and licensing derivatives under the same terms.',
    permissions: ['Commercial use', 'Modification', 'Distribution', 'Patent use', 'Private use'],
    conditions: ['License and copyright notice', 'State changes', 'Disclose source', 'Same license'],
    limitations: ['Liability', 'Warranty'],
  },
  {
    id: 'isc',
    name: 'ISC License',
    shortName: 'ISC',
    color: '#60a5fa',
    url: 'https://opensource.org/licenses/ISC',
    description: 'A permissive license functionally equivalent to MIT but with simplified language.',
    permissions: ['Commercial use', 'Modification', 'Distribution', 'Private use'],
    conditions: ['License and copyright notice'],
    limitations: ['Liability', 'Warranty'],
  },
  {
    id: 'mpl2',
    name: 'Mozilla Public License 2.0',
    shortName: 'MPL-2.0',
    color: '#60a5fa',
    url: 'https://opensource.org/licenses/MPL-2.0',
    description: 'A weak copyleft license that allows larger works to use different licenses but requires modified files to remain open.',
    permissions: ['Commercial use', 'Modification', 'Distribution', 'Patent use', 'Private use'],
    conditions: ['Disclose source (modified files)', 'License and copyright notice', 'Same license (modified files)'],
    limitations: ['Liability', 'Warranty', 'Trademark use'],
  },
]

// Combine all projects for the legacy PROJECTS export
const PROJECTS: ProjectCredit[] = CORE_PROJECTS

const LINKS = [
  { label: 'GitHub', url: 'https://github.com/matthewmackes/map2-audio', icon: GithubLogo },
  { label: 'JUCE', url: 'https://juce.com', icon: ArrowSquareOut },
  { label: 'NAM', url: 'https://www.neuralampmodeler.com', icon: ArrowSquareOut },
  { label: 'LV2', url: 'https://lv2plug.in', icon: ArrowSquareOut },
  { label: 'FastAPI', url: 'https://fastapi.tiangolo.com', icon: ArrowSquareOut },
  { label: 'React', url: 'https://react.dev', icon: ArrowSquareOut },
]

// Helper component for rendering project cards
const ProjectCard = ({ project }: { project: ProjectCredit }) => (
  <a
    href={project.website}
    target="_blank"
    rel="noreferrer"
    style={{
      textDecoration: 'none',
      color: 'inherit',
      transition: 'all 150ms'
    }}
    onMouseEnter={e => {
      const el = e.currentTarget as HTMLElement
      el.style.transform = 'translateY(-2px)'
    }}
    onMouseLeave={e => {
      const el = e.currentTarget as HTMLElement
      el.style.transform = 'translateY(0)'
    }}
  >
    <div
      style={{
        padding: 14,
        background: `linear-gradient(135deg, rgba(15, 20, 35, 0.8) 0%, rgba(15, 20, 35, 0.6) 100%)`,
        border: `1px solid ${project.color}40`,
        borderRadius: 8,
        backdropFilter: 'blur(8px)',
        cursor: 'pointer',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'all 150ms'
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = project.color
        el.style.background = `linear-gradient(135deg, ${project.color}10 0%, ${project.color}05 100%)`
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = `${project.color}40`
        el.style.background = `linear-gradient(135deg, rgba(15, 20, 35, 0.8) 0%, rgba(15, 20, 35, 0.6) 100%)`
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ color: project.color }}>
          {project.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: project.color }}>
            {project.name}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>
            {project.role}
          </div>
        </div>
        <div style={{
          fontSize: 9,
          padding: '2px 6px',
          background: `${project.color}20`,
          borderRadius: 4,
          color: project.color,
          fontWeight: 500
        }}>
          {project.license}
        </div>
      </div>
      <p style={{
        margin: 0,
        fontSize: 11,
        color: '#a1a1aa',
        lineHeight: '1.4',
        flex: 1
      }}>
        {project.description}
      </p>
    </div>
  </a>
)

// Helper component for section headers
const SectionHeader = ({ title, icon, color }: { title: string; icon: React.ReactNode; color: string }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 700,
    color: color,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  }}>
    {icon}
    {title}
  </div>
)

export function AboutPage() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [welcomeBanner, setWelcomeBanner] = useState<WelcomeBannerStatus | null>(null)
  const [bannerLoading, setBannerLoading] = useState(false)
  const [bootSplash, setBootSplash] = useState<BootSplashStatus | null>(null)
  const [splashLoading, setSplashLoading] = useState(false)
  const [rateLimiting, setRateLimiting] = useState<RateLimitingStatus | null>(null)
  const [rateLimitingLoading, setRateLimitingLoading] = useState(false)
  const [showThemeCreator, setShowThemeCreator] = useState(false)
  const [customThemes, setCustomThemes] = useState<Record<string, Theme>>({})
  const [currentTheme, setCurrentTheme] = useState(getSavedThemeId())
  
  // Special settings state
  const {
    settings: specialSettings,
    isLoading: specialSettingsLoading,
    updateSettings: updateSpecialSettings,
  } = useSpecialSettings()
  const [specialActionLoading, setSpecialActionLoading] = useState(false)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [showSpecialSettings, setShowSpecialSettings] = useState(false)
  const [showShoppingDialog, setShowShoppingDialog] = useState(false)
  const [legalOpen, setLegalOpen] = useState(false)
  const [isPageLoaded, setIsPageLoaded] = useState(
    () => typeof document !== 'undefined' && document.readyState === 'complete'
  )

  const refreshCustomThemes = useCallback(() => {
    setCustomThemes(getCustomThemes())
  }, [])

  useEffect(() => {
    if (isPageLoaded) return

    const onLoad = () => setIsPageLoaded(true)
    window.addEventListener('load', onLoad, { once: true })
    return () => window.removeEventListener('load', onLoad)
  }, [isPageLoaded])

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then(setVersionInfo)
      .catch(() => setVersionInfo({ version: '3.1.0', build_date: 'Feb 2025' }))

    // Check welcome banner status
    fetch('/api/system/welcome-banner')
      .then(r => r.json())
      .then(setWelcomeBanner)
      .catch(() => setWelcomeBanner({ installed: false }))

    // Check boot splash status
    fetch('/api/system/boot-splash')
      .then(r => r.json())
      .then(setBootSplash)
      .catch(() => setBootSplash({ installed: false }))

    // Check rate limiting status
    fetch('/api/system/rate-limiting')
      .then(r => r.json())
      .then(setRateLimiting)
      .catch(() => setRateLimiting({ enabled: true }))

    // Load custom themes
    refreshCustomThemes()
  }, [refreshCustomThemes])

  const handleSaveTheme = (theme: Theme) => {
    saveCustomTheme(theme)
    applyTheme(theme.id)
    setCurrentTheme(theme.id)
    refreshCustomThemes()
  }

  const handleDeleteCustomTheme = (themeId: string) => {
    if (currentTheme === themeId) {
      applyTheme('default')
      setCurrentTheme('default')
    }
    deleteCustomTheme(themeId)
    refreshCustomThemes()
  }

  const handleThemeChange = (themeId: string) => {
    applyTheme(themeId)
    setCurrentTheme(themeId)
  }

  const toggleWelcomeBanner = async () => {
    if (!welcomeBanner || bannerLoading) return
    setBannerLoading(true)
    try {
      const response = await fetch(`/api/system/welcome-banner?install=${!welcomeBanner.installed}`, {
        method: 'POST'
      })
      const result = await response.json()
      if (result.success) {
        setWelcomeBanner({ installed: result.installed })
      }
    } catch (e) {
      console.error('Failed to toggle welcome banner:', e)
    } finally {
      setBannerLoading(false)
    }
  }

  const toggleBootSplash = async () => {
    if (!bootSplash || splashLoading) return
    setSplashLoading(true)
    try {
      const response = await fetch(`/api/system/boot-splash?install=${!bootSplash.installed}`, {
        method: 'POST'
      })
      const result = await response.json()
      if (result.success) {
        setBootSplash({ ...bootSplash, installed: result.installed })
      }
    } catch (e) {
      console.error('Failed to toggle boot splash:', e)
    } finally {
      setSplashLoading(false)
    }
  }

  const toggleRateLimiting = async () => {
    if (!rateLimiting || rateLimitingLoading) return
    setRateLimitingLoading(true)
    try {
      const response = await fetch(`/api/system/rate-limiting?enabled=${!rateLimiting.enabled}`, {
        method: 'POST'
      })
      const result = await response.json()
      if (result.success) {
        setRateLimiting({ enabled: result.enabled })
      }
    } catch (e) {
      console.error('Failed to toggle rate limiting:', e)
    } finally {
      setRateLimitingLoading(false)
    }
  }

  // Special mode handlers
  const handleSpecialClick = async () => {
    if (!specialSettings || specialSettingsLoading || specialActionLoading) return

    if (specialSettings?.enabled) {
      // Unchecking - disable immediately
      setSpecialActionLoading(true)
      try {
        await updateSpecialSettings({ enabled: false })
      } catch (error) {
        console.error('Failed to disable special mode:', error)
      } finally {
        setSpecialActionLoading(false)
      }
    } else {
      // Checking - require password first
      setShowPasswordDialog(true)
    }
  }

  const handlePasswordSuccess = () => {
    setShowPasswordDialog(false)
    setShowSpecialSettings(true)
  }

  const handleSettingsSave = async (settings: { enabled: boolean; hiddenPlugins: string[]; menuLocation: 'top-nav' | 'mobile-only' | 'hidden' }) => {
    await updateSpecialSettings(settings)
    setShowSpecialSettings(false)
  }

  const openSpecialSettings = () => {
    if (specialSettings?.enabled) {
      setShowSpecialSettings(true)
    }
  }


  return (
    <div style={{
      padding: '32px',
      background: 'linear-gradient(135deg, rgba(10, 15, 25, 0.5) 0%, rgba(20, 25, 40, 0.3) 100%)',
      minHeight: '100vh'
    }}>
      {/* Header Section */}
      <header style={{
        marginBottom: 40,
        paddingBottom: 24,
        borderBottom: '2px solid rgba(59, 130, 246, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <Info size={36} weight="duotone" style={{ color: '#3b82f6', marginRight: 8, flexShrink: 0 }} />
          <h1 style={{
            fontSize: 32,
            fontWeight: 800,
            color: '#f2f6ff',
            margin: 0,
            letterSpacing: '-0.5px'
          }}>
            About MAP2
          </h1>
        </div>
        <p style={{
          fontSize: 13,
          color: '#6b7280',
          margin: '12px 0 0',
          fontWeight: 500
        }}>
          Version information, credits, and system configuration
        </p>
      </header>

      {/* Main Content Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 20,
        marginBottom: 32
      }}>
        {/* Version Info - Top Left */}
        <div style={{
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#3b82f6',
            marginBottom: 16,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            ℹ️ Version Information
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Version</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{versionInfo?.version || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Build Date</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{versionInfo?.build_date || '—'}</div>
            </div>
            {versionInfo?.commit && (
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Commit</div>
                <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#3b82f6', fontWeight: 600 }}>
                  {versionInfo.commit.slice(0, 7)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Links - Top Right */}
        <div style={{
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#22c55e',
            marginBottom: 16,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            🔗 Resources & Links
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {LINKS.map(link => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  background: 'rgba(34, 197, 94, 0.05)',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  borderRadius: 6,
                  color: '#22c55e',
                  textDecoration: 'none',
                  fontSize: 12,
                  fontWeight: 500,
                  transition: 'all 150ms',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.05)'
                  e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.2)'
                }}
              >
                <link.icon size={14} />
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* Core Technologies - Full Width */}
        <div style={{
          gridColumn: 'span 2',
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <SectionHeader title="Core Technologies" icon={<Cpu size={16} weight="duotone" />} color="#f59e0b" />
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 10
          }}>
            {CORE_PROJECTS.map(project => (
              <ProjectCard key={project.name} project={project} />
            ))}
          </div>
        </div>

        {/* Backend Technologies */}
        <div style={{
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(14, 165, 233, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <SectionHeader title="Backend & API" icon={<DesktopTower size={16} weight="duotone" />} color="#0ea5e9" />
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            {BACKEND_PROJECTS.map(project => (
              <ProjectCard key={project.name} project={project} />
            ))}
          </div>
        </div>

        {/* Frontend Technologies */}
        <div style={{
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(97, 219, 251, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <SectionHeader title="Frontend & UI" icon={<Code size={16} weight="duotone" />} color="#60a5fa" />
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            {FRONTEND_PROJECTS.map(project => (
              <ProjectCard key={project.name} project={project} />
            ))}
          </div>
        </div>

        {/* Audio & DSP Libraries - Full Width */}
        <div style={{
          gridColumn: 'span 2',
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(96, 165, 250, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <SectionHeader title="Audio & DSP Libraries" icon={<Headphones size={16} weight="duotone" />} color="#60a5fa" />
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 10
          }}>
            {AUDIO_PROJECTS.map(project => (
              <ProjectCard key={project.name} project={project} />
            ))}
          </div>
        </div>

        {/* Utilities & Tools - Full Width */}
        <div style={{
          gridColumn: 'span 2',
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <SectionHeader title="Utilities & Tools" icon={<Package size={16} weight="duotone" />} color="#22c55e" />
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 10
          }}>
            {UTILITY_PROJECTS.map(project => (
              <ProjectCard key={project.name} project={project} />
            ))}
          </div>
        </div>
      </div>

      {/* Licensing Section */}
      <div style={{
        marginBottom: 32,
        background: 'rgba(15, 20, 35, 0.6)',
        border: '1px solid rgba(96, 165, 250, 0.2)',
        borderRadius: 12,
        padding: 24,
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 20
        }}>
          <Scales size={24} weight="duotone" style={{ color: '#60a5fa' }} />
          <div>
            <h2 style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#f2f6ff',
              margin: 0
            }}>
              Open Source Licenses
            </h2>
            <p style={{
              fontSize: 12,
              color: '#6b7280',
              margin: '4px 0 0'
            }}>
              MAP2 is built on open source software. Here are the licenses used by our dependencies.
            </p>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16
        }}>
          {LICENSES.map(license => (
            <div
              key={license.id}
              style={{
                padding: 16,
                background: 'rgba(10, 15, 25, 0.5)',
                border: `1px solid ${license.color}30`,
                borderRadius: 8
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{
                  padding: '4px 8px',
                  background: `${license.color}20`,
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  color: license.color
                }}>
                  {license.shortName}
                </div>
                <a
                  href={license.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 12,
                    color: license.color,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  {license.name}
                  <ArrowSquareOut size={10} weight="duotone" />
                </a>
              </div>
              <p style={{
                fontSize: 11,
                color: '#a1a1aa',
                lineHeight: '1.5',
                margin: '0 0 12px'
              }}>
                {license.description}
              </p>
              <div style={{ display: 'flex', gap: 16, fontSize: 10 }}>
                <div>
                  <div style={{ color: '#22c55e', fontWeight: 600, marginBottom: 4 }}>Permissions</div>
                  {license.permissions.slice(0, 3).map(p => (
                    <div key={p} style={{ color: '#71717a' }}>+ {p}</div>
                  ))}
                </div>
                <div>
                  <div style={{ color: '#f59e0b', fontWeight: 600, marginBottom: 4 }}>Conditions</div>
                  {license.conditions.slice(0, 3).map(c => (
                    <div key={c} style={{ color: '#71717a' }}>= {c}</div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* MAP2 License Notice */}
        <div style={{
          marginTop: 20,
          padding: 16,
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(96, 165, 250, 0.1) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: 8
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <BookOpen size={16} style={{ color: '#3b82f6' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>MAP2 License</span>
          </div>
          <p style={{
            fontSize: 12,
            color: '#d4d4d8',
            lineHeight: '1.6',
            margin: 0
          }}>
            MAP2 Audio Platform is licensed under the <strong style={{ color: '#22c55e' }}>MIT License</strong>.
            You are free to use, modify, and distribute this software for personal and commercial purposes.
            See the LICENSE file in the repository for full terms. Some components (JUCE framework) may require
            separate licensing for commercial distribution.
          </p>
        </div>
      </div>

      {/* Themes Button */}
      <div style={{
        marginBottom: 32,
        display: 'flex',
        justifyContent: 'center'
      }}>
        <button
          onClick={() => setShowThemeCreator(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            border: '1px solid rgba(96, 165, 250, 0.3)',
            background: 'rgba(96, 165, 250, 0.1)',
            color: '#60a5fa',
            transition: 'all 150ms'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(96, 165, 250, 0.15)'
            e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.5)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(96, 165, 250, 0.1)'
            e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.3)'
          }}
        >
          <Palette size={16} weight="duotone" />
          Themes
        </button>
      </div>


      {/* Theme Creator Dialog */}
      <ThemeCreatorDialog
        isOpen={showThemeCreator}
        onClose={() => setShowThemeCreator(false)}
        onSave={handleSaveTheme}
        currentTheme={currentTheme}
        onThemeChange={handleThemeChange}
        customThemes={customThemes}
        onDeleteCustomTheme={handleDeleteCustomTheme}
        welcomeBanner={welcomeBanner}
        onToggleWelcomeBanner={toggleWelcomeBanner}
        bannerLoading={bannerLoading}
        bootSplash={bootSplash}
        onToggleBootSplash={toggleBootSplash}
        splashLoading={splashLoading}
      />

      {/* Open Source Commitment */}
      <div style={{
        marginBottom: 32,
        background: 'rgba(15, 20, 35, 0.6)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
        borderRadius: 12,
        padding: 24,
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16
        }}>
          <Heart size={24} style={{ color: '#22c55e' }} />
          <h2 style={{
            fontSize: 18,
            fontWeight: 700,
            color: '#f2f6ff',
            margin: 0
          }}>
            Open Source Commitment
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 16
        }}>
          <div style={{
            padding: 16,
            background: 'rgba(10, 15, 25, 0.5)',
            borderRadius: 8,
            border: '1px solid rgba(34, 197, 94, 0.15)'
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#22c55e', marginBottom: 8 }}>
              Community Driven
            </div>
            <p style={{ fontSize: 11, color: '#a1a1aa', lineHeight: '1.5', margin: 0 }}>
              MAP2 is developed with the audio community in mind. Contributions, feedback, and feature requests are welcome.
            </p>
          </div>

          <div style={{
            padding: 16,
            background: 'rgba(10, 15, 25, 0.5)',
            borderRadius: 8,
            border: '1px solid rgba(59, 130, 246, 0.15)'
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6', marginBottom: 8 }}>
              Transparent Development
            </div>
            <p style={{ fontSize: 11, color: '#a1a1aa', lineHeight: '1.5', margin: 0 }}>
              All source code is publicly available. Report bugs, suggest features, or contribute directly via GitHub.
            </p>
          </div>

          <div style={{
            padding: 16,
            background: 'rgba(10, 15, 25, 0.5)',
            borderRadius: 8,
            border: '1px solid rgba(96, 165, 250, 0.15)'
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#60a5fa', marginBottom: 8 }}>
              Built on Giants
            </div>
            <p style={{ fontSize: 11, color: '#a1a1aa', lineHeight: '1.5', margin: 0 }}>
              We stand on the shoulders of incredible open source projects. Thank you to all the developers who make this possible.
            </p>
          </div>

          <div style={{
            padding: 16,
            background: 'rgba(10, 15, 25, 0.5)',
            borderRadius: 8,
            border: '1px solid rgba(245, 158, 11, 0.15)'
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b', marginBottom: 8 }}>
              License Compliance
            </div>
            <p style={{ fontSize: 11, color: '#a1a1aa', lineHeight: '1.5', margin: 0 }}>
              We respect all license requirements and provide proper attribution. Contact us with any licensing questions.
            </p>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div style={{
        padding: 20,
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(96, 165, 250, 0.08) 100%)',
        borderRadius: 12,
        border: '1px solid rgba(59, 130, 246, 0.2)',
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 20
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>
              MAP2 Audio Platform
            </div>
            <p style={{
              fontSize: 12,
              color: '#6b7280',
              lineHeight: '1.6',
              margin: 0,
              maxWidth: 500
            }}>
              Professional audio processing, neural amp modeling, DSP control, and real-time monitoring
              for Linux-based audio workstations. Built with JUCE, FastAPI, and React.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
              Version {versionInfo?.version || '3.1.0'} · {versionInfo?.build_date || 'Feb 2025'}
            </div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>
              Licensed under MIT · Made with ❤️ for musicians
            </div>
          </div>
        </div>
      </div>

      {/* Attribution Section */}
      <div style={{
        marginTop: 32,
        padding: 20,
        background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.08) 0%, rgba(96, 165, 250, 0.08) 100%)',
        borderRadius: 12,
        border: '1px solid rgba(96, 165, 250, 0.2)',
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 20,
          alignItems: 'center'
        }}>
          <div>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#60a5fa',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              ✨ Platform Leadership
            </div>
            <div style={{ fontSize: 12, color: '#d4d4d8', marginBottom: 4 }}>
              <strong style={{ color: '#f2f6ff' }}>Matthew Mackes</strong> — Vibe Scrum Master & AI Taskmaster
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              Buffalo, NY · <a href="mailto:matthewmackes@outlook.com" style={{ color: '#60a5fa', textDecoration: 'none' }}>matthewmackes@outlook.com</a>
            </div>
            <p style={{
              fontSize: 11,
              color: '#6b7280',
              margin: '12px 0 0 0',
              lineHeight: '1.5'
            }}>
              Orchestrating the vision, managing the ecosystem, and ensuring MAP2 delivers professional-grade audio processing with precision and style.
            </p>
          </div>
          <div style={{
            padding: 12,
            background: 'rgba(96, 165, 250, 0.1)',
            borderRadius: 8,
            border: '1px solid rgba(96, 165, 250, 0.2)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>🎵</div>
            <div style={{ fontSize: 10, color: '#60a5fa', fontWeight: 600 }}>PLATFORM</div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>v3.1</div>
          </div>
        </div>
      </div>

      {/* Legal Disclaimer Panel */}
      <div style={{
        marginTop: 32,
        borderRadius: 12,
        border: '1px solid rgba(161, 161, 170, 0.2)',
        background: 'rgba(24, 24, 27, 0.6)',
        backdropFilter: 'blur(8px)',
        overflow: 'hidden'
      }}>
        <button
          onClick={() => setLegalOpen(prev => !prev)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#a1a1aa'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Scales size={16} weight="duotone" style={{ color: '#a1a1aa' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#d4d4d8', letterSpacing: '0.5px' }}>
              LEGAL DISCLAIMER – IMPORTANT NOTICE
            </span>
          </div>
          <CaretDown weight="bold"
            size={16}
            style={{
              transform: legalOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 200ms ease'
            }}
          />
        </button>
        {legalOpen && (
          <div style={{
            padding: '0 20px 20px',
            fontSize: 12,
            color: '#a1a1aa',
            lineHeight: '1.7',
            borderTop: '1px solid rgba(161, 161, 170, 0.1)'
          }}>
            <p style={{ marginTop: 16, color: '#d4d4d8', fontWeight: 600, fontSize: 13 }}>
              This project is a strictly non-commercial, educational, open-source resource created exclusively for learning, teaching, training, academic study, experimentation, demonstration, and personal research purposes.
            </p>

            <h4 style={{ color: '#e4e4e7', marginTop: 20, marginBottom: 8, fontSize: 13 }}>No Affiliation, Endorsement, Sponsorship or Connection of Any Kind</h4>
            <p style={{ margin: '0 0 12px' }}>
              This software, source code, documentation, presets, examples, impulse responses, user interface text, comments, variable/function names, demo files, and any other materials are <strong style={{ color: '#d4d4d8' }}>in no way affiliated with, endorsed by, approved by, sponsored by, officially connected to, or associated with</strong> any commercial manufacturer, brand owner, hardware developer, software developer, plugin creator, or rights holder in the professional audio industry.
            </p>

            <h4 style={{ color: '#e4e4e7', marginTop: 20, marginBottom: 8, fontSize: 13 }}>Trademark, Trade Name, Product Name &amp; Intellectual Property Notice</h4>
            <p style={{ margin: '0 0 12px' }}>
              All trademarks, service marks, trade names, brand names, product names, model designations, logos, slogans, distinctive designs, packaging, software titles, plugin names, and other intellectual property (whether registered or unregistered) that may appear in any form within this project are the <strong style={{ color: '#d4d4d8' }}>exclusive property of their respective owners</strong>.
            </p>
            <p style={{ margin: '0 0 12px' }}>
              This project claims <strong style={{ color: '#d4d4d8' }}>no ownership</strong>, license, permission, authorization, sponsorship, or other right to use any such intellectual property.
            </p>
            <p style={{ margin: '0 0 8px' }}>
              References to any brand, product, model, algorithm name, effect name, hardware unit, software title, or related terminology are made <strong style={{ color: '#d4d4d8' }}>solely for educational, historical, descriptive, comparative, and referential purposes</strong> — including (but not limited to):
            </p>
            <ul style={{ margin: '0 0 12px', paddingLeft: 24 }}>
              <li style={{ marginBottom: 4 }}>identifying well-known audio effects processors, algorithms, or sonic characteristics that are widely discussed in public-domain literature, academic papers, textbooks, tutorials, forums, and engineering communities</li>
              <li style={{ marginBottom: 4 }}>helping learners understand historically significant signal-processing techniques</li>
              <li>facilitating comparison and study of different approaches to reverb, delay, modulation, pitch/time manipulation, dynamics, distortion, filtering, harmonics, spatial effects, and similar audio processing concepts</li>
            </ul>

            <h4 style={{ color: '#e4e4e7', marginTop: 20, marginBottom: 8, fontSize: 13 }}>Legal Basis in the United States</h4>
            <p style={{ margin: '0 0 8px' }}>
              In the United States, limited referential use of trademarks in non-commercial, educational, descriptive, or comparative contexts is often protected under several legal doctrines, including:
            </p>
            <ul style={{ margin: '0 0 12px', paddingLeft: 24, listStyleType: 'none' }}>
              <li style={{ marginBottom: 10 }}>
                <strong style={{ color: '#d4d4d8' }}>Nominative fair use</strong><br />
                <span style={{ fontSize: 11 }}>(New Kids on the Block v. News America Publishing, Inc., 971 F.2d 302 (9th Cir. 1992) and subsequent case law)</span><br />
                → Allows use of a trademark to identify the actual product/service when there is no practical alternative way to refer to it, no suggestion of sponsorship or endorsement, and no more use than reasonably necessary.
              </li>
              <li style={{ marginBottom: 10 }}>
                <strong style={{ color: '#d4d4d8' }}>Descriptive / informational fair use</strong><br />
                → Permits use of a mark descriptively (to describe a characteristic, function, or type of product) rather than as a source identifier, particularly when the use is in good faith and does not create a likelihood of confusion.
              </li>
              <li style={{ marginBottom: 10 }}>
                <strong style={{ color: '#d4d4d8' }}>First Amendment / expressive use</strong><br />
                → Educational commentary, criticism, teaching, scholarship, research, and non-commercial expression receive strong protection under the First Amendment, especially when the use is transformative, non-misleading, and does not compete with the trademark owner's goods or services.
              </li>
              <li style={{ marginBottom: 10 }}>
                <strong style={{ color: '#d4d4d8' }}>Classic / nominative fair use in comparative or referential contexts</strong><br />
                → Commonly accepted in technical documentation, reviews, academic writing, and open-source educational projects when the mark is used only as necessary to refer to the genuine article.
              </li>
            </ul>
            <p style={{ margin: '0 0 12px' }}>
              <strong style={{ color: '#d4d4d8' }}>This project is intentionally designed to fall within these principles</strong>: it is non-commercial, does not compete with any commercial product, makes no false claims of affiliation, and uses references only to the extent necessary for genuine educational purposes.
            </p>

            <h4 style={{ color: '#e4e4e7', marginTop: 20, marginBottom: 8, fontSize: 13 }}>Explicit Restrictions &amp; Prohibitions</h4>
            <p style={{ margin: '0 0 8px' }}>
              This project is <strong style={{ color: '#d4d4d8' }}>expressly NOT intended</strong> for, and you are strictly prohibited from using it (or any derivative thereof) in connection with:
            </p>
            <ul style={{ margin: '0 0 12px', paddingLeft: 24 }}>
              <li style={{ marginBottom: 4 }}>any commercial purpose</li>
              <li style={{ marginBottom: 4 }}>resale, redistribution for profit, or incorporation into any for-profit product</li>
              <li style={{ marginBottom: 4 }}>inclusion in commercial software, plugins, hardware, apps, services, or subscription offerings</li>
              <li style={{ marginBottom: 4 }}>any form of direct or indirect monetization</li>
              <li style={{ marginBottom: 4 }}>retail distribution</li>
              <li>any use that could reasonably suggest sponsorship, endorsement, affiliation, partnership, or licensing by any trademark owner or rights holder</li>
            </ul>

            <h4 style={{ color: '#e4e4e7', marginTop: 20, marginBottom: 8, fontSize: 13 }}>No License or Permission Granted</h4>
            <p style={{ margin: '0 0 12px' }}>
              Nothing contained in this project — including source code, comments, variable names, function names, documentation, presets, impulse responses, demo files, UI text, or any other content — should be construed as granting (explicitly, implicitly, by estoppel, or otherwise) any license, right, permission, or authorization to use any trademark, trade name, product designation, logo, copyrighted material, patented technology, or other intellectual property in a commercial context or in any manner that would suggest source, sponsorship, or endorsement.
            </p>
            <p style={{ margin: '0 0 12px' }}>
              If you intend to use any referenced effect, algorithm, impulse response, sound design technique, branding, product name, or similar element in a <strong style={{ color: '#d4d4d8' }}>commercial product, service, plugin, hardware device, or monetized offering</strong>, you <strong style={{ color: '#d4d4d8' }}>must</strong> obtain all necessary licenses, permissions, and clearances directly from the respective rights holders.
            </p>

            <h4 style={{ color: '#e4e4e7', marginTop: 20, marginBottom: 8, fontSize: 13 }}>No Warranty – Use at Your Own Risk</h4>
            <p style={{ margin: '0 0 12px' }}>
              This project and all associated materials are provided <strong style={{ color: '#d4d4d8' }}>"AS IS"</strong> and <strong style={{ color: '#d4d4d8' }}>"AS AVAILABLE"</strong>, with <strong style={{ color: '#d4d4d8' }}>no warranties</strong> of any kind — express, implied, statutory, or otherwise — including (without limitation) warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, reliability, or uninterrupted operation.
            </p>
            <p style={{ margin: '0 0 12px' }}>
              The authors, contributors, maintainers, and distributors shall not be liable under any legal theory for any damages (direct, indirect, incidental, special, consequential, punitive, or exemplary) arising from the use, misuse, or inability to use this educational resource, even if advised of the possibility of such damage.
            </p>

            <h4 style={{ color: '#e4e4e7', marginTop: 20, marginBottom: 8, fontSize: 13 }}>Your Responsibility</h4>
            <p style={{ margin: '0 0 8px' }}>
              By accessing, studying, compiling, modifying, running, or distributing any part of this project, you acknowledge and agree that you will:
            </p>
            <ol style={{ margin: '0 0 12px', paddingLeft: 24 }}>
              <li style={{ marginBottom: 6 }}>Not represent or imply that this project is official, endorsed, affiliated with, sponsored by, or produced by any commercial brand, manufacturer, or rights holder</li>
              <li style={{ marginBottom: 6 }}>Not use any referenced marks in a manner likely to cause confusion, mistake, or deception as to source, sponsorship, or affiliation</li>
              <li style={{ marginBottom: 6 }}>Comply with all applicable trademark, copyright, unfair competition, and intellectual property laws in your jurisdiction</li>
              <li>Refrain from creating or distributing derivative works for commercial purposes that prominently feature protected brand names, model designations, logos, or other indicia without express written permission from the rights holders</li>
            </ol>

            <p style={{ margin: '16px 0 8px', color: '#d4d4d8', fontStyle: 'italic', fontSize: 12 }}>
              We respectfully ask all users to honor the intellectual property rights of the many talented engineers, designers, and companies that have advanced the field of audio signal processing.
            </p>
            <p style={{ margin: '0 0 0', color: '#d4d4d8', fontStyle: 'italic', fontSize: 12 }}>
              Thank you for using this educational resource responsibly.
            </p>
            <p style={{ margin: '12px 0 0', color: '#71717a', fontSize: 11 }}>
              Last updated: 2026
            </p>
          </div>
        )}
      </div>

      {/* Help Me Find Hardware! Section */}
      <div style={{
        marginTop: 32,
        padding: 24,
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(34, 197, 94, 0.08) 100%)',
        borderRadius: 12,
        border: '1px solid rgba(59, 130, 246, 0.2)',
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 20
        }}>
          <Headphones size={24} style={{ color: '#3b82f6' }} />
          <h2 style={{
            fontSize: 18,
            fontWeight: 700,
            color: '#f2f6ff',
            margin: 0
          }}>
            Help Me Find Hardware!
          </h2>
        </div>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 16
        }}>
          {/* Button 1: CPU Performance */}
          <NavLink
            to="/cpu-performance"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 20,
              background: 'linear-gradient(135deg, rgba(0, 102, 255, 0.1), rgba(59, 130, 246, 0.1))',
              borderRadius: 8,
              border: '1px solid rgba(59, 130, 246, 0.3)',
              textDecoration: 'none',
              transition: 'all 200ms',
              cursor: 'pointer'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(59, 130, 246, 0.2)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <Cpu size={32} style={{ color: '#3b82f6', marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f2f6ff', textAlign: 'center', marginBottom: 4 }}>
              CPU Performance Guide
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.4 }}>
              Compare Intel generations & capacity
            </div>
          </NavLink>

          {/* Button 2: Multi Channel ADAT Is Magic */}
          <NavLink
            to="/motu-rme"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 20,
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(34, 197, 94, 0.1))',
              borderRadius: 8,
              border: '1px solid rgba(37, 99, 235, 0.3)',
              textDecoration: 'none',
              transition: 'all 200ms',
              cursor: 'pointer'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(37, 99, 235, 0.2)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <Stack size={32} style={{ color: '#2563eb', marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f2f6ff', textAlign: 'center', marginBottom: 4 }}>
              Multi Channel ADAT Is Magic
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.4 }}>
              MOTU + RME ADAT monitoring
            </div>
          </NavLink>

          {/* Button 3: Find a Pro Interface */}
          <button
            onClick={() => setShowShoppingDialog(true)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 20,
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(245, 158, 11, 0.1))',
              borderRadius: 8,
              border: '1px solid rgba(34, 197, 94, 0.3)',
              cursor: 'pointer',
              transition: 'all 200ms'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(34, 197, 94, 0.2)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <Package size={32} style={{ color: '#22c55e', marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f2f6ff', textAlign: 'center', marginBottom: 4 }}>
              Find a Pro Interface
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.4 }}>
              Search eBay, Reverb & ShopGoodwill
            </div>
          </button>

          {/* Button 4: Does CPU Matter */}
          <NavLink
            to="/cpu-performance"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 20,
              background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.1), rgba(96, 165, 250, 0.1))',
              borderRadius: 8,
              border: '1px solid rgba(96, 165, 250, 0.3)',
              textDecoration: 'none',
              transition: 'all 200ms',
              cursor: 'pointer'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(96, 165, 250, 0.2)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <TrendUp size={32} weight="duotone" style={{ color: '#60a5fa', marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f2f6ff', textAlign: 'center', marginBottom: 4 }}>
              Does CPU Matter?
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.4 }}>
              Performance gains by generation
            </div>
          </NavLink>
        </div>
      </div>

      {/* Advanced Settings Menu (hic sunt dracones) - Bottom Button */}
      <div style={{
        marginTop: 32,
        display: 'flex',
        justifyContent: 'center'
      }}>
        {isPageLoaded ? (
        <MenuProvider>
          <MenuButton
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              background: 'rgba(220, 38, 38, 0.05)',
              color: '#dc2626',
              transition: 'all 150ms'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)'
              e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.5)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(220, 38, 38, 0.05)'
              e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.3)'
            }}
            title="Advanced settings & configuration"
          >
            <DragonIcon size={16} />
            <span>hic sunt dracones</span>
            <CaretDown weight="bold" size={14} />
          </MenuButton>
          <Menu className="menu" gutter={8} style={{ minWidth: 260 }}>
            {advancedMenuItems.map((item) => (
              <div key={item.to}>
                {item.dividerBefore && (
                  <>
                    <div style={{
                      height: '1px',
                      background: 'var(--border)',
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
                <MenuItem
                  className="menu-item"
                  render={<NavLink to={item.to} />}
                >
                  <item.icon size={16} style={{ color: item.color, flexShrink: 0 }} />
                  <div className="menu-item-content">
                    <span className="menu-item-label">{item.label}</span>
                    <span className="menu-item-desc">{item.description}</span>
                  </div>
                </MenuItem>
              </div>
            ))}
            {rateLimiting && (
              <>
                <div style={{
                  height: '1px',
                  background: 'var(--border)',
                  margin: '8px 0'
                }} />
                <MenuItem
                  className="menu-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    cursor: rateLimitingLoading ? 'wait' : 'pointer',
                    opacity: rateLimitingLoading ? 0.7 : 1
                  }}
                  onClick={() => { void toggleRateLimiting() }}
                  disabled={rateLimitingLoading}
                >
                  <span style={{ fontSize: 12, fontWeight: 500 }}>🛡️ Rate Limiting</span>
                  <input
                    type="checkbox"
                    checked={rateLimiting.enabled}
                    readOnly
                    style={{
                      cursor: rateLimitingLoading ? 'wait' : 'pointer',
                      width: 16,
                      height: 16
                    }}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void toggleRateLimiting()
                    }}
                  />
                </MenuItem>
              </>
            )}
            {specialSettings !== null && (
              <>
                <div style={{
                  height: '1px',
                  background: 'var(--border)',
                  margin: '8px 0'
                }} />
                <MenuItem
                  className="menu-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    cursor: specialSettingsLoading || specialActionLoading ? 'wait' : 'pointer',
                    opacity: specialSettingsLoading || specialActionLoading ? 0.7 : 1,
                  }}
                  onClick={() => { void handleSpecialClick() }}
                  disabled={specialSettingsLoading || specialActionLoading}
                >
                  <span style={{ fontSize: 12, fontWeight: 500 }}>✨ Special</span>
                  <input
                    type="checkbox"
                    checked={specialSettings.enabled}
                    readOnly
                    style={{
                      cursor: specialSettingsLoading || specialActionLoading ? 'wait' : 'pointer',
                      width: 16,
                      height: 16
                    }}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void handleSpecialClick()
                    }}
                  />
                </MenuItem>
                {specialSettings.enabled && (
                  <MenuItem
                    className="menu-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 16px',
                    }}
                    onClick={openSpecialSettings}
                  >
                    <Sliders size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 500 }}>Configure Special Mode</span>
                  </MenuItem>
                )}
              </>
            )}
          </Menu>
        </MenuProvider>
        ) : (
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              border: '1px solid rgba(220, 38, 38, 0.3)',
              background: 'rgba(220, 38, 38, 0.05)',
              color: '#dc2626',
              opacity: 0.7,
              cursor: 'wait'
            }}
            disabled
            aria-label="Loading advanced settings menu"
          >
            <DragonIcon size={16} />
            <span>hic sunt dracones</span>
            <CaretDown weight="bold" size={14} />
          </button>
        )}
      </div>

      {/* Password Dialog */}
      <PasswordDialog
        isOpen={showPasswordDialog}
        onClose={() => setShowPasswordDialog(false)}
        onSuccess={handlePasswordSuccess}
      />

      {/* Special Settings Dialog */}
      <SpecialSettingsDialog
        isOpen={showSpecialSettings}
        onClose={() => setShowSpecialSettings(false)}
        onSave={handleSettingsSave}
      />

      {/* Shopping Search Dialog */}
      <ShoppingSearchDialog
        open={showShoppingDialog}
        onClose={() => setShowShoppingDialog(false)}
      />
    </div>
  )
}
