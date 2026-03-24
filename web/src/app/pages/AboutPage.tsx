import {
  Accessibility,
  Application,
  BareMetalServer,
  ChartLine,
  Chip,
  Code,
  CodeReference,
  Cube,
  DataBase,
  Flow,
  Globe,
  Headphones,
  Information,
  Launch,
  Lightning,
  LogoGithub,
  Music,
  Package,
  PaintBrush,
  Scales,
  Security,
  Terminal,
  UserFavorite,
} from '@carbon/icons-react'
import {
  DataTable,
  Layer,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  Tag,
} from '@carbon/react'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ShoppingSearchDialog } from '../components/ShoppingSearchDialog'
import { MapAmplifierIcon, MapSignalFlowIcon } from '../components/icons/map'
import {
  MAP2_PLATFORM_BUILD_DATE,
  MAP2_PLATFORM_BUILD_TIME,
  MAP2_PLATFORM_VERSION,
} from '../components/branding/map2Branding'
import { PlatformInfoGuideSection } from './PlatformInfoGuideSection'
import './AboutPage.css'

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
    icon: <MapSignalFlowIcon size={20} />,
    role: 'Audio Engine',
    license: 'GPLv3 / Commercial',
  },
  {
    name: 'Neural Amp Modeler',
    description: 'Deep learning technology for modeling guitar amplifiers, pedals, and signal chains using WaveNet architecture',
    website: 'https://www.neuralampmodeler.com/',
    color: '#60a5fa',
    icon: <MapAmplifierIcon size={20} />,
    role: 'AI Amp Modeling',
    license: 'MIT',
  },
  {
    name: 'LV2',
    description: 'Extensible open standard audio plugin format specification for cross-DAW plugin compatibility',
    website: 'https://lv2plug.in/',
    color: '#059669',
    icon: <Chip size={20} />,
    role: 'Plugin Format',
    license: 'ISC',
  },
  {
    name: 'Fedora PREEMPT_RT',
    description: 'Fedora Linux distribution with real-time kernel support for deterministic low-latency performance',
    website: 'https://fedoraproject.org/',
    color: '#0b57a4',
    icon: <BareMetalServer size={20} />,
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
    icon: <Application size={20} />,
    role: 'Backend API',
    license: 'MIT',
  },
  {
    name: 'Uvicorn',
    description: 'Lightning-fast ASGI server implementation using uvloop and httptools',
    website: 'https://www.uvicorn.org/',
    color: '#2dd4bf',
    icon: <Application size={20} />,
    role: 'ASGI Server',
    license: 'BSD-3-Clause',
  },
  {
    name: 'SQLAlchemy',
    description: 'Python SQL toolkit and Object-Relational Mapping library for database interactions',
    website: 'https://www.sqlalchemy.org/',
    color: '#dc2626',
    icon: <DataBase size={20} />,
    role: 'Database ORM',
    license: 'MIT',
  },
  {
    name: 'Pydantic',
    description: 'Data validation and settings management using Python type annotations',
    website: 'https://docs.pydantic.dev/',
    color: '#e91e63',
    icon: <Security size={20} />,
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
    icon: <Code size={20} />,
    role: 'UI Framework',
    license: 'MIT',
  },
  {
    name: 'Vite',
    description: 'Next-generation frontend tooling with instant server start and lightning-fast HMR',
    website: 'https://vitejs.dev/',
    color: '#646cff',
    icon: <Lightning size={20} />,
    role: 'Build Tool',
    license: 'MIT',
  },
  {
    name: 'TypeScript',
    description: 'Strongly typed programming language that builds on JavaScript with type safety',
    website: 'https://www.typescriptlang.org/',
    color: '#3178c6',
    icon: <CodeReference size={20} />,
    role: 'Type System',
    license: 'Apache-2.0',
  },
  {
    name: 'Carbon Design System',
    description: 'IBM\'s open-source design system for products and digital experiences, with React component library',
    website: 'https://carbondesignsystem.com/',
    color: '#0f62fe',
    icon: <PaintBrush size={20} />,
    role: 'UI Components',
    license: 'Apache-2.0',
  },
  {
    name: 'React Flow',
    description: 'Highly customizable library for building node-based editors and interactive diagrams',
    website: 'https://reactflow.dev/',
    color: '#60a5fa',
    icon: <Flow size={20} />,
    role: 'Flow Editor',
    license: 'MIT',
  },
]

