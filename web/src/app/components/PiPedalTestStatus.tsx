import { useEffect, useState } from 'react'
import { Activity as Pulse, CheckmarkFilled as CheckCircle, ErrorFilled as XCircle, Renew as ArrowsClockwise, WarningAlt as WarningCircle } from '@carbon/icons-react'
import { Button, Tag, Tile } from '@carbon/react'

interface PiPedalTestResult {
  timestamp: string
  score: number
  passed_tests: number
  total_tests: number
  overall_status: string
  duration_seconds: number
  engine_info?: {
    version?: string
    plugin_count?: number
    sample_rate?: number
    buffer_size?: number
  }
  categories?: Record<string, {
    status?: string
    passed_tests?: number
    total_tests?: number
  }>
  recommendations?: Array<{
    title: string
    description: string
    priority: string
  }>
}

interface TestStatusProps {
  showDetails?: boolean
}

const CARD_TITLE_STYLE = { color: 'var(--text-secondary)', fontSize: 'var(--type-body)' } as const

function getStatusTone(status: string, score: number): 'green' | 'blue' | 'warm-gray' | 'red' {
  if (status === 'excellent' || score >= 90) return 'green'
  if (status === 'good' || score >= 75) return 'blue'
  if (status === 'fair' || score >= 50) return 'warm-gray'
  return 'red'
}

