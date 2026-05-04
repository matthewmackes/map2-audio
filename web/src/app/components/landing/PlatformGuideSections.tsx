// Platform Guide content sections — inlined into the unified Home page
// below the live status. No hero of its own; the Home hero is the entry.
import { useEffect, useState } from 'react'
import {
  MAP2_PLATFORM_BUILD_DATE,
  MAP2_PLATFORM_VERSION,
} from '../branding/map2Branding'

interface VersionInfo {
  version?: string
  build_date?: string
  commit?: string
}

const MODES: Array<{ mode: string; latency: string; description: string }> = [
  {
    mode: 'Audio',
    latency: '2.67 ms theoretical floor; 4–7 ms measured',
    description: 'Dedicated processing on isolated CPU cores. No web UI.',
  },
  {
    mode: 'All-in-One',
    latency: '4–7 ms realistic today',
    description: 'Audio processing + web dashboard + management on one node.',
  },
  {
    mode: 'Management',
    latency: 'N/A',
    description: 'Control-only node for cluster administration.',
  },
]

const REPO_STATS: Array<{ v: string; l: string }> = [
  { v: '1,476', l: 'Python' },
  { v: '1,492', l: 'TypeScript' },
  { v: '179', l: 'C++/H' },
  { v: '146', l: 'Docs' },
  { v: '3,731', l: 'Total commits' },
  { v: '3', l: 'Stars' },
  { v: '0', l: 'Forks' },
  { v: '0', l: 'Open issues' },
]

const ARCHITECTURE_LAYERS: Array<{ layer: string; tech: string; role: string }> = [
  { layer: 'Audio engine', tech: 'C++ · JUCE 8.0.0', role: 'Real-time DSP, plugin host, AVB transport.' },
  { layer: 'Backend API', tech: 'Python · FastAPI', role: 'Config, telemetry, snapshot service, controller host.' },
  { layer: 'Web dashboard', tech: 'React 19 · TypeScript', role: 'Control surface, library, routing matrix.' },
  { layer: 'Audio transport', tech: 'PipeWire · JACK', role: 'Low-latency device routing on Linux.' },
  { layer: 'Cluster fabric', tech: 'AVB · IEEE 1722', role: 'Multi-node deterministic streaming.' },
  { layer: 'Operating system', tech: 'Fedora 42+ · Linux RT', role: 'Real-time scheduling, isolated cores, RTKit.' },
]

const BUILT_WITH: Array<{ name: string; role: string; license: string; href: string }> = [
  { name: 'JUCE', role: 'C++ audio framework', license: 'GPLv3 / Commercial', href: 'https://juce.com' },
  { name: 'Neural Amp Modeler', role: 'Guitar amp neural modeling', license: 'MIT', href: 'https://www.neuralampmodeler.com/' },
  { name: 'PipeWire', role: 'Low-latency audio server', license: 'MIT', href: 'https://pipewire.org' },
  { name: 'Fedora Linux', role: 'Host OS', license: 'Various FOSS', href: 'https://fedoraproject.org' },
  { name: 'FastAPI', role: 'Python API framework', license: 'MIT', href: 'https://fastapi.tiangolo.com' },
  { name: 'React', role: 'Component-based UI', license: 'MIT', href: 'https://react.dev' },
  { name: 'Carbon Design System', role: 'IBM design language', license: 'Apache-2.0', href: 'https://carbondesignsystem.com' },
  { name: 'PyTorch', role: 'Neural inference', license: 'BSD-3-Clause', href: 'https://pytorch.org' },
]

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  )
}

function LaunchIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
      <path d="M5 3H3v10h10v-2M9 3h4v4M13 3l-7 7" />
    </svg>
  )
}

