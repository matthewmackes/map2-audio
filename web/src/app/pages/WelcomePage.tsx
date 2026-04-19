import { Navigate } from 'react-router-dom'

export function WelcomePage() {
  return <Navigate to="/about" replace />
}

export default WelcomePage
