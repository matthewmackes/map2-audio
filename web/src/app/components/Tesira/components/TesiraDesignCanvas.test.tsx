import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TesiraDesignCanvas } from './TesiraDesignCanvas'

const mockCreateDesignMutateAsync = jest.fn().mockResolvedValue({
  design: { design_id: 'design-2' },
})
const mockUpdateDesignMutateAsync = jest.fn().mockResolvedValue(undefined)
const mockDeleteDesignMutateAsync = jest.fn().mockResolvedValue(undefined)
const mockValidateDesignMutateAsync = jest.fn().mockResolvedValue(undefined)
const mockCompileDesignMutateAsync = jest.fn().mockResolvedValue({ status: 'COMPILED', compile_revision: 2 })
const mockRecompileDesignMutateAsync = jest.fn().mockResolvedValue({ status: 'COMPILED', compile_revision: 3 })
const mockCompileActiveMutateAsync = jest.fn().mockResolvedValue({ count: 1 })
const mockCompileAllMutateAsync = jest.fn().mockResolvedValue({ count: 1 })
const mockCompileUncompiledMutateAsync = jest.fn().mockResolvedValue({ count: 1 })

const mockDesignsResponse = {
  designs: [{ design_id: 'design-1', name: 'Ballroom Main' }],
}

const mockDesignLibraryResponse = {
  available_profiles: ['forte_ci_v1'],
  blocks: [{ block_type: 'LevelControl', title: 'Level Control', io: { inputs: [], outputs: [] } }],
}

let mockDesignDetailResponse = {
  design: {
    design_id: 'design-1',
    name: 'Ballroom Main',
    compile_status: 'UNCOMPILED',
    compile_revision: 0,
    graph: { nodes: [], edges: [], groups: [] },
  },
}

jest.mock('reactflow', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: ({ nodes, children }: { nodes: unknown[]; children: React.ReactNode }) => (
      <div data-testid="react-flow">
        <span>{`${nodes.length} nodes`}</span>
        {children}
      </div>
    ),
    addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
    Background: () => <div>background</div>,
    Controls: () => <div>controls</div>,
    MiniMap: () => <div>minimap</div>,
    useNodesState: (initialNodes: unknown[]) => {
      const [nodes, setNodes] = React.useState(initialNodes)
      return [nodes, setNodes, jest.fn()]
    },
    useEdgesState: (initialEdges: unknown[]) => {
      const [edges, setEdges] = React.useState(initialEdges)
      return [edges, setEdges, jest.fn()]
    },
  }
})

jest.mock('@/app/components/shared/LandscapePrompt', () => ({
  LandscapePrompt: () => null,
}))

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraDesigns: () => ({
    data: mockDesignsResponse,
    isLoading: false,
  }),
  useTesiraDesignLibrary: () => ({
    data: mockDesignLibraryResponse,
  }),
  useCreateTesiraDesign: () => ({
    mutateAsync: mockCreateDesignMutateAsync,
    isPending: false,
    error: null,
  }),
  useUpdateTesiraDesign: () => ({
    mutateAsync: mockUpdateDesignMutateAsync,
    isPending: false,
    error: null,
  }),
  useDeleteTesiraDesign: () => ({
    mutateAsync: mockDeleteDesignMutateAsync,
    isPending: false,
    error: null,
  }),
  useValidateTesiraDesign: () => ({
    mutateAsync: mockValidateDesignMutateAsync,
    isPending: false,
    error: null,
    data: null,
  }),
  useCompileTesiraDesign: () => ({
    mutateAsync: mockCompileDesignMutateAsync,
    isPending: false,
    error: null,
  }),
  useRecompileTesiraDesign: () => ({
    mutateAsync: mockRecompileDesignMutateAsync,
    isPending: false,
    error: null,
  }),
  useCompileActiveTesiraDesign: () => ({
    mutateAsync: mockCompileActiveMutateAsync,
    isPending: false,
    error: null,
  }),
  useCompileAllTesiraDesigns: () => ({
    mutateAsync: mockCompileAllMutateAsync,
    isPending: false,
    error: null,
  }),
  useCompileUncompiledTesiraDesigns: () => ({
    mutateAsync: mockCompileUncompiledMutateAsync,
    isPending: false,
    error: null,
  }),
  useTesiraDesign: (_deviceId: string, designId: string) => ({
    data: designId ? mockDesignDetailResponse : undefined,
    error: null,
  }),
  useTesiraDesignDiagnostics: () => ({
    data: null,
    error: null,
  }),
}))

describe('TesiraDesignCanvas', () => {
  beforeAll(() => {
    if (typeof window.matchMedia !== 'function') {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      })
    }

    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        writable: true,
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      })
    }
  })

  beforeEach(() => {
    mockCreateDesignMutateAsync.mockClear()
    mockUpdateDesignMutateAsync.mockClear()
    mockDeleteDesignMutateAsync.mockClear()
    mockValidateDesignMutateAsync.mockClear()
    mockCompileDesignMutateAsync.mockClear()
    mockRecompileDesignMutateAsync.mockClear()
    mockCompileActiveMutateAsync.mockClear()
    mockCompileAllMutateAsync.mockClear()
    mockCompileUncompiledMutateAsync.mockClear()
    mockDesignDetailResponse = {
      design: {
        design_id: 'design-1',
        name: 'Ballroom Main',
        compile_status: 'UNCOMPILED',
        compile_revision: 0,
        graph: { nodes: [], edges: [], groups: [] },
      },
    }
  })

  it('adds a library block to the graph and saves the selected design', async () => {
    render(<TesiraDesignCanvas deviceId="tesira-1" />)

    expect(screen.getByText('Tesira graph editor')).toBeTruthy()
    expect(screen.getAllByText('Ballroom Main').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Block'), {
      target: { value: 'LevelControl' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }))

    await waitFor(() => {
      expect(screen.getByTestId('react-flow').textContent).toContain('1 nodes')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockUpdateDesignMutateAsync).toHaveBeenCalledWith({
        deviceId: 'tesira-1',
        designId: 'design-1',
        graph: expect.objectContaining({
          nodes: [
            expect.objectContaining({
              block_type: 'LevelControl',
              instance_tag: 'LevelControl1',
            }),
          ],
          edges: [],
          groups: [],
        }),
      })
    })
  })

  it('preserves unsaved local graph edits when the selected design refetches', async () => {
    const { rerender } = render(<TesiraDesignCanvas deviceId="tesira-1" />)

    fireEvent.change(screen.getByLabelText('Block'), {
      target: { value: 'LevelControl' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }))

    await waitFor(() => {
      expect(screen.getByTestId('react-flow').textContent).toContain('1 nodes')
    })

    mockDesignDetailResponse = {
      design: {
        design_id: 'design-1',
        name: 'Ballroom Main',
        compile_status: 'UNCOMPILED',
        compile_revision: 0,
        graph: { nodes: [], edges: [], groups: [] },
      },
    }

    rerender(<TesiraDesignCanvas deviceId="tesira-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('react-flow').textContent).toContain('1 nodes')
    })
  })
})
