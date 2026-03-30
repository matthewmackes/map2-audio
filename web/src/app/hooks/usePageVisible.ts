import { useEffect, useState } from 'react'

function isDocumentVisible() {
  if (typeof document === 'undefined') {
    return true
  }

  return !document.hidden
}

export function usePageVisible(): boolean {
  const [visible, setVisible] = useState<boolean>(() => isDocumentVisible())

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined
    }

    const handleVisibilityChange = () => {
      setVisible(isDocumentVisible())
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return visible
}

export default usePageVisible
