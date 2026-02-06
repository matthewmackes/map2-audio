import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { FlowAssignmentDialog } from '../web/src/app/components/GridFlow/FlowAssignmentDialog'

const queryClient = new QueryClient()

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

describe('Phase 3 Recommendations', () => {
  it('renders assignment dialog container', () => {
    wrap(
      <FlowAssignmentDialog
        isOpen={true}
        flowId="flow-0"
        chainId={1}
        availableNodes={[]}
        onAssign={() => {}}
        onCancel={() => {}}
      />
    )

    expect(screen.getByText(/Assign Flow/i)).toBeInTheDocument()
  })
})
