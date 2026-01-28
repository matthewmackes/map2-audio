import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Key, ExternalLink, Check, AlertCircle, Loader2, RefreshCw, Download, X } from 'lucide-react'
import { irLibraryApi } from '../../../map2/api'
import { useDownloadProgress } from '../../hooks/useDownloadProgress'

export function Tone3000Config() {
  const [apiKey, setApiKey] = useState('')
  const [showInput, setShowInput] = useState(false)
  const queryClient = useQueryClient()
  const { startDownload, isDownloading, isStarting, status: downloadStatus, cancelDownload, isCancelling } = useDownloadProgress()

  // Find tone3000 source progress
  const tone3000Progress = downloadStatus?.sources?.find(s => s.name === 'tone3000')
  const isTone3000Active = tone3000Progress && ['discovering', 'downloading'].includes(tone3000Progress.state)

  const statusQuery = useQuery({
    queryKey: ['tone3000', 'status'],
    queryFn: irLibraryApi.getTone3000Status,
  })

  const setApiKeyMutation = useMutation({
    mutationFn: (key: string) => irLibraryApi.setTone3000ApiKey(key),
    onSuccess: () => {
      setApiKey('')
      setShowInput(false)
      queryClient.invalidateQueries({ queryKey: ['tone3000'] })
    },
  })

  const testAuthMutation = useMutation({
    mutationFn: irLibraryApi.testTone3000Auth,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tone3000'] })
    },
  })

  const status = statusQuery.data
  const isConfigured = status?.configured ?? false
  const isAuthenticated = status?.authenticated ?? false

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      setApiKeyMutation.mutate(apiKey.trim())
    }
  }

  return (
    <div className="card" style={{ padding: 16, borderLeft: '3px solid #8b5cf6' }}>
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div className="flex" style={{ gap: 10, alignItems: 'center' }}>
          <Key size={20} style={{ color: '#8b5cf6' }} />
          <span style={{ fontWeight: 600 }}>TONE3000 Configuration</span>
          {isConfigured && (
            <span
              className="badge"
              style={{
                background: isAuthenticated ? 'var(--success-bg)' : 'var(--warning-bg)',
                color: isAuthenticated ? 'var(--success)' : 'var(--warning)'
              }}
            >
              {isAuthenticated ? 'Connected' : 'Configured'}
            </span>
          )}
        </div>
        {isConfigured && (
          <div className="flex" style={{ gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => startDownload({ sources: ['tone3000'], parallel: 4, skip_existing: true })}
              disabled={isDownloading || isStarting}
            >
              {isStarting ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Download size={14} />
              )}
              Download Top 10
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => testAuthMutation.mutate()}
              disabled={testAuthMutation.isPending}
            >
              {testAuthMutation.isPending ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Test
            </button>
          </div>
        )}
      </div>

      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        TONE3000 is the largest NAM model community. Connect your account to download trending amp models.
      </p>

      {/* Download Progress */}
      {(isTone3000Active || (tone3000Progress && tone3000Progress.state === 'completed')) && (
        <div className="card" style={{ padding: 12, marginBottom: 12, background: 'var(--bg-secondary)' }}>
          <div className="flex-between" style={{ marginBottom: 8 }}>
            <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
              {tone3000Progress?.state === 'discovering' && (
                <>
                  <Loader2 size={14} className="spin" style={{ color: '#8b5cf6' }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Discovering NAM models...</span>
                </>
              )}
              {tone3000Progress?.state === 'downloading' && (
                <>
                  <Loader2 size={14} className="spin" style={{ color: '#8b5cf6' }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Downloading NAM models...</span>
                </>
              )}
              {tone3000Progress?.state === 'completed' && (
                <>
                  <Check size={14} style={{ color: 'var(--success)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--success)' }}>Download complete!</span>
                </>
              )}
              {tone3000Progress?.state === 'failed' && (
                <>
                  <AlertCircle size={14} style={{ color: 'var(--danger)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--danger)' }}>Download failed</span>
                </>
              )}
            </div>
            {isTone3000Active && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => cancelDownload()}
                disabled={isCancelling}
                style={{ padding: '4px 8px' }}
              >
                {isCancelling ? <Loader2 size={12} className="spin" /> : <X size={12} />}
              </button>
            )}
          </div>

          {/* Progress bar */}
          {tone3000Progress && tone3000Progress.total_files > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{
                height: 6,
                background: 'var(--border)',
                borderRadius: 3,
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  width: `${Math.round(((tone3000Progress.downloaded + tone3000Progress.skipped) / tone3000Progress.total_files) * 100)}%`,
                  background: tone3000Progress.state === 'completed' ? 'var(--success)' : '#8b5cf6',
                  borderRadius: 3,
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="flex" style={{ gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
            {tone3000Progress?.discovered > 0 && (
              <span>Found: {tone3000Progress.discovered}</span>
            )}
            {tone3000Progress && tone3000Progress.total_files > 0 && (
              <>
                <span>Downloaded: {tone3000Progress.downloaded}/{tone3000Progress.total_files}</span>
                {tone3000Progress.skipped > 0 && <span>Skipped: {tone3000Progress.skipped}</span>}
                {tone3000Progress.failed > 0 && <span style={{ color: 'var(--danger)' }}>Failed: {tone3000Progress.failed}</span>}
              </>
            )}
          </div>

          {/* Current file */}
          {tone3000Progress?.current_file && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              Downloading: {tone3000Progress.current_file}
            </div>
          )}
        </div>
      )}

      {!isConfigured && !showInput && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="flex" style={{ gap: 8 }}>
            <a
              href={status?.auth_url || 'https://www.tone3000.com/api/v1/auth'}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
            >
              <ExternalLink size={14} />
              Get API Key
            </a>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowInput(true)}
            >
              <Key size={14} />
              Enter Key
            </button>
          </div>
          <p className="muted" style={{ fontSize: 11 }}>
            1. Click "Get API Key" to authenticate with TONE3000<br />
            2. Copy the API key from the redirect URL<br />
            3. Paste it here
          </p>
        </div>
      )}

      {(showInput || isConfigured) && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="flex" style={{ gap: 8 }}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isConfigured ? '••••••••••••••••' : 'Paste API key here'}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                fontSize: 13,
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSaveApiKey}
              disabled={!apiKey.trim() || setApiKeyMutation.isPending}
            >
              {setApiKeyMutation.isPending ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Check size={14} />
              )}
              Save
            </button>
          </div>

          {setApiKeyMutation.isError && (
            <div className="flex" style={{ gap: 6, color: 'var(--danger)', fontSize: 12, flexWrap: 'wrap' }}>
              <AlertCircle size={12} />
              <span>Failed to save API key: {setApiKeyMutation.error instanceof Error ? setApiKeyMutation.error.message : String(setApiKeyMutation.error)}</span>
            </div>
          )}
        </div>
      )}

      {testAuthMutation.data && (
        <div style={{ marginTop: 12 }}>
          {testAuthMutation.data.authenticated ? (
            <div className="card" style={{ padding: 12, background: 'var(--success-bg)' }}>
              <div className="flex" style={{ gap: 6, color: 'var(--success)', marginBottom: 8 }}>
                <Check size={14} />
                <span style={{ fontWeight: 500, fontSize: 13 }}>Authentication successful!</span>
              </div>
              {testAuthMutation.data.sample_models && testAuthMutation.data.sample_models.length > 0 && (
                <div style={{ fontSize: 12 }}>
                  <span className="muted">Sample models found:</span>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {testAuthMutation.data.sample_models.slice(0, 3).map((model, i) => (
                      <li key={i} style={{ color: 'var(--text-secondary)' }}>
                        {model.name} by {model.author}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="card" style={{ padding: 12, background: 'var(--danger-bg)' }}>
              <div className="flex" style={{ gap: 6, color: 'var(--danger)' }}>
                <AlertCircle size={14} />
                <span style={{ fontSize: 13 }}>{testAuthMutation.data.message || 'Authentication failed'}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {status?.token_expires && (
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Token expires: {new Date(status.token_expires).toLocaleString()}
        </p>
      )}
    </div>
  )
}
