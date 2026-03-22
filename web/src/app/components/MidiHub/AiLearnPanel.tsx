import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AILabel, AILabelContent, Button, ProgressBar, Tag, TextInput } from '@carbon/react'
import { midiHubApi, type MidiHubLearnSuggestion } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

export function AiLearnPanel() {
  const { nodeId } = useMidiHubNodeScope()
  const { pushToast } = useToasts()
  const [parameterId, setParameterId] = useState('filter_cutoff')
  const [activePlugins, setActivePlugins] = useState('wah,delay')
  const [bypassedPlugins, setBypassedPlugins] = useState('chorus')
  const [suggestions, setSuggestions] = useState<MidiHubLearnSuggestion[]>([])

  const requestSuggestions = useMutation({
    mutationFn: async () =>
      midiHubApi.getLearnSuggestions(
        {
          parameter_id: parameterId.trim(),
          chain_context: {
            active_plugins: activePlugins
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            bypassed_plugins: bypassedPlugins
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            split_targets: ['A', 'B'],
          },
        },
        nodeId,
      ),
    onSuccess: (payload) => {
      setSuggestions(payload.suggestions)
      pushToast('Learn suggestions updated', 'success')
    },
    onError: () => pushToast('Learn suggestions failed', 'error'),
  })

  return (
    <div className="midi-hub-lab-panel">
      <div className="midi-hub-lab-panel__toolbar">
        <AILabel kind="inline" size="mini" textLabel="AI">
          <AILabelContent>
            Suggested mappings are assistive output and should be reviewed before they are committed to show control.
          </AILabelContent>
        </AILabel>
        <Tag type="cool-gray">{`Suggestions ${suggestions.length}`}</Tag>
      </div>

      <div className="midi-hub-form-grid">
        <TextInput id="midi-hub-ai-parameter" labelText="Parameter ID" value={parameterId} onChange={(event) => setParameterId(event.currentTarget.value)} />
        <TextInput id="midi-hub-ai-active-plugins" labelText="Active plug-ins" value={activePlugins} onChange={(event) => setActivePlugins(event.currentTarget.value)} />
        <TextInput id="midi-hub-ai-bypassed-plugins" labelText="Bypassed plug-ins" value={bypassedPlugins} onChange={(event) => setBypassedPlugins(event.currentTarget.value)} />
      </div>

      <div className="midi-hub-actions">
        <Button size="sm" kind="primary" onClick={() => requestSuggestions.mutate()}>
          Suggest mappings
        </Button>
      </div>

      <div className="midi-hub-record-list">
        {suggestions.length === 0 ? <div className="midi-hub-empty-state">No AI suggestions generated.</div> : null}
        {suggestions.map((suggestion, index) => (
          <div key={`${suggestion.cc_number}-${index}`} className="midi-hub-lab-suggestion">
            <div className="midi-hub-record-copy">
              <span className="midi-hub-lab-suggestion__title">{`CC ${suggestion.cc_number} on channel ${suggestion.channel}`}</span>
              <div className="midi-hub-record-meta">{suggestion.reason}</div>
            </div>
            <ProgressBar
              label="Confidence"
              helperText={`${Math.round(suggestion.confidence * 100)}% confidence`}
              max={100}
              value={Math.round(suggestion.confidence * 100)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
