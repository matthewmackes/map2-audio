import type { PluginParameter } from '../../../../map2/types'
import { ParameterKnob } from '../../ParameterControl'
import type { AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { generateParameterGroups } from '../types'

interface BuildResidualParameterSectionsArgs {
  params: PluginParameter[]
  parameterValues: Record<number, number>
  onParameterChange: (index: number, value: number) => void
  accentColor: string
}

export function buildResidualParameterSections({
  params,
  parameterValues,
  onParameterChange,
  accentColor,
}: BuildResidualParameterSectionsArgs): AdvancedSection[] {
  if (params.length === 0) {
    return []
  }

  const groups = generateParameterGroups(params, { flattenSmallSets: false })

  return groups.flatMap((group) => {
    const groupParams = group.parameters
      .map((index) => params.find((param) => param.index === index))
      .filter((param): param is PluginParameter => param !== undefined)

    if (groupParams.length === 0) {
      return []
    }

    return [{
      id: `additional-${group.id}`,
      title: group.label,
      children: (
        <CarbonParameterSection>
          {groupParams.map((param) => (
            <ParameterKnob
              key={param.index}
              label={param.name}
              value={parameterValues[param.index] ?? param.default}
              min={param.min}
              max={param.max}
              defaultValue={param.default}
              onChange={(value) => onParameterChange(param.index, value)}
              accentColor={accentColor}
              isLogarithmic={param.is_log}
              size="small"
            />
          ))}
        </CarbonParameterSection>
      ),
    }]
  })
}
