import { useMemo, useState } from 'react'
import {
  Button,
  InlineLoading,
  InlineNotification,
  ProgressBar,
  Tag,
  TextInput,
} from '@carbon/react'
import {
  CheckmarkFilled,
  Close,
  Download,
  Launch,
  Renew,
} from '@carbon/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { irLibraryApi } from '../../../map2/api'
import { useDownloadProgress } from '../../hooks/useDownloadProgress'
import './Tone3000Config.css'

const DEFAULT_AUTH_URL = 'https://www.tone3000.com/api/v1/auth'

function mapProgressStateToTag(progressState?: string): 'purple' | 'green' | 'red' | 'gray' {
  switch (progressState) {
    case 'discovering':
    case 'downloading':
      return 'purple'
    case 'completed':
      return 'green'
    case 'failed':
      return 'red'
    default:
      return 'gray'
  }
}

function mapProgressStateToLabel(progressState?: string): string {
  switch (progressState) {
    case 'discovering':
      return 'Discovering models'
    case 'downloading':
      return 'Downloading models'
    case 'completed':
      return 'Download complete'
    case 'failed':
      return 'Download failed'
    default:
      return 'Idle'
  }
}

function mapProgressStateToBarStatus(progressState?: string): 'active' | 'finished' | 'error' {
  if (progressState === 'completed') {
    return 'finished'
  }

  if (progressState === 'failed') {
    return 'error'
  }

  return 'active'
}