function getStatusIcon(status: string, score: number) {
  const tone = getStatusTone(status, score)
  const color =
    tone === 'green'
      ? 'var(--support-success)'
      : tone === 'blue'
        ? 'var(--interactive)'
        : tone === 'warm-gray'
          ? 'var(--support-warning)'
          : 'var(--support-danger)'
  const Icon = tone === 'warm-gray' ? WarningCircle : tone === 'red' ? XCircle : CheckCircle
  return <Icon size={20} style={{ color }} />
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hrs ago`
  return date.toLocaleDateString()
}

export function PiPedalTestStatus({ showDetails = true }: TestStatusProps) {
  const [testResult, setTestResult] = useState<PiPedalTestResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [runningTest, setRunningTest] = useState(false)

  const fetchTestResult = async () => {
    try {
      const response = await fetch('/api/system-tests/test/pipedal/latest')
      if (response.ok) {
        const data = await response.json()
        setTestResult(data)
        setError(null)
      } else {
        setError('No test results available')
      }
    } catch {
      setError('Failed to fetch test results')
    } finally {
      setLoading(false)
    }
  }

  const runNewTest = async () => {
    setRunningTest(true)
    try {
      const response = await fetch('/api/system-tests/test/pipedal/run', { method: 'POST' })
      if (response.ok) {
        const result = await response.json()
        if (result.status === 'completed') {
          await fetchTestResult()
        }
      } else {
        setError('Failed to run test')
      }
    } catch {
      setError('Failed to run test')
    } finally {
      setRunningTest(false)
    }
  }

  useEffect(() => {
    fetchTestResult()

    const interval = setInterval(() => {
      if (!testResult) return
      const testTime = new Date(testResult.timestamp)
      const now = new Date()
      const diffMinutes = (now.getTime() - testTime.getTime()) / (1000 * 60)
      if (diffMinutes < 5) {
        fetchTestResult()
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [testResult])

  if (loading) {
    return (
      <Tile>
        <div className="flex items-center gap-3">
          <Pulse className="animate-pulse" size={20} style={{ color: 'var(--interactive)' }} />
          <span>Loading PipeDAL test results...</span>
        </div>
      </Tile>
    )
  }

  if (error && !testResult) {
    return (
      <Tile>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <XCircle size={20} style={{ color: 'var(--support-danger)' }} />
            <div>
              <h3 className="font-semibold">PipeDAL engine test</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
            </div>
          </div>
          <Button kind="primary" size="sm" renderIcon={ArrowsClockwise} onClick={runNewTest} disabled={runningTest}>
            {runningTest ? 'Running…' : 'Run test'}
          </Button>
        </div>
      </Tile>
    )
  }

  if (!testResult) return null

  const tone = getStatusTone(testResult.overall_status, testResult.score)

  return (
    <Tile style={{ display: 'grid', gap: 16 }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {getStatusIcon(testResult.overall_status, testResult.score)}
          <div>
            <h3 className="font-semibold">PipeDAL engine test</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Last run {formatTimestamp(testResult.timestamp)}
            </p>
          </div>
        </div>
        <Button kind="ghost" size="sm" renderIcon={ArrowsClockwise} onClick={runNewTest} disabled={runningTest}>
          {runningTest ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile>
          <div style={CARD_TITLE_STYLE}>Overall score</div>
          <div style={{ fontSize: 'var(--type-heading)', color: tone === 'green' ? 'var(--support-success)' : tone === 'blue' ? 'var(--interactive)' : tone === 'warm-gray' ? 'var(--support-warning)' : 'var(--support-danger)' }}>
            {testResult.score}/100
          </div>
        </Tile>
        <Tile>
          <div style={CARD_TITLE_STYLE}>Tests passed</div>
          <div style={{ fontSize: 'var(--type-heading)' }}>
            {testResult.passed_tests}/{testResult.total_tests}
          </div>
        </Tile>
        <Tile>
          <div style={CARD_TITLE_STYLE}>Engine status</div>
          <div style={{ marginTop: 8 }}>
            <Tag type={tone}>{testResult.overall_status}</Tag>
          </div>
        </Tile>
        <Tile>
          <div style={CARD_TITLE_STYLE}>Test duration</div>
          <div style={{ fontSize: 'var(--type-heading)' }}>{testResult.duration_seconds.toFixed(1)}s</div>
        </Tile>
      </div>

      {testResult.engine_info && (
        <div>
          <h4 className="font-medium mb-2">Engine information</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {testResult.engine_info.version ? (
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Version:</span>
                <div className="font-mono">{testResult.engine_info.version}</div>
              </div>
            ) : null}
            {testResult.engine_info.plugin_count ? (
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Plugins:</span>
                <div className="font-semibold">{testResult.engine_info.plugin_count}</div>
              </div>
            ) : null}
            {testResult.engine_info.sample_rate ? (
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Sample rate:</span>
                <div className="font-mono">{testResult.engine_info.sample_rate}Hz</div>
              </div>
            ) : null}
            {testResult.engine_info.buffer_size ? (
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Buffer size:</span>
                <div className="font-mono">{testResult.engine_info.buffer_size}</div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {showDetails && testResult.categories ? (
        <div>
          <h4 className="font-medium mb-2">Test categories</h4>
          <div className="space-y-2">
            {Object.entries(testResult.categories).map(([name, category]) => (
              <Tile key={name} style={{ padding: 12 }}>
                <div className="flex justify-between items-center gap-3">
                  <span className="font-medium">{name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {category.passed_tests ?? 0}/{category.total_tests ?? 0}
                    </span>
                    {category.status === 'passed'
                      ? <CheckCircle size={16} style={{ color: 'var(--support-success)' }} />
                      : category.status === 'partial'
                        ? <WarningCircle size={16} style={{ color: 'var(--support-warning)' }} />
                        : <XCircle size={16} style={{ color: 'var(--support-danger)' }} />}
                  </div>
                </div>
              </Tile>
            ))}
          </div>
        </div>
      ) : null}

      {testResult.recommendations && testResult.recommendations.length > 0 ? (
        <div>
          <h4 className="font-medium mb-2">Recommendations</h4>
          <div className="space-y-2">
            {testResult.recommendations.slice(0, 3).map((rec, index) => (
              <Tile
                key={index}
                style={{
                  padding: 12,
                  borderLeft: `3px solid ${
                    rec.priority === 'high'
                      ? 'var(--support-danger)'
                      : rec.priority === 'medium'
                        ? 'var(--support-warning)'
                        : 'var(--interactive)'
                  }`,
                }}
              >
                <div className="font-medium">{rec.title}</div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{rec.description}</div>
              </Tile>
            ))}
          </div>
        </div>
      ) : null}
    </Tile>
  )
}