// Audio & DSP libraries
const AUDIO_PROJECTS: ProjectCredit[] = [
  {
    name: 'Eigen',
    description: 'C++ template library for linear algebra: matrices, vectors, numerical solvers',
    website: 'https://eigen.tuxfamily.org/',
    color: '#1f77b4',
    icon: <Cube size={20} />,
    role: 'Linear Algebra',
    license: 'MPL-2.0',
  },
  {
    name: 'lilv',
    description: 'C library to discover, load, and run LV2 plugins with RDF-based metadata',
    website: 'https://drobilla.net/software/lilv.html',
    color: '#22c55e',
    icon: <Package size={20} />,
    role: 'Plugin Discovery',
    license: 'ISC',
  },
  {
    name: 'PyTorch',
    description: 'Open source machine learning framework for neural network training and inference',
    website: 'https://pytorch.org/',
    color: '#ee4c2c',
    icon: <Lightning size={20} />,
    role: 'ML Framework',
    license: 'BSD-3-Clause',
  },
  {
    name: 'NumPy',
    description: 'Fundamental package for scientific computing with Python arrays and matrices',
    website: 'https://numpy.org/',
    color: '#013243',
    icon: <Terminal size={20} />,
    role: 'Numerical Computing',
    license: 'BSD-3-Clause',
  },
  {
    name: 'SciPy',
    description: 'Python library for scientific and technical computing with signal processing',
    website: 'https://scipy.org/',
    color: '#8caae6',
    icon: <ChartLine size={20} />,
    role: 'Signal Processing',
    license: 'BSD-3-Clause',
  },
  {
    name: 'python-rtmidi',
    description: 'Python bindings for RtMidi providing cross-platform real-time MIDI I/O',
    website: 'https://github.com/SpotlightKid/python-rtmidi',
    color: '#60a5fa',
    icon: <Music size={20} />,
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
    icon: <CodeReference size={20} />,
    role: 'JSON Parser (C++)',
    license: 'MIT',
  },
  {
    name: 'pybind11',
    description: 'Seamless operability between C++11 and Python for creating bindings',
    website: 'https://pybind11.readthedocs.io/',
    color: '#306998',
    icon: <Code size={20} />,
    role: 'Python Bindings',
    license: 'BSD-3-Clause',
  },
  {
    name: 'TanStack Query',
    description: 'Powerful asynchronous state management for data fetching and caching',
    website: 'https://tanstack.com/query',
    color: '#60a5fa',
    icon: <DataBase size={20} />,
    role: 'Data Fetching',
    license: 'MIT',
  },
  {
    name: 'React Router',
    description: 'Declarative routing library for React applications with nested routes',
    website: 'https://reactrouter.com/',
    color: '#ca4245',
    icon: <Globe size={20} />,
    role: 'Routing',
    license: 'MIT',
  },
  {
    name: 'Recharts',
    description: 'Composable charting library built on React components for data visualization',
    website: 'https://recharts.org/',
    color: '#60a5fa',
    icon: <ChartLine size={20} />,
    role: 'Charts',
    license: 'MIT',
  },
  {
    name: 'Ariakit',
    description: 'Accessible React component library with unstyled, primitive components',
    website: 'https://ariakit.org/',
    color: '#007acc',
    icon: <Accessibility size={20} />,
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
  {
    id: 'agpl3',
    name: 'GNU Affero General Public License v3.0',
    shortName: 'AGPL-3.0',
    color: '#a78bfa',
    url: 'https://www.gnu.org/licenses/agpl-3.0.html',
    description: 'Strong copyleft license that extends GPL to cover networked use, requiring source disclosure for all users who interact with the software over a network.',
    permissions: ['Commercial use', 'Modification', 'Distribution', 'Patent use', 'Private use'],
    conditions: ['License and copyright notice', 'State changes', 'Disclose source', 'Same license', 'Network use disclosure'],
    limitations: ['Liability', 'Warranty'],
  },
]

const LINKS = [
  { label: 'GitHub', url: 'https://github.com/matthewmackes/map2-audio', icon: LogoGithub },
  { label: 'JUCE', url: 'https://juce.com', icon: Launch },
  { label: 'NAM', url: 'https://www.neuralampmodeler.com', icon: Launch },
  { label: 'LV2', url: 'https://lv2plug.in', icon: Launch },
  { label: 'FastAPI', url: 'https://fastapi.tiangolo.com', icon: Launch },
  { label: 'React', url: 'https://react.dev', icon: Launch },
]

// ── Table definitions ──────────────────────────────────────────────────────────

const VERSION_HEADERS = [
  { key: 'field', header: 'Field' },
  { key: 'value', header: 'Value' },
]

const TECH_HEADERS = [
  { key: 'name',        header: 'Name' },
  { key: 'category',    header: 'Category' },
  { key: 'role',        header: 'Role' },
  { key: 'license',     header: 'License' },
  { key: 'description', header: 'Description' },
]

const LICENSE_HEADERS = [
  { key: 'shortName',   header: 'License' },
  { key: 'description', header: 'Summary' },
  { key: 'permissions', header: 'Permissions' },
  { key: 'conditions',  header: 'Conditions' },
]

const LINKS_HEADERS = [
  { key: 'label', header: 'Resource' },
  { key: 'url',   header: 'URL' },
]

const CREDITS_HEADERS = [
  { key: 'role',    header: 'Role' },
  { key: 'person',  header: 'Person' },
  { key: 'contact', header: 'Contact' },
  { key: 'note',    header: 'Note' },
]

const LICENSE_URL_MAP: Record<string, string> = Object.fromEntries(
  LICENSES.map((l) => [l.id, l.url]),
)

const TECH_WEBSITE_MAP: Record<string, string> = Object.fromEntries(
  [...CORE_PROJECTS, ...BACKEND_PROJECTS, ...FRONTEND_PROJECTS, ...AUDIO_PROJECTS, ...UTILITY_PROJECTS].map(
    (p) => [p.name, p.website],
  ),
)

// ── Component ─────────────────────────────────────────────────────────────────

export function AboutPage() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [welcomeBanner, setWelcomeBanner] = useState<WelcomeBannerStatus | null>(null)
  const [bannerLoading, setBannerLoading] = useState(false)
  const [bootSplash, setBootSplash] = useState<BootSplashStatus | null>(null)
  const [splashLoading, setSplashLoading] = useState(false)
  const [showShoppingDialog, setShowShoppingDialog] = useState(false)

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then(setVersionInfo)
      .catch(() =>
        setVersionInfo({
          version: MAP2_PLATFORM_VERSION,
          build_date: `${MAP2_PLATFORM_BUILD_DATE}${MAP2_PLATFORM_BUILD_TIME ? ` ${MAP2_PLATFORM_BUILD_TIME}` : ''}`.trim(),
        }),
      )

    fetch('/api/system/welcome-banner')
      .then(r => r.json())
      .then(setWelcomeBanner)
      .catch(() => setWelcomeBanner({ installed: false }))

    fetch('/api/system/boot-splash')
      .then(r => r.json())
      .then(setBootSplash)
      .catch(() => setBootSplash({ installed: false }))
  }, [])

  const toggleWelcomeBanner = async () => {
    if (!welcomeBanner || bannerLoading) return
    setBannerLoading(true)
    try {
      const response = await fetch(`/api/system/welcome-banner?install=${!welcomeBanner.installed}`, { method: 'POST' })
      const result = await response.json()
      if (result.success) setWelcomeBanner({ installed: result.installed })
    } catch {
      // silent
    } finally {
      setBannerLoading(false)
    }
  }

  const toggleBootSplash = async () => {
    if (!bootSplash || splashLoading) return
    setSplashLoading(true)
    try {
      const response = await fetch(`/api/system/boot-splash?install=${!bootSplash.installed}`, { method: 'POST' })
      const result = await response.json()
      if (result.success) setBootSplash({ ...bootSplash, installed: result.installed })
    } catch {
      // silent
    } finally {
      setSplashLoading(false)
    }
  }


  // ── Table row data (computed) ────────────────────────────────────────────────

  const versionRows = [
    { id: 'version',    field: 'Version',    value: versionInfo?.version    ?? MAP2_PLATFORM_VERSION },
    { id: 'build_date', field: 'Build Date', value: versionInfo?.build_date ?? MAP2_PLATFORM_BUILD_DATE },
    { id: 'commit',     field: 'Commit',     value: versionInfo?.commit     ? versionInfo.commit.slice(0, 7) : '—' },
    { id: 'license',    field: 'License',    value: 'AGPL-3.0-only (MAP2-owned code)' },
  ]

  const techRows = [
    ...CORE_PROJECTS.map((p, i)     => ({ id: `core-${i}`,     category: 'Core',       name: p.name, role: p.role, license: p.license, description: p.description })),
    ...BACKEND_PROJECTS.map((p, i)  => ({ id: `backend-${i}`,  category: 'Backend',    name: p.name, role: p.role, license: p.license, description: p.description })),
    ...FRONTEND_PROJECTS.map((p, i) => ({ id: `frontend-${i}`, category: 'Frontend',   name: p.name, role: p.role, license: p.license, description: p.description })),
    ...AUDIO_PROJECTS.map((p, i)    => ({ id: `audio-${i}`,    category: 'Audio DSP',  name: p.name, role: p.role, license: p.license, description: p.description })),
    ...UTILITY_PROJECTS.map((p, i)  => ({ id: `util-${i}`,     category: 'Utilities',  name: p.name, role: p.role, license: p.license, description: p.description })),
  ]

  const licenseRows = LICENSES.map((lic) => ({
    id:          lic.id,
    shortName:   lic.shortName,
    description: lic.description,
    permissions: lic.permissions.join(' · '),
    conditions:  lic.conditions.join(' · '),
  }))

  const linkRows = LINKS.map((l, i) => ({
    id:    `link-${i}`,
    label: l.label,
    url:   l.url,
  }))

  const creditRows = [
    {
      id:      'lead',
      role:    'Platform Leadership',
      person:  'Matthew Mackes',
      contact: 'matthewmackes@outlook.com',
      note:    'Vibe Scrum Master & AI Taskmaster · Buffalo, NY',
    },
  ]

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <section className="about-page">
      <Layer className="about-page__surface">
        {/* ── Legal Disclaimer ────────────────────────────────────────────── */}
        <section
          aria-label="Legal disclaimer"
          style={{
            marginBottom: 32,
            paddingBottom: 20,
            borderBottom: '1px solid var(--cds-border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Scales size={16} style={{ color: 'var(--cds-link-primary)', flexShrink: 0 }} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--cds-text-primary)' }}>
              Legal Disclaimer — Important Notice
            </h2>
          </div>

          <p style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 13 }}>
            MAP2 is maintained as an educational and research-focused project for learning, teaching, experimentation, and technical study in real-time audio systems.
          </p>

          <div
            style={{
              marginBottom: 16,
              padding: 16,
              background: 'var(--cds-layer-01)',
              border: '1px solid var(--cds-border-subtle)',
              borderRadius: 4,
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--cds-text-primary)' }}>
              GNU Affero General Public License v3.0 (AGPL-3.0-only)
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--cds-text-secondary)' }}>
              MAP2-owned code in this repository is licensed under the <strong>GNU Affero General Public License v3.0 (AGPL-3.0-only)</strong>. Educational intent statements describe project goals and do not add restrictions beyond AGPLv3.
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--cds-text-secondary)' }}>
              Source availability path for MAP2-owned code is this repository. Modified networked deployments should provide corresponding source in an accessible location for their users.
            </p>
          </div>

          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--cds-text-secondary)' }}>
            Third-party components remain under their original licenses and are not relicensed by MAP2.
          </p>

          <h3 style={{ marginTop: 20, marginBottom: 6, fontSize: 13 }}>No Affiliation or Endorsement</h3>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--cds-text-secondary)' }}>
            This software, source code, documentation, presets, examples, impulse responses, UI text, comments, demo files, and related materials are{' '}
            <strong>not affiliated with, endorsed by, sponsored by, or officially connected to</strong> any commercial manufacturer, brand owner, hardware developer, software developer, plugin creator, or rights holder.
          </p>

          <h3 style={{ marginTop: 20, marginBottom: 6, fontSize: 13 }}>Trademarks and Product Names</h3>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--cds-text-secondary)' }}>
            All trademarks, service marks, trade names, brand names, product names, model designations, logos, and related intellectual property are the{' '}
            <strong>property of their respective owners</strong>. References are used for educational, historical, descriptive, comparative, referential, and interoperability purposes only. No trademark rights are granted by this repository license, documentation, or code.
          </p>

          <h3 style={{ marginTop: 20, marginBottom: 6, fontSize: 13 }}>No Warranty</h3>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--cds-text-secondary)' }}>
            This project and all associated materials are provided <strong>"AS IS"</strong> and <strong>"AS AVAILABLE"</strong>, without warranties of any kind, including merchantability, fitness for a particular purpose, and non-infringement.
          </p>

          <h3 style={{ marginTop: 20, marginBottom: 6, fontSize: 13 }}>Your Responsibility</h3>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--cds-text-secondary)' }}>
            By accessing, studying, modifying, running, or distributing any part of this project, you acknowledge and agree that you will:
          </p>
          <ol style={{ margin: '0 0 12px', paddingLeft: 24, fontSize: 12, color: 'var(--cds-text-secondary)' }}>
            <li style={{ marginBottom: 4 }}>Comply with AGPLv3 requirements for MAP2-owned code.</li>
            <li style={{ marginBottom: 4 }}>Comply with all applicable third-party licenses for included dependencies.</li>
            <li style={{ marginBottom: 4 }}>Avoid representing this project as officially affiliated with third-party brands or products.</li>
            <li>Comply with applicable trademark, copyright, and other IP laws in your jurisdiction.</li>
          </ol>

          <p style={{ margin: '12px 0 4px', fontStyle: 'italic', fontSize: 12, color: 'var(--cds-text-secondary)' }}>
            This project continues to prioritize education, transparency, and respectful attribution.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--cds-text-placeholder)' }}>
            Last updated: 2026-02-22
          </p>
        </section>

        {/* Page header */}
        <header style={{ marginBottom: 32, paddingBottom: 20, borderBottom: '1px solid var(--cds-border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Information size={28} style={{ color: 'var(--cds-link-primary)', flexShrink: 0 }} />
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--cds-text-primary)', margin: 0 }}>
              MAP2 Platform Guide
            </h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--cds-text-secondary)', margin: '8px 0 0' }}>
            Orientation, documentation, build identity, and support context in one canonical information surface
          </p>
        </header>

        {/* Guide section — documentation library */}
        <PlatformInfoGuideSection />

        {/* ── Version Information ─────────────────────────────────────────── */}
        <DataTable rows={versionRows} headers={VERSION_HEADERS} useZebraStyles>
          {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
            <TableContainer
              {...getTableContainerProps()}
              title="Platform version"
              description="Build identity and license for the running MAP2 instance."
              style={{ marginBottom: 24 }}
            >
              <Table {...getTableProps()} aria-label="Platform version table">
                <TableHead>
                  <TableRow>
                    {headers.map((header) => {
                      const { key: _k, ...hProps } = getHeaderProps({ header })
                      return (
                        <TableHeader key={header.key} {...hProps}>
                          {header.header}
                        </TableHeader>
                      )
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const { key: _k, ...rProps } = getRowProps({ row })
                    return (
                      <TableRow key={row.id} {...rProps}>
                        {row.cells.map((cell) => (
                          <TableCell key={cell.id}>
                            {cell.info.header === 'field' ? (
                              <strong>{String(cell.value)}</strong>
                            ) : cell.info.header === 'value' && row.id === 'commit' && cell.value !== '—' ? (
                              <code style={{ fontFamily: 'var(--cds-code-01-font-family, monospace)', color: 'var(--cds-link-primary)' }}>
                                {String(cell.value)}
                              </code>
                            ) : (
                              String(cell.value)
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>

        {/* ── Technology Stack ────────────────────────────────────────────── */}
        <DataTable rows={techRows} headers={TECH_HEADERS} isSortable useZebraStyles>
          {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
            <TableContainer
              {...getTableContainerProps()}
              title="Technology stack"
              description={`${techRows.length} open-source components across Core, Backend, Frontend, Audio DSP, and Utilities.`}
              style={{ marginBottom: 24 }}
            >
              <TableToolbar {...getToolbarProps()}>
                <TableToolbarContent>
                  <Tag type="cool-gray" size="sm" style={{ margin: '0 8px' }}>
                    {techRows.length} dependencies
                  </Tag>
                </TableToolbarContent>
              </TableToolbar>
              <Table {...getTableProps()} aria-label="Technology stack table">
                <TableHead>
                  <TableRow>
                    {headers.map((header) => {
                      const { key: _k, ...hProps } = getHeaderProps({ header })
                      return (
                        <TableHeader key={header.key} {...hProps}>
                          {header.header}
                        </TableHeader>
                      )
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const { key: _k, ...rProps } = getRowProps({ row })
                    return (
                      <TableRow key={row.id} {...rProps}>
                        {row.cells.map((cell) => {
                          if (cell.info.header === 'name') {
                            const website = TECH_WEBSITE_MAP[String(cell.value)]
                            return (
                              <TableCell key={cell.id}>
                                <a
                                  href={website}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: 'var(--cds-link-primary)', textDecoration: 'none', fontWeight: 500 }}
                                >
                                  {String(cell.value)}
                                </a>
                              </TableCell>
                            )
                          }
                          if (cell.info.header === 'license') {
                            return (
                              <TableCell key={cell.id}>
                                <Tag type="cool-gray" size="sm">{String(cell.value)}</Tag>
                              </TableCell>
                            )
                          }
                          if (cell.info.header === 'description') {
                            return (
                              <TableCell key={cell.id}>
                                <span
                                  title={String(cell.value)}
                                  style={{
                                    display: 'block',
                                    maxWidth: 360,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    color: 'var(--cds-text-secondary)',
                                    fontSize: 12,
                                  }}
                                >
                                  {String(cell.value)}
                                </span>
                              </TableCell>
                            )
                          }
                          if (cell.info.header === 'category') {
                            return (
                              <TableCell key={cell.id}>
                                <Tag type="blue" size="sm">{String(cell.value)}</Tag>
                              </TableCell>
                            )
                          }
                          return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                        })}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>

        {/* ── Open Source Licenses ────────────────────────────────────────── */}
        <DataTable rows={licenseRows} headers={LICENSE_HEADERS} isSortable useZebraStyles>
          {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
            <TableContainer
              {...getTableContainerProps()}
              title="Open source licenses"
              description="Licenses used by MAP2 and its dependencies. MAP2-owned code: AGPL-3.0-only."
              style={{ marginBottom: 24 }}
            >
              <Table {...getTableProps()} aria-label="Open source licenses table">
                <TableHead>
                  <TableRow>
                    {headers.map((header) => {
                      const { key: _k, ...hProps } = getHeaderProps({ header })
                      return (
                        <TableHeader key={header.key} {...hProps}>
                          {header.header}
                        </TableHeader>
                      )
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const { key: _k, ...rProps } = getRowProps({ row })
                    return (
                      <TableRow key={row.id} {...rProps}>
                        {row.cells.map((cell) => {
                          if (cell.info.header === 'shortName') {
                            const url = LICENSE_URL_MAP[row.id]
                            return (
                              <TableCell key={cell.id}>
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: 'var(--cds-link-primary)', textDecoration: 'none', fontWeight: 600 }}
                                >
                                  {String(cell.value)}
                                </a>
                              </TableCell>
                            )
                          }
                          if (cell.info.header === 'description') {
                            return (
                              <TableCell key={cell.id}>
                                <span
                                  title={String(cell.value)}
                                  style={{
                                    display: 'block',
                                    maxWidth: 300,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    color: 'var(--cds-text-secondary)',
                                    fontSize: 12,
                                  }}
                                >
                                  {String(cell.value)}
                                </span>
                              </TableCell>
                            )
                          }
                          return (
                            <TableCell key={cell.id}>
                              <span style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
                                {String(cell.value)}
                              </span>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>

        {/* ── Resources & Links ───────────────────────────────────────────── */}
        <DataTable rows={linkRows} headers={LINKS_HEADERS} useZebraStyles>
          {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
            <TableContainer
              {...getTableContainerProps()}
              title="Resources & links"
              style={{ marginBottom: 24 }}
            >
              <Table {...getTableProps()} aria-label="Resources and links table">
                <TableHead>
                  <TableRow>
                    {headers.map((header) => {
                      const { key: _k, ...hProps } = getHeaderProps({ header })
                      return (
                        <TableHeader key={header.key} {...hProps}>
                          {header.header}
                        </TableHeader>
                      )
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const { key: _k, ...rProps } = getRowProps({ row })
                    return (
                      <TableRow key={row.id} {...rProps}>
                        {row.cells.map((cell) => {
                          if (cell.info.header === 'url') {
                            return (
                              <TableCell key={cell.id}>
                                <a
                                  href={String(cell.value)}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    color: 'var(--cds-link-primary)',
                                    fontSize: 12,
                                    textDecoration: 'none',
                                  }}
                                >
                                  {String(cell.value)}
                                  <Launch size={12} />
                                </a>
                              </TableCell>
                            )
                          }
                          return <TableCell key={cell.id}><strong>{String(cell.value)}</strong></TableCell>
                        })}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>

        {/* ── Platform Credits ────────────────────────────────────────────── */}
        <DataTable rows={creditRows} headers={CREDITS_HEADERS} useZebraStyles>
          {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
            <TableContainer
              {...getTableContainerProps()}
              title="Platform credits"
              style={{ marginBottom: 24 }}
            >
              <Table {...getTableProps()} aria-label="Platform credits table">
                <TableHead>
                  <TableRow>
                    {headers.map((header) => {
                      const { key: _k, ...hProps } = getHeaderProps({ header })
                      return (
                        <TableHeader key={header.key} {...hProps}>
                          {header.header}
                        </TableHeader>
                      )
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const { key: _k, ...rProps } = getRowProps({ row })
                    return (
                      <TableRow key={row.id} {...rProps}>
                        {row.cells.map((cell) => {
                          if (cell.info.header === 'contact') {
                            return (
                              <TableCell key={cell.id}>
                                <a
                                  href={`mailto:${String(cell.value)}`}
                                  style={{ color: 'var(--cds-link-primary)', textDecoration: 'none', fontSize: 12 }}
                                >
                                  {String(cell.value)}
                                </a>
                              </TableCell>
                            )
                          }
                          if (cell.info.header === 'person') {
                            return (
                              <TableCell key={cell.id}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <UserFavorite size={16} style={{ color: 'var(--cds-link-primary)', flexShrink: 0 }} />
                                  <strong>{String(cell.value)}</strong>
                                </div>
                              </TableCell>
                            )
                          }
                          return (
                            <TableCell key={cell.id}>
                              <span style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
                                {String(cell.value)}
                              </span>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>

        {/* ── Help Me Find Hardware ────────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: '1px solid var(--cds-border-subtle)',
            }}
          >
            <Headphones size={20} style={{ color: 'var(--cds-link-primary)' }} />
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--cds-text-primary)' }}>
              Help Me Find Hardware
            </h2>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
            }}
          >
            <NavLink
              to="/cpu-performance"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 20,
                background: 'var(--cds-layer)',
                border: '1px solid var(--cds-border-subtle)',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <Chip size={28} style={{ color: 'var(--cds-link-primary)', marginBottom: 10 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cds-text-primary)', textAlign: 'center', marginBottom: 4 }}>
                CPU Performance Guide
              </div>
              <div style={{ fontSize: 11, color: 'var(--cds-text-secondary)', textAlign: 'center', lineHeight: 1.4 }}>
                Compare Intel generations & capacity
              </div>
            </NavLink>

            <NavLink
              to="/motu-rme"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 20,
                background: 'var(--cds-layer)',
                border: '1px solid var(--cds-border-subtle)',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <Flow size={28} style={{ color: 'var(--cds-link-primary)', marginBottom: 10 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cds-text-primary)', textAlign: 'center', marginBottom: 4 }}>
                Multi Channel ADAT Is Magic
              </div>
              <div style={{ fontSize: 11, color: 'var(--cds-text-secondary)', textAlign: 'center', lineHeight: 1.4 }}>
                MOTU + RME ADAT monitoring
              </div>
            </NavLink>

            <button
              onClick={() => setShowShoppingDialog(true)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 20,
                background: 'var(--cds-layer)',
                border: '1px solid var(--cds-border-subtle)',
                cursor: 'pointer',
              }}
            >
              <Package size={28} style={{ color: 'var(--cds-link-primary)', marginBottom: 10 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cds-text-primary)', textAlign: 'center', marginBottom: 4 }}>
                Find a Pro Interface
              </div>
              <div style={{ fontSize: 11, color: 'var(--cds-text-secondary)', textAlign: 'center', lineHeight: 1.4 }}>
                Search eBay, Reverb & ShopGoodwill
              </div>
            </button>

            <NavLink
              to="/cpu-performance"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 20,
                background: 'var(--cds-layer)',
                border: '1px solid var(--cds-border-subtle)',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <ChartLine size={28} style={{ color: 'var(--cds-link-primary)', marginBottom: 10 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cds-text-primary)', textAlign: 'center', marginBottom: 4 }}>
                Does CPU Matter?
              </div>
              <div style={{ fontSize: 11, color: 'var(--cds-text-secondary)', textAlign: 'center', lineHeight: 1.4 }}>
                Performance gains by generation
              </div>
            </NavLink>
          </div>
        </div>

        {/* Dialogs */}
        <ShoppingSearchDialog
          open={showShoppingDialog}
          onClose={() => setShowShoppingDialog(false)}
        />

      </Layer>
    </section>
  )
}
