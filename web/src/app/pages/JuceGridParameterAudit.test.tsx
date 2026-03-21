import React from 'react'
import { render, screen } from '@testing-library/react'
import {
  getPluginCardComponent,
  getPluginCardConfig,
  getRegisteredPlugins,
  registerTemplateLazy,
} from '../components/PluginCards/registry'
import { JuceGridParameterEditor } from './JuceGridParameterEditor'
import type { ChainPlugin, Plugin, PluginParameter } from '../../map2/types'

const juceProcessors = require('../../../../app/deployment/juce_processors.json') as {
  processors: Array<Record<string, any>>
}

const defaultLv2Effects = require('../../../../app/deployment/default_lv2_effects.json') as {
  plugins: Array<Record<string, any>>
}

const TEMPLATE_CATEGORY_AUDIT_SET = [
  'Dynamics',
  'Reverb',
  'EQ',
  'Delay',
  'Distortion',
  'Modulation',
  'Pitch',
  'Utility',
  'Instrument',
] as const

registerTemplateLazy('dynamics', () => import('../components/PluginCards/Templates/DynamicsTemplate').then((module) => ({ default: module.DynamicsTemplate })))
registerTemplateLazy('reverb', () => import('../components/PluginCards/Templates/ReverbTemplate').then((module) => ({ default: module.ReverbTemplate })))
registerTemplateLazy('eq', () => import('../components/PluginCards/Templates/EQTemplate').then((module) => ({ default: module.EQTemplate })))
registerTemplateLazy('delay', () => import('../components/PluginCards/Templates/DelayTemplate').then((module) => ({ default: module.DelayTemplate })))
registerTemplateLazy('distortion', () => import('../components/PluginCards/Templates/DistortionTemplate').then((module) => ({ default: module.DistortionTemplate })))
registerTemplateLazy('modulation', () => import('../components/PluginCards/Templates/ModulationTemplate').then((module) => ({ default: module.ModulationTemplate })))
registerTemplateLazy('utility', () => import('../components/PluginCards/Templates/UtilityTemplate').then((module) => ({ default: module.UtilityTemplate })))
registerTemplateLazy('pitch', () => import('../components/PluginCards/Templates/PitchTemplate').then((module) => ({ default: module.PitchTemplate })))
registerTemplateLazy('instrument', () => import('../components/PluginCards/Templates/InstrumentTemplate').then((module) => ({ default: module.InstrumentTemplate })))

function toPluginParameter(parameter: Record<string, any>, index: number): PluginParameter {
  const isToggle = parameter.type === 'toggle'
  const min = Number.isFinite(parameter.min) ? parameter.min : 0
  const max = Number.isFinite(parameter.max) ? parameter.max : isToggle ? 1 : 100
  const defaultValue = typeof parameter.default === 'boolean'
    ? (parameter.default ? 1 : 0)
    : Number.isFinite(parameter.default)
      ? parameter.default
      : min

  return {
    index,
    name: parameter.name ?? `Parameter ${index + 1}`,
    symbol: parameter.symbol ?? `param_${index}`,
    min,
    max,
    default: defaultValue,
    is_toggled: isToggle,
    is_log: Boolean(parameter.logarithmic),
  }
}

function toPluginMeta(entry: Record<string, any>): Plugin {
  const parameters = Array.isArray(entry.parameters)
    ? entry.parameters.map((parameter, index) => toPluginParameter(parameter, index))
    : []

  return {
    uri: entry.uri,
    name: entry.name,
    author: entry.author ?? 'Audit',
    category: entry.category ?? 'Utility',
    class_label: entry.category ?? 'Utility',
    version: entry.version ?? 'audit',
    license: entry.license ?? 'Unknown',
    has_ui: false,
    in_ports: entry.audio_ports?.inputs ?? 0,
    out_ports: entry.audio_ports?.outputs ?? 0,
    parameters,
    format: entry.uri.startsWith('map2://juce/') ? 'VST3' : 'LV2',
  }
}

function toChainPlugin(meta: Plugin): ChainPlugin {
  return {
    uri: meta.uri,
    name: meta.name,
    position: 0,
    bypassed: false,
    parameters: Object.fromEntries(meta.parameters.map((parameter) => [parameter.symbol, parameter.default])),
    in_ports: meta.in_ports,
    out_ports: meta.out_ports,
    format: meta.format,
  }
}

describe('Juce Grid deployment-backed parameter render audit', () => {
  it('resolves every registered custom card and the fallback template set', () => {
    const registeredPlugins = getRegisteredPlugins()
    expect(registeredPlugins.length).toBeGreaterThanOrEqual(30)

    for (const uri of registeredPlugins) {
      expect(getPluginCardConfig(uri, 'Unknown')).not.toBeNull()
      expect(getPluginCardComponent(uri, 'Unknown')).not.toBeNull()
    }

    for (const category of TEMPLATE_CATEGORY_AUDIT_SET) {
      const uri = `audit://template/${category.toLowerCase()}`
      expect(getPluginCardConfig(uri, category)).not.toBeNull()
      expect(getPluginCardComponent(uri, category)).not.toBeNull()
    }
  })

  it('renders the standardized bottom editor for every deployment-declared grid plugin', () => {
    const deploymentEntries = [
      ...juceProcessors.processors,
      ...defaultLv2Effects.plugins,
    ].filter((entry) => entry.uri !== 'map2://tesira/avb-node')

    expect(deploymentEntries.length).toBeGreaterThan(0)

    for (const entry of deploymentEntries) {
      const meta = toPluginMeta(entry)
      const plugin = toChainPlugin(meta)
      const firstParameter = meta.parameters[0]
      const view = render(
        <JuceGridParameterEditor
          plugin={plugin}
          meta={meta}
          onParameterChange={() => {}}
          onParameterChangeEnd={() => {}}
        />,
      )

      expect(screen.getByTestId('juce-grid-parameter-editor')).toBeTruthy()

      if (firstParameter) {
        expect(screen.getByText(firstParameter.name)).toBeTruthy()
      } else {
        expect(screen.getByText('No adjustable parameters')).toBeTruthy()
      }

      view.unmount()
    }
  }, 15000)
})
