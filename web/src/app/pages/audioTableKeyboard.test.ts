import { createAudioTableKeyHandler } from '../components/AudioTable/audioTableKeyboard'

function mountKeyboardGrid(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = `
    <div data-flow-index="0">
      <div data-row="0" data-col="0" tabindex="0"><input id="cell-0-0" /></div>
      <div data-row="0" data-col="1" tabindex="0"><button id="cell-0-1" type="button">Next</button></div>
      <div data-row="1" data-col="0" tabindex="0"><input id="cell-1-0" /></div>
    </div>
  `
  document.body.appendChild(container)
  return container
}

function dispatchKey(target: HTMLElement, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

describe('audioTableKeyboard', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('routes undo and redo shortcuts to the provided actions', () => {
    const container = mountKeyboardGrid()
    const actions = {
      onUndo: jest.fn(),
      onRedo: jest.fn(),
      onDeleteRow: jest.fn(),
    }
    const handler = createAudioTableKeyHandler({ current: container }, actions)
    document.addEventListener('keydown', handler)

    dispatchKey(document.body, { key: 'z', ctrlKey: true })
    dispatchKey(document.body, { key: 'y', ctrlKey: true })

    expect(actions.onUndo).toHaveBeenCalledTimes(1)
    expect(actions.onRedo).toHaveBeenCalledTimes(1)

    document.removeEventListener('keydown', handler)
  })

  it('moves focus across cells with tab and arrow navigation', () => {
    const container = mountKeyboardGrid()
    const actions = {
      onUndo: jest.fn(),
      onRedo: jest.fn(),
      onDeleteRow: jest.fn(),
    }
    const handler = createAudioTableKeyHandler({ current: container }, actions)
    document.addEventListener('keydown', handler)

    const firstCell = container.querySelector('[data-row="0"][data-col="0"]') as HTMLElement
    firstCell.focus()
    dispatchKey(firstCell, { key: 'Tab' })
    expect((document.activeElement as HTMLElement).id).toBe('cell-0-1')

    const secondCell = container.querySelector('[data-row="0"][data-col="1"]') as HTMLElement
    secondCell.focus()
    dispatchKey(secondCell, { key: 'ArrowLeft' })
    expect((document.activeElement as HTMLElement).id).toBe('cell-0-0')

    document.removeEventListener('keydown', handler)
  })

  it('routes delete to the active flow row', () => {
    const container = mountKeyboardGrid()
    const actions = {
      onUndo: jest.fn(),
      onRedo: jest.fn(),
      onDeleteRow: jest.fn(),
    }
    const handler = createAudioTableKeyHandler({ current: container }, actions)
    document.addEventListener('keydown', handler)

    const firstCell = container.querySelector('[data-row="0"][data-col="0"]') as HTMLElement
    firstCell.focus()
    dispatchKey(firstCell, { key: 'Delete' })

    expect(actions.onDeleteRow).toHaveBeenCalledWith(0, 0)

    document.removeEventListener('keydown', handler)
  })
})
