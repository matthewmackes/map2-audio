/**
 * T2521-7 cycle 35 — remote-peer annotation helper tests.
 */
import {
  chainHasSonoBusInput,
  chainHasSonoBusOutput,
  deriveRemotePeerFlags,
} from './snapshotEditorRemotePeerAnnotations'

describe('chainHasSonoBusInput / chainHasSonoBusOutput', () => {
  it('returns false when binding is null/undefined', () => {
    expect(chainHasSonoBusInput(null)).toBe(false)
    expect(chainHasSonoBusInput(undefined)).toBe(false)
    expect(chainHasSonoBusOutput(null)).toBe(false)
  })

  it('returns false when no interface IDs match sonobus:', () => {
    expect(
      chainHasSonoBusInput({
        chainId: 1,
        inputInterfaceIds: ['avb:endpoint-001', 'pipewire:usb:foo'],
        outputInterfaceIds: ['cluster:peer-7:tascam'],
      }),
    ).toBe(false)
    expect(
      chainHasSonoBusOutput({
        chainId: 1,
        inputInterfaceIds: ['avb:endpoint-001'],
        outputInterfaceIds: ['cluster:peer-7:tascam'],
      }),
    ).toBe(false)
  })

  it('returns true when any input ID is a SonoBus peer', () => {
    expect(
      chainHasSonoBusInput({
        chainId: 1,
        inputInterfaceIds: [
          'avb:endpoint-001',
          'sonobus:peer-A:grp-1:stream-1',
        ],
        outputInterfaceIds: [],
      }),
    ).toBe(true)
  })

  it('returns true when any output ID is a SonoBus peer', () => {
    expect(
      chainHasSonoBusOutput({
        chainId: 1,
        inputInterfaceIds: [],
        outputInterfaceIds: ['sonobus:peer-A:grp-1:stream-1'],
      }),
    ).toBe(true)
  })

  it('treats input + output independently', () => {
    const binding = {
      chainId: 1,
      inputInterfaceIds: ['sonobus:peer-A:grp-1:stream-1'],
      outputInterfaceIds: ['avb:endpoint-001'],
    }
    expect(chainHasSonoBusInput(binding)).toBe(true)
    expect(chainHasSonoBusOutput(binding)).toBe(false)
  })
})

describe('deriveRemotePeerFlags', () => {
  it('returns both flags off for null binding', () => {
    expect(deriveRemotePeerFlags(null)).toEqual({
      remoteInput: false,
      remoteOutput: false,
    })
  })

  it('mirrors the chainHasSonoBus* predicates', () => {
    expect(
      deriveRemotePeerFlags({
        chainId: 1,
        inputInterfaceIds: ['sonobus:peer-A:grp-1:stream-1'],
        outputInterfaceIds: ['avb:endpoint-001'],
      }),
    ).toEqual({ remoteInput: true, remoteOutput: false })

    expect(
      deriveRemotePeerFlags({
        chainId: 2,
        inputInterfaceIds: [],
        outputInterfaceIds: ['sonobus:peer-B:grp-2:stream-2'],
      }),
    ).toEqual({ remoteInput: false, remoteOutput: true })
  })
})
