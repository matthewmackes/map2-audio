import { useState } from 'react'
import { CheckmarkFilled as Check, ChevronDown as CaretDown, ChevronUp as CaretUp, Close as X, Download as DownloadSimple, Pause, Play, Renew as ArrowsClockwise, Reset as ArrowCounterClockwise, Renew as SpinnerGap, Search as MagnifyingGlass, WarningAlt as WarningCircle } from '@carbon/icons-react'
import { useDownloadProgress } from '../../hooks/useDownloadProgress'
import type { SourceProgress } from '../../types/library'
import '../upload/UploadPrimitives.css'

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}m ${secs}s`
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + '/s'
}

function getStateColor(state: SourceProgress['state']): string {
  switch (state) {
    case 'completed': return 'var(--success)'
    case 'failed': return 'var(--danger)'
    case 'downloading': return 'var(--primary)'
    case 'discovering': return 'var(--warning)'
    default: return 'var(--muted)'
  }
}

function getStateIcon(state: SourceProgress['state']) {
  switch (state) {
    case 'completed': return <Check size={12} />
    case 'failed': return <WarningCircle size={12} />
    case 'downloading': return <SpinnerGap size={12} className="spin" />
    case 'discovering': return <MagnifyingGlass size={12} />
    default: return null
  }
}

export function DownloadManager() {
  const [showSources, setShowSources] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const {
    status,
    fileTasks,
    isDownloading,
    isPaused,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    isCancelling,
    isPausing,
    isResuming,
    resetDownload,
    retrySource,
  } = useDownloadProgress()

  if (!status) return null

  const stats = status.stats
  const progress = status.progress_percent
  const sources = status.sources

  // Calculate speed and ETA
  let speed = 0
  let eta = 0
  let remaining = 0
  let speedDisplay = '0 files/s'

  if (stats && stats.duration_seconds > 0) {
    speed = stats.downloaded / stats.duration_seconds
    remaining = stats.total_files - stats.downloaded - stats.failed - stats.skipped
    eta = remaining / Math.max(0.1, speed)
    speedDisplay = `${speed.toFixed(1)} files/s`
  }

  const hasFailedSources = sources?.some(s => s.state === 'failed' || s.failed > 0)
  const isComplete = !isDownloading && stats && stats.total_files > 0

  return (
    <div className="card" style={{ padding: 16 }}>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div className="flex" style={{ gap: 10, alignItems: 'center' }}>
          {isDownloading ? (
            <SpinnerGap size={20} className="spin" style={{ color: 'var(--primary)' }} />
          ) : isPaused ? (
            <WarningCircle size={20} style={{ color: 'var(--warning)' }} />
          ) : hasFailedSources ? (
            <WarningCircle size={20} style={{ color: 'var(--warning)' }} />
          ) : (
            <DownloadSimple size={20} style={{ color: 'var(--success)' }} />
          )}
          <span style={{ fontWeight: 600 }}>
            {isDownloading ? (isPaused ? 'Download Paused' : 'Downloading IRs...') : hasFailedSources ? 'Download Complete (with errors)' : 'Download Complete'}
          </span>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          {isComplete && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => resetDownload()}
              title="Clear status"
            >
              <ArrowCounterClockwise size={14} />
            </button>
          )}
          {isDownloading && isPaused && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => resumeDownload()}
              disabled={isResuming}
              title="Resume download"
            >
              {isResuming ? (
                <>
                  <SpinnerGap size={14} className="spin" />
                  Resuming...
                </>
              ) : (
                <>
                  <Play size={14} />
                  Resume
                </>
              )}
            </button>
          )}
          {isDownloading && !isPaused && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => pauseDownload()}
              disabled={isPausing}
              title="Pause download"
            >
              {isPausing ? (
                <>
                  <SpinnerGap size={14} className="spin" />
                  Pausing...
                </>
              ) : (
                <>
                  <Pause size={14} />
                  Pause
                </>
              )}
            </button>
          )}
          {isDownloading && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => cancelDownload()}
              disabled={isCancelling}
              style={{ color: 'var(--danger)' }}
            >
              {isCancelling ? (
                <>
                  <SpinnerGap size={14} className="spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <X size={14} />
                  Cancel
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="stack" style={{ gap: 8 }}>
        <div className="flex-between" style={{ fontSize: 13 }}>
          <span>
            {stats ? `${stats.downloaded} / ${stats.total_files} files` : 'Discovering files...'}
          </span>
          {isDownloading && speed > 0 && (
            <span className="muted">
              {speed.toFixed(1)} files/s • ETA: {formatDuration(eta)}
            </span>
          )}
          {!isDownloading && stats && (
            <span className="muted">
              Completed in {formatDuration(stats.duration_seconds)}
            </span>
          )}
        </div>

        <div className="upload-progress">
          <div
            className="upload-progress-bar"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Stats row */}
        {stats && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="flex" style={{ gap: 16, fontSize: 12, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--success)' }}>
                <Check size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {stats.downloaded} downloaded
              </span>
              <span className="muted">
                {stats.skipped} skipped
              </span>
              {stats.failed > 0 && (
                <span style={{ color: 'var(--danger)' }}>
                  <WarningCircle size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {stats.failed} failed
                </span>
              )}
              {isDownloading && (
                <>
                  <span className="muted">
                    {speedDisplay}
                  </span>
                  {eta > 0 && (
                    <span className="muted">
                      ETA: {formatDuration(eta)}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Per-file progress toggle */}
            {fileTasks && fileTasks.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowFiles(!showFiles)}
                style={{ width: '100%', justifyContent: 'space-between', gap: 8 }}
              >
                <span style={{ fontSize: 12 }}>
                  Active Downloads ({fileTasks.filter(t => t.state === 'DOWNLOADING').length})
                </span>
                {showFiles ? <CaretUp size={14} /> : <CaretDown size={14} />}
              </button>
            )}

            {/* Per-file progress display */}
            {showFiles && fileTasks && fileTasks.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {fileTasks
                  .filter(t => t.state === 'DOWNLOADING' || t.state === 'PAUSED')
                  .slice(0, 5)
                  .map(task => (
                    <div
                      key={task.filename}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        background: 'var(--bg-secondary)',
                        marginBottom: 4,
                      }}
                    >
                      <div className="flex-between" style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }} title={task.filename}>
                          {task.filename.length > 30
                            ? task.filename.slice(0, 27) + '...'
                            : task.filename}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {formatBytes(task.downloaded_bytes)} / {formatBytes(task.total_size)}
                        </span>
                      </div>
                      <div style={{
                        height: 4,
                        background: 'var(--border)',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${(task.downloaded_bytes / Math.max(task.total_size, 1)) * 100}%`,
                          background: 'var(--primary)',
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                      {task.speed_bps > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                          {formatSpeed(task.speed_bps)} {task.eta_seconds && `• ${formatDuration(task.eta_seconds)}`}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Per-source details toggle */}
      {sources && sources.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowSources(!showSources)}
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            <span>Source Details ({sources.length} sources)</span>
            {showSources ? <CaretUp size={14} /> : <CaretDown size={14} />}
          </button>

          {showSources && (
            <div style={{ marginTop: 8 }}>
              {sources.map(source => (
                <div
                  key={source.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: 'var(--bg-secondary)',
                    marginBottom: 4,
                  }}
                >
                  <div className="flex" style={{ gap: 8, alignItems: 'center', flex: 1 }}>
                    <span style={{ color: getStateColor(source.state) }}>
                      {getStateIcon(source.state)}
                    </span>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{source.name}</span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {source.state === 'discovering' && 'Discovering...'}
                      {source.state === 'downloading' && source.current_file && (
                        <span title={source.current_file}>
                          {source.current_file.length > 20
                            ? source.current_file.slice(0, 20) + '...'
                            : source.current_file}
                        </span>
                      )}
                      {source.state === 'completed' && `${source.downloaded} files`}
                      {source.state === 'failed' && `${source.failed} failed`}
                    </span>
                  </div>
                  <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
                    {source.total_files > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {source.downloaded}/{source.total_files}
                      </span>
                    )}
                    {(source.state === 'failed' || source.failed > 0) && !isDownloading && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => retrySource(source.name)}
                        title={`Retry ${source.name}`}
                        style={{ padding: 4 }}
                      >
                        <ArrowsClockwise size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
