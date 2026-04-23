import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import process from 'node:process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const webDir = path.join(repoRoot, 'web')
const artifactRoot = path.join(repoRoot, 'artifacts', 'visual-smoke', 'workspace')
const previewPort = Number(process.env.MAP2_VISUAL_SMOKE_PORT ?? '3310')
const previewHost = '127.0.0.1'
const previewUrl = `http://${previewHost}:${previewPort}`
const playwrightModuleUrl = new URL('../web/node_modules/playwright/index.mjs', import.meta.url)

const timestamp = new Date().toISOString().replace(/[:]/g, '-')
const runDir = path.join(artifactRoot, timestamp)
const screenshotDir = path.join(runDir, 'screenshots')

const ROUTES = [
  '/workspace/platforms/overview',
  '/workspace/platforms/management',
  '/workspace/platforms/audio-engine',
  '/workspace/platforms/avb-routing',
  '/workspace/platforms/network-discovery',
  '/workspace/platforms/cluster-dashboard',
  '/workspace/platforms/adoption',
  '/hardware/host-machine',
  '/workspace/platforms/theme',
  '/workspace/platforms/about',
  '/workspace/physical-surfaces',
  '/workspace/physical-surfaces/maschine-mk1',
  '/workspace/physical-surfaces/ableton-push',
  '/workspace/physical-surfaces/ground-control-pro',
  '/workspace/physical-surfaces/midi-commander',
  '/workspace/physical-surfaces/novation-launch-control',
  '/workspace/physical-surfaces/mackie-mcu-pro',
  '/workspace/artifacts?category=lv2-plugins',
  '/workspace/artifacts?category=nam-models',
  '/workspace/artifacts?category=cabinet-irs',
  '/workspace/artifacts?category=reverb-irs',
  '/workspace/artifacts?category=soundfonts',
  '/workspace/artifacts?category=native-juce',
  '/workspace/artifacts?category=snapshots',
  '/workspace/artifacts/discover',
  '/workspace/outboard-hardware',
  '/workspace/outboard-hardware/tesira',
  '/workspace/outboard-hardware/edirol-ua1000',
  '/workspace/outboard-hardware/hotone-jogg',
  '/workspace/outboard-hardware/mpx1-rack',
  '/workspace/outboard-hardware/intelfx-rack',
]

const VIEWPORT = { width: 1440, height: 960 }

