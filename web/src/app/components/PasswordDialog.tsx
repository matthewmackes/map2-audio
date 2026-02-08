/**
 * PasswordDialog - Password authentication for special mode access
 * 
 * Modal dialog that prompts for password before granting access
 * to special/advanced features.
 */

import { useState } from 'react'
import { X, Lock, AlertCircle } from 'lucide-react'

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!password.trim()) {
      setError('Please enter a password')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/special-backdoor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (data.success) {
        setPassword('')
        onSuccess()
      } else {
        setError(data.message || 'Incorrect password')
        setPassword('')
      }
    } catch (err) {
      setError('Authentication failed. Please try again.')
      console.error('Password authentication error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setPassword('')
    setError('')
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div 
        className="modal-dialog" 
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '400px',
          background: 'linear-gradient(135deg, rgba(15, 20, 35, 0.95) 0%, rgba(25, 30, 45, 0.95) 100%)',
          borderRadius: '12px',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid rgba(168, 85, 247, 0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Lock size={24} style={{ color: '#a855f7' }} />
            <h2 style={{
              fontSize: '18px',
              fontWeight: 700,
              color: '#f2f6ff',
              margin: 0,
            }}>
              Enter Password
            </h2>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#a1a1aa',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          <p style={{
            fontSize: '13px',
            color: '#a1a1aa',
            marginBottom: '20px',
            lineHeight: '1.5',
          }}>
            Access to special features requires authentication.
            Enter the backdoor password to continue.
          </p>

          {/* Password Input */}
          <div style={{ marginBottom: '20px' }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '14px',
                borderRadius: '8px',
                border: error ? '1px solid #ef4444' : '1px solid rgba(168, 85, 247, 0.3)',
                background: 'rgba(10, 15, 25, 0.5)',
                color: '#f2f6ff',
                outline: 'none',
                transition: 'border-color 150ms',
              }}
              onFocus={(e) => {
                if (!error) {
                  e.target.style.borderColor = 'rgba(168, 85, 247, 0.6)'
                }
              }}
              onBlur={(e) => {
                if (!error) {
                  e.target.style.borderColor = 'rgba(168, 85, 247, 0.3)'
                }
              }}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px',
              marginBottom: '20px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}>
              <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: '#fca5a5' }}>
                {error}
              </span>
            </div>
          )}

          {/* Buttons */}
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                border: '1px solid rgba(168, 85, 247, 0.3)',
                background: 'rgba(168, 85, 247, 0.05)',
                color: '#a855f7',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
                transition: 'all 150ms',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                border: 'none',
                background: isLoading || !password.trim() 
                  ? 'rgba(168, 85, 247, 0.3)' 
                  : 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)',
                color: '#fff',
                cursor: isLoading || !password.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 150ms',
              }}
            >
              {isLoading ? 'Authenticating...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
