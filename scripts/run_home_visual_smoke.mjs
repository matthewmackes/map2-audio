import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import process from 'node:process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const webDir = path.join(repoRoot, 'web')
const artifactRoot = path.join(repoRoot, 'artifacts', 'visual-smoke', 'home')
const previewPort = Number(process.env.MAP2_VISUAL_SMOKE_PORT ?? '3311')
const previewHost = '127.0.0.1'
const previewUrl = `http://${previewHost}:${previewPort}`
const playwrightModuleUrl = new URL('../web/node_modules/playwright/index.mjs', import.meta.url)

const timestamp = new Date().toISOString().replace(/[:]/g, '-')
const runDir = path.join(artifactRoot, timestamp)
const screenshotDir = path.join(runDir, 'screenshots')

const SCENARIOS = [
  {
    key: 'minimal',
    description: 'Minimal home shell',
    route: '/',
    landingPreferences: {
      version: 1,
      bootSplashEnabled: false,
      cinematicBackdropEnabled: false,
    },
    wallpaper: null,
  },
  {
    key: 'cinematic-default',
    description: 'Cinematic home shell with default wallpaper',
    route: '/',
    landingPreferences: {
      version: 1,
      bootSplashEnabled: false,
      cinematicBackdropEnabled: true,
    },
    wallpaper: {
      version: 1,
      mode: 'default-image',
    },
  },
]

const VIEWPORT = { width: 1440, height: 960 }

function shell(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      ...options,
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

function startPreviewServer() {
  return spawn(
    process.execPath,
    [
      path.join(repoRoot, 'scripts', 'serve_web_dist.mjs'),
      '--host',
      previewHost,
      '--port',
      String(previewPort),
      '--root',
      path.join(webDir, 'dist'),
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    },
  )
}

async function waitForServer(url, timeoutMs = 20_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // Keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for preview server at ${url}`)
}

function jsonResponse(route, status, body) {
  void route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

function matchPath(url) {
  return new URL(url).pathname
}

async function installBrowserMocks(page, scenario) {
  await page.addInitScript((activeScenario) => {
    class MockWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3

      constructor(url) {
        this.url = url
        this.readyState = MockWebSocket.OPEN
        this.bufferedAmount = 0
        this.protocol = ''
        this.extensions = ''
        this.binaryType = 'blob'
        this.onopen = null
        this.onclose = null
        this.onerror = null
        this.onmessage = null
        queueMicrotask(() => {
          this.onopen?.({ type: 'open' })
        })
      }

      addEventListener() {}
      removeEventListener() {}
      send() {}

      close() {
        this.readyState = MockWebSocket.CLOSED
        this.onclose?.({ type: 'close', code: 1000, reason: 'mock-close', wasClean: true })
      }
    }

    window.WebSocket = MockWebSocket
    window.localStorage.setItem('map2:home-landing-preferences', JSON.stringify(activeScenario.landingPreferences))
    window.localStorage.removeItem('map2:home-desktop-session')
    if (activeScenario.wallpaper) {
      window.localStorage.setItem('map2:desktop-wallpaper', JSON.stringify(activeScenario.wallpaper))
    } else {
      window.localStorage.removeItem('map2:desktop-wallpaper')
    }
  }, scenario)

  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    const pathname = matchPath(url)

    if (method !== 'GET') {
      return jsonResponse(route, 200, { status: 'ok' })
    }

    if (pathname === '/api/settings/special/') {
      return jsonResponse(route, 200, {
        enabled: true,
        menu_location: 'hidden',
        pinned_routes: [],
        landing_tiles: [
          { route: '/workspace', size: 'large' },
          { route: '/brain', size: 'medium' },
          { route: '/midi-hub', size: 'medium' },
          { route: '/perform', size: 'small' },
        ],
        hidden_plugins: [],
        snapshot_setlist_mode: false,
        snapshot_setlist_order: [],
      })
    }

    if (pathname === '/api/avb/status') {
      return jsonResponse(route, 200, {
        enabled: true,
        available: true,
        operational: true,
        state: 'operational',
      })
    }

    if (pathname === '/api/avb/avdecc/stats') {
      return jsonResponse(route, 200, {
        enabled: true,
        entities_discovered: 1,
        connections_active: 1,
      })
    }

    if (pathname === '/api/adoption/candidates') {
      return jsonResponse(route, 200, {
        items: [{
          candidate_id: 'node-1',
          remote_node_id: 'node-1',
          node_id: 'node-1',
          hostname: 'MAP2-TESTBED',
          trust_state: 'trusted',
          adoption_state: 'ready',
          activation_state: 'active',
        }],
      })
    }

    if (pathname === '/api/system/host-machine-info') {
      return jsonResponse(route, 200, {
        hostname: 'map2-host',
        kernel_version: '6.9.0-rt',
        os_version: 'Fedora Linux 42',
        manufacturer: 'MAP2',
        model: 'Visual Smoke Rig',
      })
    }

    if (pathname === '/api/cluster/health/extended/devices') {
      return jsonResponse(route, 200, {
        nodes: {
          'node-1': {
            hostname: 'MAP2-TESTBED',
            status: 'online',
            audio_interfaces: ['RME Fireface UFX'],
            usb_audio_devices: [{ name: 'RME Fireface UFX' }],
            pipewire_devices: [],
            midi_devices: [{ name: 'Express 128' }],
          },
        },
      })
    }

    if (pathname === '/api/node/identity') {
      return jsonResponse(route, 200, {
        node_id: 'node-1',
        hostname: 'MAP2-TESTBED',
        display_label: 'Stage Node',
        role: 'all_in_one',
      })
    }

    if (pathname === '/api/node/topology') {
      return jsonResponse(route, 200, {
        nodes: [
          {
            node_id: 'node-1',
            hostname: 'MAP2-TESTBED',
            status: 'ok',
            role: 'all_in_one',
            is_local: true,
            last_seen: new Date().toISOString(),
            audio_latency_ms: 2.4,
            services: {
              backend: true,
              juce_engine: true,
              pipewire: true,
            },
          },
        ],
        audio_edges: [],
        network_edges: [],
      })
    }

    if (pathname === '/api/audio/status') {
      return jsonResponse(route, 200, {
        available_input_devices: ['RME Fireface UFX'],
        available_output_devices: ['RME Fireface UFX'],
      })
    }

    if (pathname === '/api/pipewire/status') {
      return jsonResponse(route, 200, {
        daemon: {
          running: true,
          version: '1.2.0',
          name: 'PipeWire',
          hostname: 'map2-host',
          cookie: 'visual-smoke',
          uptime_seconds: 3600,
        },
        settings: {
          clock_rate: 48000,
          clock_force_rate: 0,
          clock_quantum: 128,
          clock_force_quantum: 0,
          clock_min_quantum: 32,
          clock_max_quantum: 2048,
          clock_allowed_rates: [48000],
        },
        default_sink: null,
        default_source: null,
        devices: [
          {
            id: 1,
            name: 'alsa_card.usb-RME_Fireface_UFX',
            description: 'RME Fireface UFX',
            media_class: 'Audio/Device',
            direction: 'duplex',
            sample_rate: 48000,
            channels: 16,
            active: true,
          },
        ],
        nodes: [],
        streams: [],
        links: [],
        client_count: 3,
        xruns: 0,
        graph_latency_ms: 1.4,
        driver_latency_ms: 1.0,
        total_latency_ms: 2.4,
        alerts: [],
        timestamp: new Date().toISOString(),
      })
    }

    if (pathname === '/api/engine/cpu') {
      return jsonResponse(route, 200, {
        total_cpu_percent: 18,
        audio_callback_percent: 24,
        peak_cpu_percent: 31,
        average_cpu_percent: 16,
        xrun_count: 0,
        budget_ms: 2.67,
        current_callback_ms: 0.64,
        headroom_percent: 76,
        per_plugin_percent: {},
        running: true,
      })
    }

    if (pathname === '/api/v2/latency/jitter-stats') {
      return jsonResponse(route, 200, {
        running: true,
        xrun_count: 0,
        p95_ms: 0.18,
        rtl_p95_ms: 2.4,
      })
    }

    if (pathname === '/api/midi/devices') {
      return jsonResponse(route, 200, {
        inputs: [{ name: 'Express 128', is_virtual: false, kind: 'alsa' }],
        outputs: [{ name: 'Express 128', is_virtual: false, kind: 'alsa' }],
      })
    }

    if (pathname === '/api/push-surface/pending-confirmation') {
      return jsonResponse(route, 200, {
        status: 'ok',
        pending_confirmation: null,
        pending_count: 0,
      })
    }

    return jsonResponse(route, 200, {})
  })
}

