import { useState, useEffect } from 'react'
import { CheckCircle, WarningCircle, XCircle, ArrowsClockwise, Pulse } from '@phosphor-icons/react'

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
  categories?: { [key: string]: any }
  recommendations?: Array<{
    type: string
    title: string
    description: string
    priority: string
  }>
}

interface TestStatusProps {
  showDetails?: boolean
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
    } catch (err) {
      setError('Failed to fetch test results')
    } finally {
      setLoading(false)
    }
  }

  const runNewTest = async () => {
    setRunningTest(true)
    try {
      const response = await fetch('/api/system-tests/test/pipedal/run', {
        method: 'POST'
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.status === 'completed') {
          // Refresh the test results
          await fetchTestResult()
        }
      } else {
        setError('Failed to run test')
      }
    } catch (err) {
      setError('Failed to run test')
    } finally {
      setRunningTest(false)
    }
  }

  useEffect(() => {
    fetchTestResult()
    
    // Auto-refresh every 30 seconds if test was recent
    const interval = setInterval(() => {
      if (testResult) {
        const testTime = new Date(testResult.timestamp)
        const now = new Date()
        const diffMinutes = (now.getTime() - testTime.getTime()) / (1000 * 60)
        
        // Only auto-refresh if test is less than 5 minutes old
        if (diffMinutes < 5) {
          fetchTestResult()
        }
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [testResult])

  const getStatusIcon = (status: string, score: number) => {
    if (status === 'excellent' || score >= 90) {
      return <CheckCircle className="text-green-500" size={20} weight="duotone" />
    } else if (status === 'good' || score >= 75) {
      return <CheckCircle className="text-blue-500" size={20} weight="duotone" />
    } else if (status === 'fair' || score >= 50) {
      return <WarningCircle className="text-yellow-500" size={20} weight="duotone" />
    } else {
      return <XCircle className="text-red-500" size={20} weight="duotone" />
    }
  }

  const getStatusColor = (status: string, score: number) => {
    if (status === 'excellent' || score >= 90) return 'text-green-600'
    if (status === 'good' || score >= 75) return 'text-blue-600'
    if (status === 'fair' || score >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes} min ago`
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hrs ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center gap-3">
          <Pulse className="animate-pulse" size={20} weight="duotone" />
          <span>Loading PipeDAL test results...</span>
        </div>
      </div>
    )
  }

  if (error && !testResult) {
    return (
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <XCircle className="text-gray-400" size={20} weight="duotone" />
            <div>
              <h3 className="font-semibold">PipeDAL Engine Test</h3>
              <p className="text-sm text-gray-600">{error}</p>
            </div>
          </div>
          <button
            onClick={runNewTest}
            disabled={runningTest}
            className="btn btn-primary btn-sm"
          >
            {runningTest ? (
              <>
                <ArrowsClockwise className="animate-spin" size={16} weight="duotone" />
                Running...
              </>
            ) : (
              'Run Test'
            )}
          </button>
        </div>
      </div>
    )
  }

  if (!testResult) return null

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {getStatusIcon(testResult.overall_status, testResult.score)}
          <div>
            <h3 className="font-semibold">PipeDAL Engine Test</h3>
            <p className="text-sm text-gray-600">
              Last run {formatTimestamp(testResult.timestamp)}
            </p>
          </div>
        </div>
        <button
          onClick={runNewTest}
          disabled={runningTest}
          className="btn btn-ghost btn-sm"
        >
          {runningTest ? (
            <ArrowsClockwise className="animate-spin" size={16} weight="duotone" />
          ) : (
            <ArrowsClockwise size={16} weight="duotone" />
          )}
        </button>
      </div>

      {/* Main Status Display */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="stat-card">
          <div className="stat-label">Overall Score</div>
          <div className={`text-2xl font-bold ${getStatusColor(testResult.overall_status, testResult.score)}`}>
            {testResult.score}/100
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Tests Passed</div>
          <div className="text-2xl font-bold">
            {testResult.passed_tests}/{testResult.total_tests}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Engine Status</div>
          <div className={`font-semibold capitalize ${getStatusColor(testResult.overall_status, testResult.score)}`}>
            {testResult.overall_status}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Test Duration</div>
          <div className="font-semibold">
            {testResult.duration_seconds.toFixed(1)}s
          </div>
        </div>
      </div>

      {/* Engine Information */}
      {testResult.engine_info && (
        <div className="mb-4">
          <h4 className="font-medium mb-2">Engine Information</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {testResult.engine_info.version && (
              <div>
                <span className="text-gray-600">Version:</span>
                <div className="font-mono">{testResult.engine_info.version}</div>
              </div>
            )}
            {testResult.engine_info.plugin_count && (
              <div>
                <span className="text-gray-600">Plugins:</span>
                <div className="font-semibold">{testResult.engine_info.plugin_count}</div>
              </div>
            )}
            {testResult.engine_info.sample_rate && (
              <div>
                <span className="text-gray-600">Sample Rate:</span>
                <div className="font-mono">{testResult.engine_info.sample_rate}Hz</div>
              </div>
            )}
            {testResult.engine_info.buffer_size && (
              <div>
                <span className="text-gray-600">Buffer Size:</span>
                <div className="font-mono">{testResult.engine_info.buffer_size}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detailed Results */}
      {showDetails && testResult.categories && (
        <div className="mb-4">
          <h4 className="font-medium mb-2">Test Categories</h4>
          <div className="space-y-2">
            {Object.entries(testResult.categories).map(([name, category]: [string, any]) => (
              <div key={name} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                <span className="font-medium">{name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {category.passed_tests}/{category.total_tests}
                  </span>
                  {category.status === 'passed' ? (
                    <CheckCircle className="text-green-500" size={16} weight="duotone" />
                  ) : category.status === 'partial' ? (
                    <WarningCircle className="text-yellow-500" size={16} weight="duotone" />
                  ) : (
                    <XCircle className="text-red-500" size={16} weight="duotone" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {testResult.recommendations && testResult.recommendations.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Recommendations</h4>
          <div className="space-y-2">
            {testResult.recommendations.slice(0, 3).map((rec, index) => (
              <div 
                key={index} 
                className={`p-3 rounded-lg border-l-4 ${
                  rec.priority === 'high' ? 'border-red-400 bg-red-50' :
                  rec.priority === 'medium' ? 'border-yellow-400 bg-yellow-50' :
                  'border-blue-400 bg-blue-50'
                }`}
              >
                <div className="font-medium">{rec.title}</div>
                <div className="text-sm text-gray-600">{rec.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}