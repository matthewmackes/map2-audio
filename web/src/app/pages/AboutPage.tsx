import {
  Accessibility,
  Application,
  BareMetalServer,
  Book,
  ChartLine,
  Chip,
  Code,
  CodeReference,
  Cube,
  DataBase,
  Education,
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
  WarningAlt,
} from '@carbon/icons-react'
import {
  Accordion,
  AccordionItem,
  DataTable,
  Layer,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
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
import { PlatformInfoGuideSection } from '../components/Platform/PlatformInfoGuideSection'
import { HOST_MACHINE_ROUTE } from './hostMachineRoutes'
import './AboutPage.css'

interface VersionInfo {
  version?: string
  build_date?: string
  commit?: string
}

interface HeroProject {
  name: string
  tagline: string
  description: string
  website: string
  icon: React.ReactNode
  role: string
  license: string
  category: 'Core' | 'Backend' | 'Frontend' | 'Audio DSP' | 'Utilities'
}

interface LicenseInfo {
  id: string
  name: string
  shortName: string
  url: string
  description: string
  permissions: string[]
  conditions: string[]
  limitations: string[]
}

// ── Hero Projects: The major open-source projects that make MAP2 possible ──

const HERO_PROJECTS: HeroProject[] = [
  {
    name: 'JUCE',
    tagline: 'The C++ audio framework',
    description: 'Cross-platform C++ audio application framework with support for VST, VST3, AU, AUv3, LV2, and AAX plugins. MAP2 uses JUCE 8.0.0 as its real-time audio engine foundation, providing the audio callback, plugin hosting, and device management.',
    website: 'https://juce.com/',
    icon: <MapSignalFlowIcon size={32} />,
    role: 'Audio Engine Foundation',
    license: 'GPLv3 / Commercial',
    category: 'Core',
  },
  {
    name: 'Neural Amp Modeler',
    tagline: 'Deep learning amp modeling',
    description: 'WaveNet-based deep learning technology that captures the sonic fingerprint of guitar amplifiers, pedals, and signal chains. MAP2 integrates NAM as a first-class processor alongside impulse response convolution.',
    website: 'https://www.neuralampmodeler.com/',
    icon: <MapAmplifierIcon size={32} />,
    role: 'Neural Amp Simulation',
    license: 'MIT',
    category: 'Audio DSP',
  },
  {
    name: 'LV2',
    tagline: 'Open plugin standard',
    description: 'Extensible open-standard audio plugin format with RDF-based metadata. MAP2 uses the lilv library to discover and host LV2 plugins across the signal chain, supporting cabinet IRs, EQ, dynamics, and effects.',
    website: 'https://lv2plug.in/',
    icon: <Chip size={32} />,
    role: 'Plugin Interop',
    license: 'ISC',
    category: 'Core',
  },
  {
    name: 'Fedora Linux',
    tagline: 'Real-time operating system',
    description: 'Fedora with the PREEMPT_RT low-latency kernel is the reference operating environment. The combination of PipeWire, threadirqs, and isolated CPU cores delivers sub-2ms round-trip latency for professional audio work.',
    website: 'https://fedoraproject.org/',
    icon: <BareMetalServer size={32} />,
    role: 'Real-Time OS',
    license: 'Various (GPL family)',
    category: 'Core',
  },
  {
    name: 'FastAPI',
    tagline: 'Modern Python web framework',
    description: 'High-performance Python web framework with automatic OpenAPI documentation. MAP2 uses FastAPI + Uvicorn to serve its REST API, WebSocket streams, and service orchestration layer on port 8080.',
    website: 'https://fastapi.tiangolo.com/',
    icon: <Application size={32} />,
    role: 'Backend API',
    license: 'MIT',
    category: 'Backend',
  },
  {
    name: 'React',
    tagline: 'Component-based UI',
    description: 'Declarative JavaScript library for building user interfaces. MAP2 uses React 18 with TypeScript, Vite for build tooling, and IBM Carbon Design System components for a cohesive, accessible operator experience.',
    website: 'https://react.dev/',
    icon: <Code size={32} />,
    role: 'User Interface',
    license: 'MIT',
    category: 'Frontend',
  },
  {
    name: 'Carbon Design System',
    tagline: 'IBM design language',
    description: "IBM's open-source design system for products and digital experiences. MAP2's UI rigorously follows Carbon v11 tokens, typography, spacing, and component patterns — bringing enterprise-grade consistency to audio tooling.",
    website: 'https://carbondesignsystem.com/',
    icon: <PaintBrush size={32} />,
    role: 'Design System',
    license: 'Apache-2.0',
    category: 'Frontend',
  },
  {
    name: 'PyTorch',
    tagline: 'Machine learning framework',
    description: 'Open-source machine learning framework used by MAP2 for neural network inference, tensor operations on audio signals, and experimental DSP research workflows.',
    website: 'https://pytorch.org/',
    icon: <Lightning size={32} />,
    role: 'ML Inference',
    license: 'BSD-3-Clause',
    category: 'Audio DSP',
  },
  {
    name: 'PipeWire',
    tagline: 'Low-latency audio server',
    description: 'Modern multimedia server that unifies PulseAudio, JACK, and ALSA clients. MAP2 configures PipeWire with a 64-sample quantum at 48 kHz for 1.33 ms audio periods under PREEMPT_RT.',
    website: 'https://pipewire.org/',
    icon: <Flow size={32} />,
    role: 'Audio Transport',
    license: 'MIT',
    category: 'Core',
  },
]

// Supporting technologies
const SUPPORTING_PROJECTS: Array<{ name: string; role: string; license: string; website: string }> = [
  { name: 'Uvicorn', role: 'ASGI Server', license: 'BSD-3-Clause', website: 'https://www.uvicorn.org/' },
  { name: 'SQLAlchemy', role: 'Database ORM', license: 'MIT', website: 'https://www.sqlalchemy.org/' },
  { name: 'Pydantic', role: 'Data Validation', license: 'MIT', website: 'https://docs.pydantic.dev/' },
  { name: 'Vite', role: 'Build Tool', license: 'MIT', website: 'https://vitejs.dev/' },
  { name: 'TypeScript', role: 'Type System', license: 'Apache-2.0', website: 'https://www.typescriptlang.org/' },
  { name: 'React Flow', role: 'Node Editor', license: 'MIT', website: 'https://reactflow.dev/' },
  { name: 'Eigen', role: 'Linear Algebra', license: 'MPL-2.0', website: 'https://eigen.tuxfamily.org/' },
  { name: 'lilv', role: 'LV2 Discovery', license: 'ISC', website: 'https://drobilla.net/software/lilv.html' },
  { name: 'NumPy', role: 'Numerical Computing', license: 'BSD-3-Clause', website: 'https://numpy.org/' },
  { name: 'SciPy', role: 'Signal Processing', license: 'BSD-3-Clause', website: 'https://scipy.org/' },
  { name: 'python-rtmidi', role: 'MIDI I/O', license: 'MIT', website: 'https://github.com/SpotlightKid/python-rtmidi' },
  { name: 'nlohmann/json', role: 'JSON Parser (C++)', license: 'MIT', website: 'https://github.com/nlohmann/json' },
  { name: 'pybind11', role: 'Python Bindings', license: 'BSD-3-Clause', website: 'https://pybind11.readthedocs.io/' },
  { name: 'TanStack Query', role: 'Data Fetching', license: 'MIT', website: 'https://tanstack.com/query' },
  { name: 'React Router', role: 'Routing', license: 'MIT', website: 'https://reactrouter.com/' },
  { name: 'Recharts', role: 'Charts', license: 'MIT', website: 'https://recharts.org/' },
  { name: 'Ariakit', role: 'A11y Primitives', license: 'MIT', website: 'https://ariakit.org/' },
]

const LICENSES: LicenseInfo[] = [
  { id: 'mit', name: 'MIT License', shortName: 'MIT', url: 'https://opensource.org/licenses/MIT', description: 'Permissive license requiring only preservation of copyright and license notices.', permissions: ['Commercial use', 'Modification', 'Distribution', 'Private use'], conditions: ['License and copyright notice'], limitations: ['Liability', 'Warranty'] },
  { id: 'apache2', name: 'Apache License 2.0', shortName: 'Apache-2.0', url: 'https://opensource.org/licenses/Apache-2.0', description: 'Permissive with express patent grant from contributors.', permissions: ['Commercial use', 'Modification', 'Distribution', 'Patent use', 'Private use'], conditions: ['License and copyright notice', 'State changes'], limitations: ['Liability', 'Warranty', 'Trademark use'] },
  { id: 'bsd3', name: 'BSD 3-Clause License', shortName: 'BSD-3-Clause', url: 'https://opensource.org/licenses/BSD-3-Clause', description: 'Permissive similar to MIT with non-endorsement clause.', permissions: ['Commercial use', 'Modification', 'Distribution', 'Private use'], conditions: ['License and copyright notice'], limitations: ['Liability', 'Warranty'] },
  { id: 'gpl3', name: 'GNU GPL v3.0', shortName: 'GPLv3', url: 'https://www.gnu.org/licenses/gpl-3.0.html', description: 'Strong copyleft requiring source disclosure and same-license derivatives.', permissions: ['Commercial use', 'Modification', 'Distribution', 'Patent use', 'Private use'], conditions: ['License and copyright notice', 'State changes', 'Disclose source', 'Same license'], limitations: ['Liability', 'Warranty'] },
  { id: 'isc', name: 'ISC License', shortName: 'ISC', url: 'https://opensource.org/licenses/ISC', description: 'Permissive license functionally equivalent to MIT.', permissions: ['Commercial use', 'Modification', 'Distribution', 'Private use'], conditions: ['License and copyright notice'], limitations: ['Liability', 'Warranty'] },
  { id: 'mpl2', name: 'Mozilla Public License 2.0', shortName: 'MPL-2.0', url: 'https://opensource.org/licenses/MPL-2.0', description: 'Weak copyleft; modified files remain open.', permissions: ['Commercial use', 'Modification', 'Distribution', 'Patent use', 'Private use'], conditions: ['Disclose source (modified files)', 'License and copyright notice', 'Same license (modified files)'], limitations: ['Liability', 'Warranty', 'Trademark use'] },
  { id: 'agpl3', name: 'GNU AGPL v3.0', shortName: 'AGPL-3.0', url: 'https://www.gnu.org/licenses/agpl-3.0.html', description: 'Strong network copyleft; source disclosure for network use.', permissions: ['Commercial use', 'Modification', 'Distribution', 'Patent use', 'Private use'], conditions: ['License and copyright notice', 'State changes', 'Disclose source', 'Same license', 'Network use disclosure'], limitations: ['Liability', 'Warranty'] },
]

const LICENSE_URL_MAP: Record<string, string> = Object.fromEntries(LICENSES.map((l) => [l.id, l.url]))

const LICENSE_HEADERS = [
  { key: 'shortName', header: 'License' },
  { key: 'description', header: 'Summary' },
  { key: 'permissions', header: 'Permissions' },
  { key: 'conditions', header: 'Conditions' },
]

const SUPPORTING_HEADERS = [
  { key: 'name', header: 'Project' },
  { key: 'role', header: 'Role' },
  { key: 'license', header: 'License' },
  { key: 'link', header: '' },
]

// ── Component ─────────────────────────────────────────────────────────────

export function AboutPage() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [showShoppingDialog, setShowShoppingDialog] = useState(false)

  useEffect(() => {
    fetch('/api/version')
      .then((r) => r.json())
      .then(setVersionInfo)
      .catch(() =>
        setVersionInfo({
          version: MAP2_PLATFORM_VERSION,
          build_date: `${MAP2_PLATFORM_BUILD_DATE}${MAP2_PLATFORM_BUILD_TIME ? ` ${MAP2_PLATFORM_BUILD_TIME}` : ''}`.trim(),
        }),
      )
  }, [])

  const licenseRows = LICENSES.map((lic) => ({
    id: lic.id,
    shortName: lic.shortName,
    description: lic.description,
    permissions: lic.permissions.join(' · '),
    conditions: lic.conditions.join(' · '),
  }))

  const supportingRows = SUPPORTING_PROJECTS.map((p, i) => ({
    id: `sup-${i}`,
    name: p.name,
    role: p.role,
    license: p.license,
    link: p.website,
  }))

  return (
    <section className="about-page">
      <Layer className="about-page__surface">

        {/* ── HERO: Editorial Banner ────────────────────────────────────── */}
        <header className="about-page__hero" aria-labelledby="about-hero-title">
          <div className="about-page__hero-grid">
            <div className="about-page__hero-eyebrow">
              <span className="about-page__hero-mark" aria-hidden="true" />
              <span>MAP2 · Platform Guide</span>
            </div>
            <h1 id="about-hero-title" className="about-page__hero-title">
              An open, educational<br />
              platform for<br />
              <em>real-time audio.</em>
            </h1>
            <p className="about-page__hero-lede">
              MAP2 is a research-focused environment for learning, teaching, and experimenting with professional audio
              systems — built on free and open-source software, documented in the open, and licensed under AGPLv3.
            </p>
            <div className="about-page__hero-meta">
              <div className="about-page__hero-meta-item">
                <span className="about-page__hero-meta-label">Version</span>
                <span className="about-page__hero-meta-value">{versionInfo?.version ?? MAP2_PLATFORM_VERSION}</span>
              </div>
              <div className="about-page__hero-meta-item">
                <span className="about-page__hero-meta-label">Build</span>
                <span className="about-page__hero-meta-value">{versionInfo?.build_date ?? MAP2_PLATFORM_BUILD_DATE}</span>
              </div>
              <div className="about-page__hero-meta-item">
                <span className="about-page__hero-meta-label">License</span>
                <span className="about-page__hero-meta-value">AGPL-3.0-only</span>
              </div>
              <div className="about-page__hero-meta-item">
                <span className="about-page__hero-meta-label">Commit</span>
                <span className="about-page__hero-meta-value about-page__hero-meta-value--mono">
                  {versionInfo?.commit ? versionInfo.commit.slice(0, 7) : '—'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* ── LEGAL BAR: Always Visible, Impossible to Miss ─────────────── */}
        <section className="about-page__legal-bar" aria-labelledby="legal-title">
          <div className="about-page__legal-bar-grid">
            <div className="about-page__legal-bar-icon">
              <WarningAlt size={24} />
            </div>
            <div className="about-page__legal-bar-body">
              <h2 id="legal-title" className="about-page__legal-bar-title">Legal Notice · AGPL-3.0-only · Not Affiliated</h2>
              <p className="about-page__legal-bar-copy">
                MAP2-owned code is licensed under the <strong>GNU Affero General Public License v3.0</strong>. MAP2 is{' '}
                <strong>not affiliated with, endorsed by, or officially connected to</strong> any commercial manufacturer,
                brand owner, hardware developer, plugin creator, or rights holder. All trademarks, product names, and
                logos remain the property of their respective owners. References are used for educational, historical,
                descriptive, and interoperability purposes only. This project is provided <strong>"AS IS"</strong> without
                warranty of any kind.
              </p>
              <div className="about-page__legal-bar-actions">
                <a className="about-page__legal-bar-link" href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">
                  Read AGPLv3 <Launch size={12} />
                </a>
                <a className="about-page__legal-bar-link" href="https://github.com/matthewmackes/map2-audio" target="_blank" rel="noreferrer">
                  View Source <LogoGithub size={12} />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── MISSION: Research & Education ─────────────────────────────── */}
        <section className="about-page__mission" aria-labelledby="mission-title">
          <div className="about-page__mission-grid">
            <div className="about-page__mission-head">
              <div className="about-page__kicker">
                <Education size={16} />
                <span>Mission</span>
              </div>
              <h2 id="mission-title" className="about-page__section-title">Research &amp; Education</h2>
            </div>

            <div className="about-page__mission-body">
              <p className="about-page__mission-pullquote">
                MAP2 exists to make the full stack of professional audio &mdash; from kernel scheduling to plugin graphs
                to touch-surface UIs &mdash; legible, hackable, and teachable.
              </p>

              <div className="about-page__mission-pillars">
                <article className="about-page__pillar">
                  <div className="about-page__pillar-icon"><Book size={22} /></div>
                  <h3 className="about-page__pillar-title">Research documentation</h3>
                  <p className="about-page__pillar-copy">
                    Every architectural decision &mdash; kernel tuning, buffer sizes, signal chains, protocol choices &mdash;
                    is documented alongside the code. The repository is both a product and a study guide.
                  </p>
                </article>
                <article className="about-page__pillar">
                  <div className="about-page__pillar-icon"><Education size={22} /></div>
                  <h3 className="about-page__pillar-title">Pedagogical clarity</h3>
                  <p className="about-page__pillar-copy">
                    Code is written to be read. Naming, structure, and comments are optimized for learners working through
                    real-time audio systems for the first time &mdash; not for the smallest possible diff.
                  </p>
                </article>
                <article className="about-page__pillar">
                  <div className="about-page__pillar-icon"><Scales size={22} /></div>
                  <h3 className="about-page__pillar-title">Transparent licensing</h3>
                  <p className="about-page__pillar-copy">
                    AGPLv3 ensures that knowledge stays open. If you deploy a modified MAP2 over a network, your users
                    have the right to the corresponding source. No proprietary forks, no closed derivatives.
                  </p>
                </article>
                <article className="about-page__pillar">
                  <div className="about-page__pillar-icon"><Headphones size={22} /></div>
                  <h3 className="about-page__pillar-title">Respect for the craft</h3>
                  <p className="about-page__pillar-copy">
                    MAP2 references commercial hardware and software with reverence, not imitation. We study the giants;
                    we do not impersonate them. Trademarks remain with their owners.
                  </p>
                </article>
              </div>
            </div>
          </div>
        </section>

        {/* ── PHILOSOPHY: The thinking behind every major design choice ─── */}
        <section className="about-page__philosophy" aria-labelledby="philosophy-title">
          <div className="about-page__section-head">
            <div className="about-page__kicker">
              <Lightning size={16} />
              <span>The thinking behind the platform</span>
            </div>
            <h2 id="philosophy-title" className="about-page__section-title">The Philosophy Behind the Platform</h2>
            <p className="about-page__section-sub">
              These eight write-ups explain the thinking behind MAP2&rsquo;s biggest design choices. They aren&rsquo;t a
              feature list &mdash; they&rsquo;re the reasoning we come back to when we have to make a hard call. If you
              want to know <em>why</em> the platform behaves a certain way, start here.
            </p>
            <p className="about-page__philosophy-note">
              These documents are kept current. Whenever the platform&rsquo;s architecture changes in one of these areas,
              the matching write-up is updated in the same release.
            </p>
          </div>

          <div className="about-page__philosophy-grid">
            <article className="about-page__philosophy-card">
              <h3 className="about-page__philosophy-title">
                <strong>Keeping the Sound Clean</strong>
                <span className="about-page__philosophy-tagline"> &mdash; How we stop clicks, pops, and dropouts before they happen</span>
              </h3>
              <p className="about-page__philosophy-copy">
                A musician should never hear the platform itself. That means every change &mdash; turning a knob, swapping a
                snapshot, loading a new amp model &mdash; has to be either silent or fully muted. We hold ourselves to five
                rules: never allocate memory while audio is running, ramp every parameter change instead of jumping, flip a
                flag instead of rewiring the graph, stop audio cleanly before any restart, and keep a final limiter at the
                output as a safety net. A long-running soak test proves it before any release ships.
              </p>
              <ul className="about-page__philosophy-list">
                <li>Audio thread never allocates memory or waits on a lock</li>
                <li>Every knob change becomes a smooth ramp, not a jump</li>
                <li>Bypassing a plugin is a flag flip &mdash; the graph stays intact</li>
                <li>Big assets (amp models, reverb files) load on a side thread, then swap atomically</li>
                <li>A hard limiter sits at the master output as a last line of defense</li>
              </ul>
            </article>

            <article className="about-page__philosophy-card">
              <h3 className="about-page__philosophy-title">
                <strong>Networked Audio Done Right</strong>
                <span className="about-page__philosophy-tagline"> &mdash; Why MAP2 uses AVB for multi-room, multi-node sound</span>
              </h3>
              <p className="about-page__philosophy-copy">
                AVB is the only open standard that delivers reliable sub-2-millisecond audio across a switched network without
                locking you into one vendor. We commit to standards on the wire (so we interoperate with Biamp, MOTU, QSC, and
                others), reuse a production-tested control library instead of building our own, and treat AVB as a multi-node
                feature from day one. Hardware has to support precise timing in silicon &mdash; we don&rsquo;t pretend a stock
                NIC will do.
              </p>
              <ul className="about-page__philosophy-list">
                <li>Standards-conformant AVTP, gPTP, and credit-shaping &mdash; no proprietary tricks</li>
                <li>Control plane uses L-Acoustics&rsquo; battle-tested AVDECC library</li>
                <li>Streams refuse to start until the network clock is locked</li>
                <li>Required hardware: NICs with hardware timestamping (Intel I210/I225 reference)</li>
                <li>The network interface is set explicitly &mdash; no silent guessing</li>
              </ul>
            </article>

            <article className="about-page__philosophy-card">
              <h3 className="about-page__philosophy-title">
                <strong>How MAP2 Servers Work Together</strong>
                <span className="about-page__philosophy-tagline"> &mdash; What is shared between nodes, and what stays local</span>
              </h3>
              <p className="about-page__philosophy-copy">
                A MAP2 cluster is a group of single-owner nodes with a Raft-elected management plane. The audio state &mdash;
                what plugins are loaded, how channels are routed, every parameter &mdash; lives in one document store that
                every node watches. Backups, log files, and cached assets stay local. There is no automatic device failover:
                if a node goes offline, an operator re-adopts the device deliberately. We&rsquo;d rather show a clear banner
                than silently swap ownership during a live show.
              </p>
              <ul className="about-page__philosophy-list">
                <li>One node owns each device, enforced at the database level</li>
                <li>Snapshot documents replicate cluster-wide; backups stay on each node</li>
                <li>Two transports: HTTP/WebSocket for control, AVB for audio</li>
                <li>Raft handles management decisions; etcd handles audio state</li>
                <li>Drift between nodes is detected on a clock and reported, not hidden</li>
              </ul>
            </article>

            <article className="about-page__philosophy-card">
              <h3 className="about-page__philosophy-title">
                <strong>How Devices Get Connected</strong>
                <span className="about-page__philosophy-tagline"> &mdash; From plugging in a cable to seeing a panel in the browser</span>
              </h3>
              <p className="about-page__philosophy-copy">
                A device in MAP2 is a YAML profile, not C++ code. Adding a new piece of hardware is a directory of YAML files,
                not a backend release. The platform watches four sources at once (USB, ALSA MIDI, ALSA audio, PipeWire) so it
                can be honest with you when half the audio stack is down &mdash; &ldquo;USB sees it, PipeWire doesn&rsquo;t&rdquo;
                is a different problem from &ldquo;unplugged.&rdquo; Every device panel uses the same banner-and-dialog pattern,
                so multi-node behavior is consistent across vendors.
              </p>
              <ul className="about-page__philosophy-list">
                <li>Hardware lives in <code>device-packs/</code> as schema-validated YAML</li>
                <li>A bad pack is logged and skipped &mdash; one vendor&rsquo;s mistake never blocks boot</li>
                <li>USB hot-plug is a first-class event: insert a cable, the panel comes alive</li>
                <li>Adoption is single-owner and operator-driven &mdash; no silent failover</li>
                <li>All device panels share the same context banner and dialog components</li>
              </ul>
            </article>

            <article className="about-page__philosophy-card">
              <h3 className="about-page__philosophy-title">
                <strong>What MAP2 Changes on a Stock Fedora System</strong>
                <span className="about-page__philosophy-tagline"> &mdash; Every tweak, why we make it, and how to undo it</span>
              </h3>
              <p className="about-page__philosophy-copy">
                A stock Fedora install is built for general-purpose use. MAP2 needs a deterministic real-time audio host. The
                differences are large but well-defined &mdash; kernel boot flags, systemd services, PipeWire tuning, security
                limits, sysctl knobs, udev rules, CPU governor settings. Every change lives in a tracked file, every change is
                reversible, nothing is hidden. If a tweak goes wrong it should fail loudly, not quietly degrade.
              </p>
              <ul className="about-page__philosophy-list">
                <li>Kernel boot flags isolate two CPU cores for audio and cap C-states</li>
                <li>Custom systemd services for the backend, IRQ pinning, gPTP, and SRP</li>
                <li>A single PipeWire fragment sets quantum, rate, and headroom</li>
                <li>Real-time priority and memory locks granted via PAM limits</li>
                <li>Every modification is in git &mdash; reverting is a documented checklist</li>
              </ul>
            </article>

            <article className="about-page__philosophy-card">
              <h3 className="about-page__philosophy-title">
                <strong>Why JUCE Powers the Engine</strong>
                <span className="about-page__philosophy-tagline"> &mdash; The C++ framework underneath every audio decision</span>
              </h3>
              <p className="about-page__philosophy-copy">
                JUCE solves the four hardest problems in cross-platform audio: device I/O, plugin hosting, graph management,
                and real-time-safe building blocks. Building any of those from scratch would be a multi-quarter project that
                wouldn&rsquo;t make MAP2 any better. The audio thread runs at high real-time priority on isolated cores with a
                1.33 ms budget per callback. Python talks to JUCE in-process through pybind11 &mdash; there&rsquo;s no socket,
                no JSON, no extra latency. The exception is the controller host, which runs in a separate process so a buggy
                script can&rsquo;t take down audio.
              </p>
              <ul className="about-page__philosophy-list">
                <li>JUCE 8 handles ALSA, JACK, CoreAudio, and WASAPI behind one API</li>
                <li>Plugin hosting (LV2, LADSPA) and graph mutation are framework-native</li>
                <li>The audio thread is forbidden from allocating, locking, or logging</li>
                <li>Python imports the engine as a <code>.so</code> &mdash; no IPC overhead</li>
                <li>Release builds only &mdash; <code>-O0</code> is too slow for real-time</li>
              </ul>
            </article>

            <article className="about-page__philosophy-card">
              <h3 className="about-page__philosophy-title">
                <strong>MIDI, Built for Live Shows</strong>
                <span className="about-page__philosophy-tagline"> &mdash; How a footswitch becomes a chain change without ever blocking audio</span>
              </h3>
              <p className="about-page__philosophy-copy">
                MAP2&rsquo;s MIDI stack is built around four promises: nothing it does can ever add jitter to audio, every
                controller is reduced to a YAML profile before any code reasons about it, mappings are declarative (not code)
                so a show that worked yesterday works tomorrow, and MIDI events fan out across a cluster as a uniform event
                bus. The mapping engine runs in a separate process &mdash; a buggy script or stuck interpreter cannot stall
                audio. A single fast-path flag short-circuits the slow Python round-trip for events where every microsecond
                matters.
              </p>
              <ul className="about-page__philosophy-list">
                <li>Controller logic runs in a separate, supervised process</li>
                <li>Every controller has a YAML profile in <code>device-packs/</code></li>
                <li>Mapping scripts run in a sandboxed QuickJS VM</li>
                <li>Continuous controllers get pre-computed smoothing &mdash; no math on the audio thread</li>
                <li>RTP-MIDI, OSC, and the cluster bus deliver the same event shape</li>
              </ul>
            </article>

            <article className="about-page__philosophy-card">
              <h3 className="about-page__philosophy-title">
                <strong>One Source of Truth for Snapshots</strong>
                <span className="about-page__philosophy-tagline"> &mdash; Why every audio decision lives in one document</span>
              </h3>
              <p className="about-page__philosophy-copy">
                Exactly one place describes what the engine is doing: a JSON document owned by the State Authority. Every
                other surface &mdash; the JUCE engine&rsquo;s live values, the React editor, the database row, the cluster
                peer&rsquo;s mirror &mdash; is <em>derived</em> from that document. Nothing drifts sideways. Activation is
                all-or-nothing: a snapshot is live everywhere in the cluster, or it isn&rsquo;t live. A reload is always safe.
                A bug report can almost always be reproduced from the snapshot ID alone.
              </p>
              <ul className="about-page__philosophy-list">
                <li>The graph document is the single canonical state &mdash; no sideband stores</li>
                <li>Optimistic concurrency: stale edits are rejected with <code>412 Precondition Failed</code></li>
                <li>Activation phases gate the engine &mdash; partial applies are not visible to operators</li>
                <li>etcd backs the document store; SQLite is just a local mirror</li>
                <li>Old snapshot versions normalize forward &mdash; no version skew can lose data</li>
              </ul>
            </article>
          </div>
        </section>

        {/* ── HERO LEVEL TWO: Open-Source Projects That Power MAP2 ──────── */}
        <section className="about-page__oss" aria-labelledby="oss-title">
          <div className="about-page__section-head">
            <div className="about-page__kicker">
              <Package size={16} />
              <span>Standing on the shoulders of giants</span>
            </div>
            <h2 id="oss-title" className="about-page__section-title">
              The open-source projects<br />that make MAP2 possible.
            </h2>
            <p className="about-page__section-sub">
              Every layer of MAP2 &mdash; the real-time kernel, the audio engine, the UI, the ML inference &mdash;
              rests on decades of work by the free and open-source community. These are the projects we depend on,
              the licenses we respect, and the communities we are deeply grateful to.
            </p>
          </div>

          <div className="about-page__oss-grid">
            {HERO_PROJECTS.map((project) => (
              <a
                key={project.name}
                href={project.website}
                target="_blank"
                rel="noreferrer"
                className="about-page__oss-card"
              >
                <div className="about-page__oss-card-top">
                  <div className="about-page__oss-icon">{project.icon}</div>
                  <span className="about-page__oss-category">{project.category}</span>
                </div>
                <h3 className="about-page__oss-name">{project.name}</h3>
                <p className="about-page__oss-tagline">{project.tagline}</p>
                <p className="about-page__oss-desc">{project.description}</p>
                <div className="about-page__oss-card-foot">
                  <div className="about-page__oss-meta">
                    <span className="about-page__oss-meta-label">Role</span>
                    <span className="about-page__oss-meta-value">{project.role}</span>
                  </div>
                  <div className="about-page__oss-meta">
                    <span className="about-page__oss-meta-label">License</span>
                    <span className="about-page__oss-meta-value">{project.license}</span>
                  </div>
                </div>
                <span className="about-page__oss-cta">
                  Visit project <Launch size={14} />
                </span>
              </a>
            ))}
          </div>

          {/* Supporting libraries table */}
          <div className="about-page__supporting">
            <div className="about-page__supporting-head">
              <h3 className="about-page__h3">Supporting libraries</h3>
              <p className="about-page__supporting-sub">
                Additional open-source components integrated throughout the stack.
              </p>
            </div>

            <DataTable rows={supportingRows} headers={SUPPORTING_HEADERS} isSortable>
              {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
                <TableContainer {...getTableContainerProps()} className="about-page__table">
                  <Table {...getTableProps()} aria-label="Supporting libraries">
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
                        const sourceRow = supportingRows.find((r) => r.id === row.id)
                        return (
                          <TableRow key={row.id} {...rProps}>
                            {row.cells.map((cell) => {
                              if (cell.info.header === 'name') {
                                return (
                                  <TableCell key={cell.id}>
                                    <strong>{String(cell.value)}</strong>
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
                              if (cell.info.header === 'link') {
                                return (
                                  <TableCell key={cell.id}>
                                    <a
                                      href={sourceRow?.link ?? '#'}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="about-page__link"
                                    >
                                      Visit <Launch size={12} />
                                    </a>
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
          </div>
        </section>

        {/* ── DOCUMENTATION LIBRARY ─────────────────────────────────────── */}
        <section className="about-page__docs" aria-labelledby="docs-title">
          <div className="about-page__section-head">
            <div className="about-page__kicker">
              <Book size={16} />
              <span>Documentation</span>
            </div>
            <h2 id="docs-title" className="about-page__section-title">Research library</h2>
            <p className="about-page__section-sub">
              Architecture notes, setup guides, protocol references, and performance tuning &mdash; searchable and
              downloadable directly from the platform.
            </p>
          </div>
          <PlatformInfoGuideSection />
        </section>

        {/* ── HARDWARE HELPERS ──────────────────────────────────────────── */}
        <section className="about-page__hw" aria-labelledby="hw-title">
          <div className="about-page__section-head">
            <div className="about-page__kicker">
              <Headphones size={16} />
              <span>Get oriented</span>
            </div>
            <h2 id="hw-title" className="about-page__section-title">Explore the platform</h2>
          </div>
          <div className="about-page__hw-grid">
            <NavLink to={HOST_MACHINE_ROUTE} className="about-page__hw-tile">
              <Chip size={24} />
              <span className="about-page__hw-title">Host Machine</span>
              <span className="about-page__hw-sub">Hardware &amp; OS details</span>
            </NavLink>
            <NavLink to="/engine" className="about-page__hw-tile">
              <ChartLine size={24} />
              <span className="about-page__hw-title">Audio Engine</span>
              <span className="about-page__hw-sub">Runtime CPU &amp; latency</span>
            </NavLink>
            <NavLink to="/motu-rme" className="about-page__hw-tile">
              <Flow size={24} />
              <span className="about-page__hw-title">ADAT Monitoring</span>
              <span className="about-page__hw-sub">MOTU + RME routing</span>
            </NavLink>
            <button type="button" onClick={() => setShowShoppingDialog(true)} className="about-page__hw-tile">
              <Package size={24} />
              <span className="about-page__hw-title">Find Hardware</span>
              <span className="about-page__hw-sub">eBay · Reverb · ShopGoodwill</span>
            </button>
          </div>
        </section>

        {/* ── CREDITS ───────────────────────────────────────────────────── */}
        <section className="about-page__credits" aria-labelledby="credits-title">
          <div className="about-page__section-head">
            <div className="about-page__kicker">
              <UserFavorite size={16} />
              <span>Credits</span>
            </div>
            <h2 id="credits-title" className="about-page__section-title">Platform stewardship</h2>
          </div>
          <div className="about-page__credits-card">
            <div className="about-page__credits-role">Platform Leadership</div>
            <div className="about-page__credits-name">Matthew Mackes</div>
            <div className="about-page__credits-title-text">Vibe Scrum Master &amp; AI Taskmaster &middot; Buffalo, NY</div>
            <a href="mailto:matthewmackes@outlook.com" className="about-page__link">
              matthewmackes@outlook.com <Launch size={12} />
            </a>
          </div>
        </section>

        {/* ── LEGAL DETAIL: Full text for those who need it ─────────────── */}
        <section className="about-page__legal-full" aria-labelledby="legal-full-title">
          <div className="about-page__section-head">
            <div className="about-page__kicker about-page__kicker--warning">
              <Scales size={16} />
              <span>Legal detail</span>
            </div>
            <h2 id="legal-full-title" className="about-page__section-title">Licenses &amp; disclosures</h2>
            <p className="about-page__section-sub">
              Full license text, open-source summaries, and responsibility acknowledgements.
            </p>
          </div>

          <Accordion className="about-page__accordion" align="start">
            <AccordionItem title="GNU Affero General Public License v3.0 (AGPL-3.0-only)">
              <div className="about-page__prose">
                <p>
                  MAP2-owned code in this repository is licensed under the <strong>GNU Affero General Public License v3.0
                  (AGPL-3.0-only)</strong>. Educational intent statements describe project goals and do not add restrictions
                  beyond AGPLv3.
                </p>
                <p>
                  Source availability path for MAP2-owned code is this repository. Modified networked deployments should
                  provide corresponding source in an accessible location for their users.
                </p>
                <p>Third-party components remain under their original licenses and are not relicensed by MAP2.</p>
              </div>
            </AccordionItem>

            <AccordionItem title="No affiliation or endorsement">
              <div className="about-page__prose">
                <p>
                  This software, source code, documentation, presets, examples, impulse responses, UI text, comments, demo
                  files, and related materials are <strong>not affiliated with, endorsed by, sponsored by, or officially
                  connected to</strong> any commercial manufacturer, brand owner, hardware developer, software developer,
                  plugin creator, or rights holder.
                </p>
                <p>
                  All trademarks, service marks, trade names, brand names, product names, model designations, logos, and
                  related intellectual property are the <strong>property of their respective owners</strong>. References
                  are used for educational, historical, descriptive, comparative, referential, and interoperability
                  purposes only. No trademark rights are granted by this repository license, documentation, or code.
                </p>
              </div>
            </AccordionItem>

            <AccordionItem title="No warranty">
              <div className="about-page__prose">
                <p>
                  This project and all associated materials are provided <strong>"AS IS"</strong> and{' '}
                  <strong>"AS AVAILABLE"</strong>, without warranties of any kind, including merchantability, fitness for
                  a particular purpose, and non-infringement.
                </p>
              </div>
            </AccordionItem>

            <AccordionItem title="Your responsibility">
              <div className="about-page__prose">
                <p>By accessing, studying, modifying, running, or distributing any part of this project, you acknowledge and agree that you will:</p>
                <ol>
                  <li>Comply with AGPLv3 requirements for MAP2-owned code.</li>
                  <li>Comply with all applicable third-party licenses for included dependencies.</li>
                  <li>Avoid representing this project as officially affiliated with third-party brands or products.</li>
                  <li>Comply with applicable trademark, copyright, and other IP laws in your jurisdiction.</li>
                </ol>
              </div>
            </AccordionItem>

            <AccordionItem title="Open-source license reference">
              <DataTable rows={licenseRows} headers={LICENSE_HEADERS} isSortable>
                {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
                  <TableContainer {...getTableContainerProps()} className="about-page__table">
                    <Table {...getTableProps()} aria-label="Open-source licenses">
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
                                      <a href={url} target="_blank" rel="noreferrer" className="about-page__link">
                                        <strong>{String(cell.value)}</strong>
                                      </a>
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
            </AccordionItem>
          </Accordion>
          <p className="about-page__legal-updated">Last updated 2026-04-18</p>
        </section>

        <ShoppingSearchDialog open={showShoppingDialog} onClose={() => setShowShoppingDialog(false)} />
      </Layer>
    </section>
  )
}