function slugifyRoute(route) {
  return route
    .replace(/^\//, '')
    .replace(/[/?=&]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

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
  const child = spawn(
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

  return child
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
      // Keep polling until timeout.
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

async function installBrowserMocks(page) {
  await page.addInitScript(() => {
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
    window.localStorage.setItem('map2:home-landing-preferences', JSON.stringify({
      version: 1,
      bootSplashEnabled: false,
      cinematicBackdropEnabled: false,
    }))
  })

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

    if (pathname === '/api/avb/streams') {
      return jsonResponse(route, 200, {
        available: true,
        streams: [],
      })
    }

    if (pathname === '/api/avb/discovery') {
      return jsonResponse(route, 200, {
        enabled: true,
        total_discovered: 1,
        talker_nodes: 1,
        listener_nodes: 1,
        nodes: [{
          node_id: 'node-1',
          hostname: 'MAP2-TESTBED',
          addresses: ['192.168.1.20'],
          port: 8080,
          last_seen: new Date().toISOString(),
        }],
      })
    }

    if (pathname === '/api/avb/ptp/status') {
      return jsonResponse(route, 200, {
        available: true,
        state: 'locked',
        offset_ns: 12,
        mean_path_delay_ns: 30,
      })
    }

    if (pathname === '/api/avb/tsn/status') {
      return jsonResponse(route, 200, {
        available: true,
        interface: 'enp1s0',
        mqprio_configured: true,
        cbs_configured: true,
        etf_configured: false,
        vlan_configured: true,
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
          readiness: {
            status: 'ready',
            blocking_count: 0,
            warning_count: 0,
          },
          avb_auto_provision: {
            state: 'ready',
            connected: 0,
            failed: 0,
            candidate_pairs: 0,
            last_run_at: new Date().toISOString(),
          },
        }],
      })
    }

    if (pathname === '/api/platform-remediation/summary') {
      return jsonResponse(route, 200, {
        status: 'ok',
        counts: { adoption: {}, sync: {}, clone: {} },
        workflows: {
          adoption: { available: true, state: 'ready', detail: 'Ready for adoption' },
          sync: { available: true, state: 'ready', detail: 'Ready for sync' },
          clone: { available: true, state: 'ready', detail: 'Ready for clone' },
        },
        manifest: {
          source_node: 'node-1',
          timestamp: new Date().toISOString(),
        },
        nodes: [{
          node_id: 'node-1',
          hostname: 'MAP2-TESTBED',
          api_url: 'http://192.168.1.20:8080/api',
          host: '192.168.1.20',
          visible: true,
          registered: true,
          is_online: true,
          adoption_state: 'ready',
          activation_state: 'active',
          trust_state: 'trusted',
          routing_ready: true,
          readiness_status: 'ready',
          avb_auto_provision: {
            state: 'ready',
            connected: 0,
            failed: 0,
            candidate_pairs: 0,
            last_run_at: new Date().toISOString(),
          },
          version: '2026.04.visual-smoke',
          commit: 'visual-smoke',
          version_error: null,
          remote_fingerprint: 'fingerprint-1',
          sync_states: ['in_sync'],
          clone_states: ['ready'],
          is_source_of_truth: true,
          rollback_available: false,
        }],
      })
    }

    if (pathname === '/api/platform-remediation/sync/history') {
      return jsonResponse(route, 200, { status: 'ok', items: [] })
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

    if (pathname === '/api/system/disk-health') {
      return jsonResponse(route, 200, {
        overall_status: 'healthy',
        disks: [],
      })
    }

    if (pathname === '/api/system/health-overview') {
      return jsonResponse(route, 200, {
        overall_health: 'good',
        cpu_temperature_c: 48,
        cpu_temp_celsius: 48,
        cpu_usage_percent: 18,
        memory_usage_percent: 34,
        fan_rpm: 0,
        power_supply_status: 'healthy',
        power: {
          input_voltage: 120,
          current_load_percent: 31,
        },
      })
    }

    if (pathname === '/api/system/branding-assets') {
      return jsonResponse(route, 200, {
        logo_url: null,
        logo_fallback: null,
        manufacturer: 'MAP2',
        manufacturer_name: 'MAP2',
        product_name: 'Reference Node',
        marketing_name: 'Reference Node',
        support_url: 'https://example.com/support',
        warranty_status: 'Active',
        brand_color: '#0f62fe',
        sff_optimized: true,
      })
    }

    if (pathname === '/api/cluster/health/extended/devices') {
      return jsonResponse(route, 200, {
        nodes: {
          'node-1': {
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

    if (pathname === '/api/node/health') {
      return jsonResponse(route, 200, {
        status: 'healthy',
        services: [],
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

    if (pathname === '/api/audio/source-of-truth') {
      return jsonResponse(route, 200, {
        timestamp: new Date().toISOString(),
        status: 'aligned',
        profile: {
          selected_profile: 'Default',
          profile_version: '1',
          clock_master: 'MAP2-TESTBED',
          remarks: [],
        },
        configured: {
          engine_rate_hz: 48000,
          avb_stream_rate_hz: 48000,
          spdif_rate_hz: 48000,
          buffer_size_samples: 128,
          bits_per_sample: 24,
          allowed_rates_hz: [44100, 48000, 96000],
          require_hard_lock: false,
          allow_resampler: true,
          spdif: {
            enabled: false,
            device: '',
            transport_mode: '',
            allow_resampler: true,
            require_hard_lock: false,
            remarks: [],
          },
          avb: {
            enabled: false,
            interface: '',
            auto_connect: false,
            ptp_domain: 0,
            max_streams: 0,
          },
        },
        runtime: {
          engine: {
            available: true,
            running: true,
            sample_rate_hz: 48000,
            buffer_size_samples: 128,
            cpu_load_percent: 12,
            audio_device: 'RME Fireface UFX',
          },
          pipewire: {
            available: true,
            clock_rate_hz: 48000,
            clock_force_rate_hz: 0,
            clock_quantum_samples: 128,
            clock_force_quantum_samples: 0,
            clock_allowed_rates_hz: [44100, 48000],
            effective_rate_hz: 48000,
            effective_quantum_samples: 128,
          },
          avb: {
            enabled: false,
            interface: '',
            auto_connect: false,
            available: false,
            state: 'disabled',
            ptp: { available: false },
          },
        },
        consistency: {
          checks: {},
          issues: [],
          issue_count: 0,
        },
      })
    }

    if (pathname === '/api/network/status') {
      return jsonResponse(route, 200, {
        hostname: 'MAP2-TESTBED',
        ethernet: [{
          interface: 'enp1s0',
          state: 'up',
          mac_address: '00:11:22:33:44:55',
          ipv4_addresses: ['192.168.1.20/24'],
        }],
        wifi: [],
      })
    }

    if (pathname === '/api/deployment/mode') {
      return jsonResponse(route, 200, { mode: 'single-node' })
    }

    if (pathname === '/api/cluster/status') {
      return jsonResponse(route, 200, {
        online_count: 1,
        total_count: 1,
        aggregate_health_score: 100,
      })
    }

    if (pathname === '/api/pipewire/status') {
      return jsonResponse(route, 200, {
        daemon: {
          running: true,
          version: '1.2.0',
          name: 'PipeWire',
          hostname: 'MAP2-TESTBED',
          cookie: 'visual-smoke',
          uptime_seconds: 7200,
        },
        settings: {
          clock_rate: 48000,
          clock_force_rate: 0,
          clock_quantum: 256,
          clock_force_quantum: 0,
          clock_min_quantum: 32,
          clock_max_quantum: 2048,
          clock_allowed_rates: [48000],
        },
        default_sink: null,
        default_source: null,
        devices: [],
        nodes: [],
        streams: [],
        links: [],
        client_count: 0,
        xruns: 0,
        graph_latency_ms: 5.3,
        driver_latency_ms: 2.7,
        total_latency_ms: 8,
        alerts: [],
        timestamp: new Date().toISOString(),
      })
    }

    if (pathname === '/openapi.json') {
      return jsonResponse(route, 200, {
        openapi: '3.1.0',
        info: { title: 'MAP2 API', version: 'visual-smoke' },
        paths: {},
      })
    }

    if (pathname === '/api/observatory/traffic/stats') {
      return jsonResponse(route, 200, {
        total_requests: 0,
        avg_response_ms: 0,
        p95_ms: 0,
        p99_ms: 0,
        error_rate_percent: 0,
        requests_per_second: 0,
      })
    }

    if (pathname === '/api/www/status') {
      return jsonResponse(route, 200, {
        backend_status: 'online',
        frontend_status: 'online',
        websocket_status: 'connected',
        uptime_seconds: 7200,
      })
    }

    if (pathname === '/api/version') {
      return jsonResponse(route, 200, {
        version: '2026.04.visual-smoke',
        branch: 'master',
        commit: 'visual-smoke',
        dirty: false,
      })
    }

    if (pathname === '/api/cluster/update/status') {
      return jsonResponse(route, 200, {
        status: 'idle',
        current_version: '2026.04.visual-smoke',
        latest_version: '2026.04.visual-smoke',
      })
    }

    if (pathname === '/api/cluster/update/hybrid/application/status') {
      return jsonResponse(route, 200, {
        status: 'idle',
        mode: 'hybrid',
        environment: 'production',
        running: false,
        current_version: '2026.04.visual-smoke',
        message: 'Update workflow ready',
        last_update: null,
        steps: [],
      })
    }

    if (pathname === '/api/cluster/update/hybrid/application/version') {
      return jsonResponse(route, 200, {
        version: '2026.04.visual-smoke',
        branch: 'master',
      })
    }

    if (pathname === '/api/backup/status') {
      return jsonResponse(route, 200, {
        configured: true,
        last_backup_at: null,
        last_backup_status: 'idle',
      })
    }

    if (pathname === '/api/health') {
      return jsonResponse(route, 200, {
        status: 'healthy',
        checks: [],
      })
    }

    if (pathname === '/api/deployment/status') {
      return jsonResponse(route, 200, {
        status: 'ready',
        current_target: 'local',
      })
    }

    if (pathname === '/api/cluster/update/manifest/drift') {
      return jsonResponse(route, 200, {
        nodes: [],
      })
    }

    if (pathname === '/api/peers') {
      return jsonResponse(route, 200, {
        local_node_id: 'node-1',
        discovery_enabled: true,
        discovery_uptime: '2h',
        peers_discovered: 1,
        peers_connected: 1,
        peers: [{
          node_id: 'node-1',
          node_mode: 'all_in_one',
          hostname: 'MAP2-TESTBED',
          host: '192.168.1.20',
          port: 8080,
          api_url: 'http://192.168.1.20:8080/api',
          ws_url: 'ws://192.168.1.20:8080/ws',
          ssh_url: 'ssh://map2@192.168.1.20',
          discovered_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          latency_ms: 1,
          ssh_trusted: true,
          is_online: true,
          discovery_sources: ['mdns'],
          registered: true,
          visible: true,
          registration_required: false,
          routing_ready: true,
          avb_enabled: true,
          discovered_via_mdns: true,
          discovered_via_peer_mdns: false,
          discovered_via_cluster_mdns: false,
        }],
      })
    }

    if (/^\/api\/peers\/[^/]+\/latency$/.test(pathname)) {
      return jsonResponse(route, 200, {
        peer_id: pathname.split('/')[3],
        measurements: [
          { timestamp: new Date().toISOString(), latency_ms: 1.1, success: true },
          { timestamp: new Date().toISOString(), latency_ms: 1.3, success: true },
        ],
        average_latency_ms: 1.2,
        min_latency_ms: 1.1,
        max_latency_ms: 1.3,
        packet_loss_percent: 0,
      })
    }

    if (pathname === '/api/midi/devices') {
      return jsonResponse(route, 200, {
        inputs: [{ name: 'Express 128', is_virtual: false, kind: 'alsa' }],
        outputs: [{ name: 'Express 128', is_virtual: false, kind: 'alsa' }],
      })
    }

    if (pathname === '/api/plugins/discover' || pathname === '/api/plugins/discover/') {
      return jsonResponse(route, 200, {
        plugins: [
          {
            uri: 'map2://juce/test-chorus',
            name: 'MAP2 Chorus',
            format_name: 'JUCE',
            is_native: true,
          },
        ],
      })
    }

    if (pathname === '/api/ir/' || pathname === '/api/ir') {
      return jsonResponse(route, 200, {
        active_cabinet: null,
        loaded_cabinet: null,
        active_reverb: null,
        loaded_reverb: null,
      })
    }

    if (pathname === '/api/ir/cabinets' || pathname === '/api/ir/reverbs') {
      return jsonResponse(route, 200, {
        irs: [],
        count: 0,
      })
    }

    if (pathname === '/api/nam/status') {
      return jsonResponse(route, 200, { activeModel: null })
    }

    if (pathname === '/api/nam/models') {
      return jsonResponse(route, 200, {
        models: [],
        total: 0,
      })
    }

    if (pathname === '/api/soundfonts/' || pathname === '/api/soundfonts') {
      return jsonResponse(route, 200, {
        soundfonts: [],
        total: 0,
      })
    }

    if (pathname === '/api/enriched-physical-surfaces/summary') {
      return jsonResponse(route, 200, {
        units: [
          { unit_id: 'ableton-push', display_name: 'Ableton Push', status: 'online' },
          { unit_id: 'maschine-mk1', display_name: 'Maschine MK1', status: 'attention' },
        ],
        notifications: [],
      })
    }

    if (pathname.startsWith('/api/enriched-physical-surfaces/')) {
      return jsonResponse(route, 200, {
        unit_id: pathname.split('/').pop(),
        display_name: 'Surface Unit',
        status: 'online',
      })
    }

    if (pathname === '/api/cluster/nodes') {
      return jsonResponse(route, 200, {
        nodes: [{
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
        }],
      })
    }

    if (pathname === '/api/cluster/metrics') {
      return jsonResponse(route, 200, {
        nodes: [{ node_id: 'node-1', cpu_usage_percent: 18, memory_usage_percent: 34 }],
      })
    }

    if (pathname.includes('/tesira')) {
      return jsonResponse(route, 200, { items: [], devices: [], status: 'ok' })
    }

    if (pathname.includes('/services') || pathname.includes('/metrics') || pathname.includes('/network')) {
      return jsonResponse(route, 200, {})
    }

    return jsonResponse(route, 200, {})
  })
}

async function captureRoute(page, route) {
  const relativePath = route.startsWith('/') ? route : `/${route}`
  const targetUrl = `${previewUrl}${relativePath}`
  const screenshotPath = path.join(screenshotDir, `${slugifyRoute(relativePath)}.png`)

  const consoleErrors = []
  const pageErrors = []
  const onConsole = (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  }
  const onPageError = (error) => {
    pageErrors.push(error?.stack ?? String(error))
  }

  page.on('console', onConsole)
  page.on('pageerror', onPageError)

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {})
    await page.locator('#root').waitFor({ state: 'attached', timeout: 8_000 })
    await page.locator('main').first().waitFor({ state: 'visible', timeout: 8_000 })
    await page.waitForTimeout(300)

    const errorBoundaryVisible = await page.getByText('This page hit a render or load error.').isVisible().catch(() => false)
    if (errorBoundaryVisible) {
      throw new Error(`Error boundary rendered for ${relativePath}`)
    }
  } catch (error) {
    const bodyText = await page.locator('body').innerText().catch(() => '')
    throw new Error([
      `${error instanceof Error ? error.message : String(error)}`,
      `Route: ${relativePath}`,
      `Body excerpt: ${bodyText.slice(0, 800) || '<empty>'}`,
      `Console errors: ${consoleErrors.length > 0 ? consoleErrors.join(' | ') : '<none>'}`,
      `Page errors: ${pageErrors.length > 0 ? pageErrors.join(' | ') : '<none>'}`,
    ].join('\n'))
  }

  const screenshot = await page.screenshot({
    path: screenshotPath,
    fullPage: true,
  })

  page.off('console', onConsole)
  page.off('pageerror', onPageError)

  return {
    route: relativePath,
    url: targetUrl,
    screenshot: path.relative(repoRoot, screenshotPath),
    bytes: screenshot.byteLength,
    consoleErrors,
    pageErrors,
  }
}

async function main() {
  const { chromium } = await import(playwrightModuleUrl.href)
  await mkdir(screenshotDir, { recursive: true })

  if (!process.argv.includes('--skip-build')) {
    await shell('npm', ['--prefix', 'web', 'run', 'build'])
  }

  const previewServer = startPreviewServer()
  try {
    await waitForServer(previewUrl)

    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    })

    await installBrowserMocks(page)

    const results = []
    for (const route of ROUTES) {
      process.stdout.write(`Capturing ${route}\n`)
      results.push(await captureRoute(page, route))
    }

    await browser.close()

    const summary = {
      generatedAt: new Date().toISOString(),
      viewport: VIEWPORT,
      routeCount: ROUTES.length,
      baseUrl: previewUrl,
      routes: results,
    }

    await writeFile(path.join(runDir, 'workspace-visual-smoke-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
    process.stdout.write(`Workspace visual smoke complete. Artifacts: ${path.relative(repoRoot, runDir)}\n`)
  } finally {
    previewServer.kill('SIGTERM')
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? String(error)}\n`)
  process.exitCode = 1
})