export function PlatformGuideSections() {
  // Cycle 4 — pull live version metadata so the guide reflects the
  // actual running build instead of hard-coded placeholders. Failures
  // fall back to the bundle constants.
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data === 'object') {
          setVersionInfo(data as VersionInfo)
        }
      })
      .catch(() => {
        // Bundle constants are fine when the API is unreachable.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const versionLabel = versionInfo?.version ?? MAP2_PLATFORM_VERSION
  const buildLabel = versionInfo?.build_date ?? MAP2_PLATFORM_BUILD_DATE
  const commitLabel = versionInfo?.commit ? versionInfo.commit.slice(0, 7) : '—'

  return (
    <>
      {/* anchor target for the hero CTA + the guide cards */}
      <div id="platform-guide" />

      {/* ── WHY ─────────────────────────────────────────────────────── */}
      <section className="map2x-guide-section">
        <div className="map2x-guide-section__inner">
          <div className="map2x-eyebrow map2x-eyebrow--accent map2x-guide-section__eyebrow">— Why</div>
          <h2 className="map2x-guide-section__title">It started as a digital pedalboard.</h2>
          <div className="map2x-prose">
            <p>
              Most modern bands already operate in a digital signal chain. Guitar modelers, digital mixers, drum
              triggers, MIDI controllers — every modern capture of a musical instrument converts to digital almost
              immediately.
            </p>
            <p>
              So, with a lot of help from AI, MAP2 extends that idea to its logical conclusion: a centralised digital
              audio backbone with sufficient I/O to handle the entire band simultaneously. Microphones, line inputs,
              MIDI keyboards, drum triggers, amp modelers — everything.
            </p>
            <p>
              No redundant interfaces. No repeated A/D and D/A conversions. No audio leaving and re-entering the
              digital domain. The signal path remains coherent, clocked and lossless from input to archive. That's
              technically optimal.
            </p>
          </div>
        </div>
      </section>

      {/* ── OPERATING MODES ─────────────────────────────────────────── */}
      <section id="modes" className="map2x-guide-section">
        <div className="map2x-guide-section__inner">
          <div className="map2x-eyebrow map2x-eyebrow--accent map2x-guide-section__eyebrow">— Operating modes</div>
          <h2 className="map2x-guide-section__title">Three modes, one platform.</h2>
          <p className="map2x-guide-section__sub">
            Each MAP2 node boots into one of three roles. Same image, different responsibilities.
          </p>

          <div className="map2x-panel">
            <div className="map2x-kv-head">
              <div className="map2x-kv-head__cell">Mode</div>
              <div className="map2x-kv-head__cell">Latency</div>
              <div className="map2x-kv-head__cell">Description</div>
            </div>
            {MODES.map((row, i) => (
              <div
                key={row.mode}
                className={`map2x-kv-row${i === MODES.length - 1 ? ' is-last' : ''}`}
              >
                <div className="map2x-kv-row__cell map2x-kv-row__cell--head">{row.mode}</div>
                <div className="map2x-kv-row__cell">{row.latency}</div>
                <div className="map2x-kv-row__cell">{row.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SIGNAL CHAIN ─────────────────────────────────────────── */}
      <section id="signal-chain" className="map2x-guide-section">
        <div className="map2x-guide-section__inner">
          <div className="map2x-eyebrow map2x-eyebrow--accent map2x-guide-section__eyebrow">— Signal chain</div>
          <h2 className="map2x-guide-section__title">Input to archive, in nine stages.</h2>

          <div className="map2x-panel">
            <div className="map2x-strip">
              <div className="map2x-mono map2x-strip__title">Signal Chain</div>
              <button type="button" className="map2x-ghost-btn">Copy</button>
            </div>
            <pre className="map2x-code">
{`Input → NAM (Neural Amp) → Modulation (11 types) → Cabinet IR → EQ →
Gate → Compressor → Limiter → Reverb IR → Output`}
            </pre>
          </div>
          <p className="map2x-guide-section__hint">
            All processing runs on isolated CPU cores with{' '}
            <span className="map2x-mono">SCHED_FIFO</span> real-time priority, PipeWire/JACK audio transport, and
            configurable buffer sizes down to 64 samples at 48 kHz.
          </p>
        </div>
      </section>

      {/* ── ARCHITECTURE ─────────────────────────────────────────── */}
      <section id="architecture" className="map2x-guide-section">
        <div className="map2x-guide-section__inner">
          <div className="map2x-eyebrow map2x-eyebrow--accent map2x-guide-section__eyebrow">— Architecture</div>
          <h2 className="map2x-guide-section__title">The stack, end to end.</h2>
          <p className="map2x-guide-section__sub">
            Six layers, each a self-contained subsystem. Replaceable, testable, documented in the open.
          </p>

          <div className="map2x-panel">
            <div className="map2x-kv-head">
              <div className="map2x-kv-head__cell">Layer</div>
              <div className="map2x-kv-head__cell">Technology</div>
              <div className="map2x-kv-head__cell">Role</div>
            </div>
            {ARCHITECTURE_LAYERS.map((row, i) => (
              <div
                key={row.layer}
                className={`map2x-kv-row${i === ARCHITECTURE_LAYERS.length - 1 ? ' is-last' : ''}`}
              >
                <div className="map2x-kv-row__cell map2x-kv-row__cell--head">{row.layer}</div>
                <div className="map2x-kv-row__cell map2x-kv-row__cell--mono">{row.tech}</div>
                <div className="map2x-kv-row__cell">{row.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SETUP & LAUNCH ─────────────────────────────────────────── */}
      <section id="setup" className="map2x-guide-section">
        <div className="map2x-guide-section__inner">
          <div className="map2x-eyebrow map2x-eyebrow--accent map2x-guide-section__eyebrow">— Setup & launch</div>
          <h2 className="map2x-guide-section__title">Get a node up.</h2>
          <p className="map2x-guide-section__sub">
            Targets Fedora Server 42+. Sources are AGPLv3.
          </p>

          <div className="map2x-code-grid">
            <div className="map2x-panel">
              <div className="map2x-strip">
                <div className="map2x-mono map2x-strip__title">Install</div>
                <button type="button" className="map2x-ghost-btn">Copy</button>
              </div>
              <pre className="map2x-code">
{`# Clone
git clone https://github.com/matthewmackes/map2-audio.git
cd map2-audio

# Full install
sudo bash install_on_new_host.sh

# Skip AVB during install
sudo bash install_on_new_host.sh --skip-avb`}
              </pre>
            </div>
            <div className="map2x-panel">
              <div className="map2x-strip">
                <div className="map2x-mono map2x-strip__title">Run</div>
                <button type="button" className="map2x-ghost-btn">Copy</button>
              </div>
              <pre className="map2x-code">
{`# Backend API (port 8080)
systemctl start map2-backend

# Web dashboard (port 3000)
./scripts/start_web.sh

# Textual TUI
python -m tui.node_console

# Ink TUI
./map2-tui --screen diagnostics`}
              </pre>
            </div>
          </div>

          <div className="map2x-callout map2x-callout--warn">
            <div className="map2x-eyebrow map2x-callout__title">Minimum viewport</div>
            <div className="map2x-callout__body">
              The MAP2 web GUI supports large-phone portrait and larger displays. The current minimum supported
              viewport is <span className="map2x-mono">560×917</span>. Heavily reduced browser windows are not
              supported.
            </div>
          </div>
        </div>
      </section>

      {/* ── BUILT WITH ─────────────────────────────────────────── */}
      <section id="built-with" className="map2x-guide-section">
        <div className="map2x-guide-section__inner">
          <div className="map2x-eyebrow map2x-eyebrow--accent map2x-guide-section__eyebrow">— Built with</div>
          <h2 className="map2x-guide-section__title">Open-source roots.</h2>
          <p className="map2x-guide-section__sub">
            JUCE, PipeWire, JACK, FastAPI, React, and dozens of other PyPI and npm packages standing on shoulders.
          </p>

          <div className="map2x-panel">
            <div className="map2x-bw-head">
              <div className="map2x-bw-head__cell">Project</div>
              <div className="map2x-bw-head__cell">Role</div>
              <div className="map2x-bw-head__cell">License</div>
              <div className="map2x-bw-head__cell" />
            </div>
            {BUILT_WITH.map((row, i) => (
              <div
                key={row.name}
                className={`map2x-bw-row${i === BUILT_WITH.length - 1 ? ' is-last' : ''}`}
              >
                <div className="map2x-bw-row__cell map2x-bw-row__cell--head">{row.name}</div>
                <div className="map2x-bw-row__cell">{row.role}</div>
                <div className="map2x-bw-row__cell map2x-bw-row__cell--mono">{row.license}</div>
                <div className="map2x-bw-row__cell map2x-bw-row__cell--right">
                  <a className="map2x-link" href={row.href} target="_blank" rel="noreferrer">
                    Visit project <LaunchIcon />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── REPOSITORY SNAPSHOT ─────────────────────────────────────────── */}
      <section className="map2x-guide-section">
        <div className="map2x-guide-section__inner">
          <div className="map2x-eyebrow map2x-eyebrow--accent map2x-guide-section__eyebrow">— Repository snapshot</div>
          <h2 className="map2x-guide-section__title">Where the code lives.</h2>
          <div className="map2x-guide-section__meta">
            <span className="map2x-tag">v{versionLabel}</span>
            <span className="map2x-tag">{buildLabel}</span>
            <span className="map2x-tag map2x-tag--accent">AGPL-3.0-only</span>
            <span className="map2x-tag" title="Currently deployed git commit">commit {commitLabel}</span>
          </div>

          <div className="map2x-panel">
            <div className="map2x-repo-grid">
              {REPO_STATS.map((c, i) => (
                <div
                  key={c.l}
                  className="map2x-repo-cell"
                  data-last-col={(i + 1) % 4 === 0 ? 'true' : 'false'}
                  data-first-row={i < 4 ? 'true' : 'false'}
                >
                  <div className="map2x-repo-cell__value">{c.v}</div>
                  <div className="map2x-eyebrow map2x-repo-cell__label">{c.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── LEGAL ─────────────────────────────────────────── */}
      <section id="legal" className="map2x-guide-section">
        <div className="map2x-guide-section__inner">
          <div className="map2x-eyebrow map2x-eyebrow--accent map2x-guide-section__eyebrow">— Legal</div>
          <h2 className="map2x-guide-section__title">AGPL-3.0 &amp; disclaimer.</h2>
          <p className="map2x-guide-section__sub">
            MAP2 is licensed under <strong>AGPLv3</strong>. Educational and research use only — not production-ready,
            not a substitute for any commercial product.
          </p>

          <div className="map2x-callout map2x-callout--accent">
            <div className="map2x-eyebrow map2x-callout__title">Not affiliated</div>
            <div className="map2x-callout__body">
              MAP2 is not affiliated with, endorsed by, or officially connected to any commercial manufacturer, brand
              owner, hardware developer, plugin creator, or rights holder. All trademarks, product names, and logos
              remain the property of their respective owners. References are used for educational, historical,
              descriptive, and interoperability purposes only. This project is provided "AS IS" without warranty of any
              kind.
            </div>
          </div>

          <div className="map2x-guide-section__cta-row">
            <a
              className="map2x-btn"
              href="https://www.gnu.org/licenses/agpl-3.0.html"
              target="_blank"
              rel="noreferrer"
            >
              Read AGPLv3 <LaunchIcon />
            </a>
            <a
              className="map2x-btn"
              href="https://github.com/matthewmackes/map2-audio"
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub <ArrowIcon />
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
