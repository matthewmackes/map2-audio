import { Button, InlineLoading, Layer, Tag } from '@carbon/react'
import { useCallback, useState } from 'react'
import { maschineApi, type MaschineHwTestResponse } from '../../../map2/clients/maschine'

type TestId = 'led_walk' | 'led_all_on' | 'led_all_off' | 'lcd_checkerboard' | 'lcd_gradient' | 'lcd_clear' | 'pad_readback'

interface TestResult {
  test: TestId
  status: 'pass' | 'fail' | 'running'
  message: string
  timestamp: string
}

const TEST_DEFS: Array<{ id: TestId; label: string; description: string; group: 'led' | 'lcd' | 'input' }> = [
  { id: 'led_walk', label: 'LED Walk', description: 'Walks brightness through all 62 LED slots sequentially', group: 'led' },
  { id: 'led_all_on', label: 'All LEDs On', description: 'Sets all 62 slots to maximum brightness (255)', group: 'led' },
  { id: 'led_all_off', label: 'All LEDs Off', description: 'Clears all 62 LED slots to 0', group: 'led' },
  { id: 'lcd_checkerboard', label: 'LCD Checkerboard', description: 'Renders a checkerboard pattern on both displays', group: 'lcd' },
  { id: 'lcd_gradient', label: 'LCD Gradient', description: 'Renders a horizontal gradient on both displays', group: 'lcd' },
  { id: 'lcd_clear', label: 'LCD Clear', description: 'Clears both LCD displays to black', group: 'lcd' },
  { id: 'pad_readback', label: 'Pad Readback', description: 'Reads current pad state from EP 0x84 and reports pressure', group: 'input' },
]

function resultTagType(status: TestResult['status']): 'green' | 'red' | 'blue' {
  if (status === 'pass') return 'green'
  if (status === 'fail') return 'red'
  return 'blue'
}

export function MaschineHwTestPanel({ isConnected }: { isConnected: boolean }) {
  const [results, setResults] = useState<TestResult[]>([])
  const [runningTest, setRunningTest] = useState<TestId | null>(null)

  const runTest = useCallback(async (testId: TestId) => {
    setRunningTest(testId)
    setResults((prev) => [
      ...prev.filter((r) => r.test !== testId),
      { test: testId, status: 'running', message: 'Running...', timestamp: new Date().toISOString() },
    ])

    try {
      const response: MaschineHwTestResponse = await maschineApi.runHwTest({ test: testId })
      setResults((prev) =>
        prev.map((r) =>
          r.test === testId
            ? {
                ...r,
                status: response.status === 'ok' ? 'pass' : 'fail',
                message: String(response.result?.message ?? response.status),
                timestamp: new Date().toISOString(),
              }
            : r,
        ),
      )
    } catch (err) {
      setResults((prev) =>
        prev.map((r) =>
          r.test === testId
            ? { ...r, status: 'fail', message: String(err instanceof Error ? err.message : err), timestamp: new Date().toISOString() }
            : r,
        ),
      )
    } finally {
      setRunningTest(null)
    }
  }, [])

  const runAllTests = useCallback(async () => {
    for (const def of TEST_DEFS) {
      await runTest(def.id)
    }
  }, [runTest])

  const getResult = (testId: TestId): TestResult | undefined => results.find((r) => r.test === testId)
  const passCount = results.filter((r) => r.status === 'pass').length
  const failCount = results.filter((r) => r.status === 'fail').length

  return (
    <Layer className="maschine-page__panel maschine-test-suite" data-testid="maschine-hw-test-panel">
      <div className="maschine-page__panel-head">
        <h2>Hardware Test Suite</h2>
        <div className="maschine-page__tag-row">
          {results.length > 0 && <Tag type="green">{passCount} pass</Tag>}
          {failCount > 0 && <Tag type="red">{failCount} fail</Tag>}
          {results.length === 0 && <Tag type="cool-gray">No tests run</Tag>}
        </div>
      </div>
      <p className="maschine-page__panel-copy">
        Run hardware diagnostics against the physical MK1 device. Tests write to LEDs, LCDs, and read pad input via the USB bulk transport.
      </p>
      <div className="maschine-page__toolbar">
        <Button
          kind="primary"
          size="sm"
          onClick={() => void runAllTests()}
          disabled={!isConnected || runningTest !== null}
        >
          Run All Tests
        </Button>
        <Button
          kind="ghost"
          size="sm"
          onClick={() => setResults([])}
          disabled={results.length === 0}
        >
          Clear Results
        </Button>
        {!isConnected && <Tag type="red">Device not connected</Tag>}
      </div>

      {(['led', 'lcd', 'input'] as const).map((group) => {
        const groupTests = TEST_DEFS.filter((d) => d.group === group)
        return (
          <div key={group}>
            <span className="maschine-led__group-title">{group === 'led' ? 'LED Tests' : group === 'lcd' ? 'LCD Tests' : 'Input Tests'}</span>
            <div className="maschine-test-suite__results">
              {groupTests.map((def) => {
                const result = getResult(def.id)
                const cardClass = result
                  ? `maschine-test-suite__result-card maschine-test-suite__result-card--${result.status}`
                  : 'maschine-test-suite__result-card'
                return (
                  <div key={def.id} className={cardClass}>
                    <div className="maschine-page__panel-head">
                      <strong>{def.label}</strong>
                      {result && <Tag type={resultTagType(result.status)} size="sm">{result.status}</Tag>}
                    </div>
                    <p className="maschine-page__panel-copy" style={{ fontSize: '0.75rem' }}>{def.description}</p>
                    {result?.status === 'running' ? (
                      <InlineLoading description="Running..." />
                    ) : (
                      <Button
                        kind="ghost"
                        size="sm"
                        onClick={() => void runTest(def.id)}
                        disabled={!isConnected || runningTest !== null}
                      >
                        {result ? 'Re-run' : 'Run'}
                      </Button>
                    )}
                    {result && result.status !== 'running' && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--cds-text-secondary)', fontFamily: 'var(--cds-code-02-font-family, monospace)' }}>
                        {result.message}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </Layer>
  )
}

export default MaschineHwTestPanel