export function Tone3000Config() {
  const [apiKey, setApiKey] = useState('')
  const [showInput, setShowInput] = useState(false)
  const queryClient = useQueryClient()
  const {
    startDownload,
    isDownloading,
    isStarting,
    status: downloadStatus,
    cancelDownload,
    isCancelling,
  } = useDownloadProgress()

  const tone3000Progress = downloadStatus?.sources?.find((source) => source.name === 'tone3000')
  const isTone3000Active = Boolean(
    tone3000Progress && ['discovering', 'downloading'].includes(tone3000Progress.state),
  )

  const tone3000Percent = useMemo(() => {
    if (!tone3000Progress || tone3000Progress.total_files <= 0) {
      return 0
    }

    return Math.min(
      100,
      Math.round(((tone3000Progress.downloaded + tone3000Progress.skipped) / tone3000Progress.total_files) * 100),
    )
  }, [tone3000Progress])

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tone3000'] })
    },
  })

  const status = statusQuery.data
  const isConfigured = status?.configured ?? false
  const isAuthenticated = status?.authenticated ?? false

  const handleSaveApiKey = () => {
    const trimmedKey = apiKey.trim()
    if (trimmedKey) {
      setApiKeyMutation.mutate(trimmedKey)
    }
  }

  const handleDownloadCabinetIrs = () => {
    startDownload({ sources: ['djammincabs', 'overdriven'], parallel: 4, skip_existing: true })
  }

  const renderProgress =
    tone3000Progress &&
    (isTone3000Active || tone3000Progress.state === 'completed' || tone3000Progress.state === 'failed')

  return (
    <section className="tone3000-config">
      <div className="tone3000-config__header">
        <div className="tone3000-config__header-main">
          <span className="tone3000-config__title">Tone3000 configuration</span>
          {isConfigured ? (
            <Tag type={isAuthenticated ? 'green' : 'cyan'}>{isAuthenticated ? 'Connected' : 'Configured'}</Tag>
          ) : null}
        </div>

        {isConfigured ? (
          <div className="tone3000-config__actions">
            <Button
              kind="primary"
              size="sm"
              renderIcon={Download}
              disabled={isDownloading || isStarting}
              onClick={() => {
                startDownload({ sources: ['tone3000'], parallel: 4, skip_existing: true })
              }}
            >
              Download top 10 NAM models
            </Button>
            <Button
              kind="primary"
              size="sm"
              renderIcon={Download}
              disabled={isDownloading || isStarting}
              onClick={() => {
                startDownload({ sources: ['tone3000'], parallel: 4, skip_existing: true })
              }}
            >
              Download top 25 trending amp heads
            </Button>
            <Button
              kind="secondary"
              size="sm"
              renderIcon={Download}
              disabled={isDownloading || isStarting}
              onClick={handleDownloadCabinetIrs}
            >
              Download cabinet IRs
            </Button>
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Renew}
              disabled={testAuthMutation.isPending}
              onClick={() => {
                testAuthMutation.mutate()
              }}
            >
              Test authentication
            </Button>
          </div>
        ) : null}
      </div>

      <p className="tone3000-config__description">
        Tone3000 is the largest NAM model community. Connect your account to download trending amp models.
      </p>

      {isStarting ? <InlineLoading description="Starting download..." /> : null}

      {renderProgress ? (
        <div className="tone3000-config__progress">
          <div className="tone3000-config__progress-header">
            <Tag type={mapProgressStateToTag(tone3000Progress.state)}>
              {mapProgressStateToLabel(tone3000Progress.state)}
            </Tag>

            {isTone3000Active ? (
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Close}
                iconDescription="Cancel download"
                disabled={isCancelling}
                onClick={() => {
                  cancelDownload()
                }}
              >
                Cancel download
              </Button>
            ) : null}
          </div>

          {isTone3000Active ? (
            <InlineLoading
              description={
                tone3000Progress.state === 'discovering'
                  ? 'Discovering Tone3000 models...'
                  : 'Downloading Tone3000 models...'
              }
            />
          ) : null}

          {tone3000Progress.total_files > 0 ? (
            <ProgressBar
              label="Tone3000 download progress"
              hideLabel
              size="small"
              value={tone3000Percent}
              max={100}
              status={mapProgressStateToBarStatus(tone3000Progress.state)}
              helperText={`${tone3000Percent}% complete`}
            />
          ) : null}

          <div className="tone3000-config__progress-stats">
            {tone3000Progress.discovered > 0 ? <span>Found: {tone3000Progress.discovered}</span> : null}
            {tone3000Progress.total_files > 0 ? (
              <>
                <span>
                  Downloaded: {tone3000Progress.downloaded}/{tone3000Progress.total_files}
                </span>
                {tone3000Progress.skipped > 0 ? <span>Skipped: {tone3000Progress.skipped}</span> : null}
                {tone3000Progress.failed > 0 ? <span>Failed: {tone3000Progress.failed}</span> : null}
              </>
            ) : null}
          </div>

          {tone3000Progress.current_file ? (
            <p className="tone3000-config__current-file">Downloading: {tone3000Progress.current_file}</p>
          ) : null}
        </div>
      ) : null}

      {!isConfigured && !showInput ? (
        <div className="tone3000-config__setup">
          <div className="tone3000-config__setup-actions">
            <Button
              kind="primary"
              size="sm"
              renderIcon={Launch}
              href={status?.auth_url || DEFAULT_AUTH_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get API key
            </Button>
            <Button
              kind="ghost"
              size="sm"
              onClick={() => {
                setShowInput(true)
              }}
            >
              Enter key
            </Button>
          </div>

          <ol className="tone3000-config__setup-steps">
            <li>Open the Tone3000 authentication link and sign in.</li>
            <li>Copy the API key from the redirect URL.</li>
            <li>Paste the key below and save it.</li>
          </ol>
        </div>
      ) : null}

      {showInput || isConfigured ? (
        <div className="tone3000-config__credentials">
          <TextInput
            id="tone3000-api-key"
            className="tone3000-config__text-input"
            type="password"
            labelText="Tone3000 API key"
            value={apiKey}
            placeholder={isConfigured ? '••••••••••••••••' : 'Paste API key here'}
            onChange={(event) => setApiKey(event.currentTarget.value)}
          />

          <div className="tone3000-config__credentials-actions">
            <Button
              kind="primary"
              size="sm"
              renderIcon={CheckmarkFilled}
              disabled={!apiKey.trim() || setApiKeyMutation.isPending}
              onClick={handleSaveApiKey}
            >
              Save API key
            </Button>
            {showInput && !isConfigured ? (
              <Button
                kind="ghost"
                size="sm"
                onClick={() => {
                  setShowInput(false)
                  setApiKey('')
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>

          {setApiKeyMutation.isPending ? <InlineLoading description="Saving API key..." /> : null}

          {setApiKeyMutation.isError ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="Failed to save API key"
              subtitle={
                setApiKeyMutation.error instanceof Error
                  ? setApiKeyMutation.error.message
                  : String(setApiKeyMutation.error)
              }
            />
          ) : null}
        </div>
      ) : null}

      {testAuthMutation.data ? (
        testAuthMutation.data.authenticated ? (
          <InlineNotification
            kind="success"
            lowContrast
            hideCloseButton
            title="Authentication successful"
            subtitle="Tone3000 credentials are valid and model access is available."
          />
        ) : (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Authentication failed"
            subtitle={testAuthMutation.data.message || 'Authentication failed'}
          />
        )
      ) : null}

      {testAuthMutation.data?.authenticated && testAuthMutation.data.sample_models?.length ? (
        <div className="tone3000-config__sample-models">
          <span className="tone3000-config__sample-title">Sample models</span>
          <ul>
            {testAuthMutation.data.sample_models.slice(0, 3).map((model) => (
              <li key={`${model.name}-${model.author}`}>
                {model.name} by {model.author}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {status?.token_expires ? (
        <p className="tone3000-config__expiry">Token expires: {new Date(status.token_expires).toLocaleString()}</p>
      ) : null}
    </section>
  )
}
