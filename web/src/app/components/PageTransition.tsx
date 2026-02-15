import { ReactNode, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { FlickeringGrid } from './FlickeringGrid'

interface PageTransitionProps {
  children: ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [displayLocation, setDisplayLocation] = useState(location)

  useEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      // Start transition
      setIsTransitioning(true)

      // After 4 seconds, update the displayed location and end transition
      const timer = setTimeout(() => {
        setDisplayLocation(location)
        setIsTransitioning(false)
      }, 4000)

      return () => clearTimeout(timer)
    }
  }, [location, displayLocation])

  return (
    <>
      {/* Transition overlay */}
      {isTransitioning && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#000000',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FlickeringGrid
            squareSize={4}
            gridGap={6}
            flickerChance={0.3}
            maxOpacity={0.4}
          />
        </div>
      )}

      {/* Page content */}
      <div style={{ display: isTransitioning ? 'none' : 'block' }}>
        {children}
      </div>
    </>
  )
}