async function main() {
  const skipBuild = process.argv.includes('--skip-build')
  await mkdir(screenshotDir, { recursive: true })

  if (!skipBuild) {
    await shell('npm', ['--prefix', 'web', 'run', 'build'])
  }

  const previewServer = startPreviewServer()
  let browser

  try {
    await waitForServer(previewUrl)
    const { chromium } = await import(playwrightModuleUrl.href)
    browser = await chromium.launch({ headless: true })
    const summary = {
      createdAt: new Date().toISOString(),
      previewUrl,
      viewport: VIEWPORT,
      scenarioCount: SCENARIOS.length,
      scenarios: [],
    }

    for (const scenario of SCENARIOS) {
      const page = await browser.newPage({ viewport: VIEWPORT })
      const consoleMessages = []
      const pageErrors = []
      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleMessages.push(message.text())
        }
      })
      page.on('pageerror', (error) => {
        pageErrors.push(error.message)
      })

      await installBrowserMocks(page, scenario)
      await page.goto(`${previewUrl}${scenario.route}`, { waitUntil: 'networkidle' })
      try {
        await page.waitForSelector('[data-testid="home-shell"]', { state: 'visible' })
      } catch (error) {
        const debugScreenshotPath = path.join(screenshotDir, `${scenario.key}-failure.png`)
        await page.screenshot({
          path: debugScreenshotPath,
          fullPage: true,
        })
        const bodyText = await page.locator('body').innerText().catch(() => '')
        throw new Error(
          [
            `Home shell did not render for scenario "${scenario.key}"`,
            `Console errors: ${consoleMessages.join(' | ') || 'none'}`,
            `Page errors: ${pageErrors.join(' | ') || 'none'}`,
            `Body text: ${bodyText.slice(0, 400) || 'unavailable'}`,
            `Failure screenshot: ${debugScreenshotPath}`,
            error instanceof Error ? error.message : String(error),
          ].join('\n'),
        )
      }

      const screenshotPath = path.join(screenshotDir, `${scenario.key}.png`)
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      })

      summary.scenarios.push({
        key: scenario.key,
        description: scenario.description,
        route: scenario.route,
        screenshotPath,
        consoleErrors: [...consoleMessages, ...pageErrors],
      })

      await page.close()
    }

    await writeFile(
      path.join(runDir, 'home-visual-smoke-summary.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8',
    )
  } finally {
    if (browser) {
      await browser.close()
    }

    previewServer.kill('SIGTERM')
    await new Promise((resolve) => previewServer.once('exit', resolve))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
