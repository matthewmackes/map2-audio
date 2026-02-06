import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ClusterDashboard } from '../web/src/app/components/GridFlow/ClusterDashboard'
import { FlowAssignmentMatrix } from '../web/src/app/components/GridFlow/FlowAssignmentMatrix'

const queryClient = new QueryClient()

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

describe('Phase 2 UI', () => {
  it('renders ClusterDashboard header', () => {
    wrap(<ClusterDashboard />)
    expect(screen.getByText(/Cluster Nodes/i)).toBeInTheDocument()
  })

  it('renders FlowAssignmentMatrix header', () => {
    wrap(<FlowAssignmentMatrix />)
    expect(screen.getByText(/Flow Assignments/i)).toBeInTheDocument()
  })
})
