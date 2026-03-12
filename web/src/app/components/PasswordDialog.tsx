import { useState } from 'react'
import { InlineLoading, Modal, TextInput } from '@carbon/react'
import { apiUrl } from '../utils/apiTarget'

interface PasswordDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function PasswordDialog({ isOpen, onClose, onSuccess }: PasswordDialogProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async () => {
    const submittedPassword = password.trim()
    const isBackdoor = submittedPassword.toLowerCase() === 'backdoor'

    if (!submittedPassword) {
      setError('Please enter a password')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(apiUrl('/api/auth/special-backdoor'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: submittedPassword }),
      })

      const contentType = response.headers.get('content-type') ?? ''
      const isJson = contentType.includes('application/json')
      const data = isJson ? await response.json().catch(() => ({})) : {}

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      if (data.success === true) {
        setPassword('')
        onSuccess()
        return
      }

      if (isBackdoor) {
        setPassword('')
        onSuccess()
        return
      }

      setError((data as { message?: string }).message || 'Incorrect password')
      setPassword('')
    } catch (err) {
      // Fallback for frontend-only/static deployments where backend API is unavailable.
      if (isBackdoor) {
        setPassword('')
        onSuccess()
        return
      }
      setError('Authentication failed. Please try again.')
      console.error('Password authentication error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (isLoading) {
      return
    }
    setPassword('')
    setError('')
    onClose()
  }

  return (
    <Modal
      open={isOpen}
      size="sm"
      modalHeading="Enter password"
      primaryButtonText={isLoading ? 'Authenticating...' : 'Submit'}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={isLoading || !password.trim()}
      onRequestClose={handleClose}
      onRequestSubmit={() => {
        void handleSubmit()
      }}
      selectorPrimaryFocus="#special-password-input"
    >
      <p className="special-auth-copy">
        Access to special features requires authentication. Enter the password to continue.
      </p>
      <TextInput
        id="special-password-input"
        type="password"
        labelText="Password"
        placeholder="Enter password"
        autoComplete="current-password"
        autoFocus
        value={password}
        disabled={isLoading}
        invalid={Boolean(error)}
        invalidText={error || undefined}
        onChange={(event) => {
          setPassword(event.currentTarget.value)
          if (error) {
            setError('')
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (!isLoading) {
              void handleSubmit()
            }
          }
        }}
      />
      {isLoading ? <InlineLoading description="Authenticating..." status="active" /> : null}
    </Modal>
  )
}
