import { useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight, BareMetalServer, Certificate, ChartNetwork, Checkmark, CheckmarkFilled, Close, Document, Link, Locked, Renew, Search, Security, WarningAlt } from '@carbon/icons-react'
import { NumberInput } from './ParameterControl'
import { EmptyState } from './shared/EmptyState'
import { LegacyButton } from './shared/LegacyButton'

interface WizardStep {
  id: number
  title: string
  icon: React.ReactNode
  completed: boolean
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 1, title: 'Deployment Mode', icon: <BareMetalServer size={20} />, completed: false },
  { id: 2, title: 'Node Discovery', icon: <ChartNetwork size={20} />, completed: false },
  { id: 3, title: 'Network Config', icon: <Security size={20} />, completed: false },
  { id: 4, title: 'Certificate Setup', icon: <Certificate size={20} />, completed: false },
  { id: 5, title: 'Review & Confirm', icon: <Document size={20} />, completed: false },
]

export function OnboardingWizard({ onComplete }: { onComplete?: () => void }) {
  const [currentStep, setCurrentStep] = useState(1)
  const [wizardData, setWizardData] = useState<any>({})
  const [errors, setErrors] = useState<string[]>([])
  const [discoveredNodes, setDiscoveredNodes] = useState<any[]>([])

  // Step 1: Deployment Mode
  const [deploymentMode, setDeploymentMode] = useState<'all-in-one' | 'distributed' | 'cloud'>('all-in-one')

  // Step 3: Network Config
  const [clusterName, setClusterName] = useState('')
  const [managementIp, setManagementIp] = useState('')
  const [networkInterface, setNetworkInterface] = useState('eth0')
  const [apiPort, setApiPort] = useState('8080')
  const [enableMdns, setEnableMdns] = useState(true)
  const [enableTls, setEnableTls] = useState(false)

  // Step 4: Certificate Setup
  const [certMode, setCertMode] = useState<'self-signed' | 'existing-ca' | 'skip'>('self-signed')

  const validateStep = (): boolean => {
    setErrors([])
    const newErrors: string[] = []

    if (currentStep === 3) {
      if (!clusterName.trim()) newErrors.push('Cluster name is required')
      if (!managementIp.trim()) newErrors.push('Management IP is required')
    }

    if (currentStep === 2 && discoveredNodes.length === 0) {
      newErrors.push('No nodes discovered. Please run discovery or add nodes manually.')
    }

    if (newErrors.length > 0) {
      setErrors(newErrors)
      return false
    }

    return true
  }

  const handleNext = () => {
    if (!validateStep()) return

    // Save step data
    const stepData: any = {}
    if (currentStep === 1) stepData.deployment_mode = deploymentMode
    if (currentStep === 2) stepData.discovered_nodes = discoveredNodes
    if (currentStep === 3) {
      stepData.cluster_name = clusterName
      stepData.management_ip = managementIp
      stepData.network_interface = networkInterface
      stepData.api_port = parseInt(apiPort)
      stepData.enable_mdns = enableMdns
      stepData.enable_tls = enableTls
    }
    if (currentStep === 4) stepData.cert_mode = certMode

    setWizardData({ ...wizardData, ...stepData })
    setCurrentStep(currentStep + 1)
  }

  const handleBack = () => {
    setCurrentStep(currentStep - 1)
    setErrors([])
  }

  const handleFinish = async () => {
    try {
      const response = await fetch('/api/cluster/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...wizardData, cert_mode: certMode }),
      })

      if (!response.ok) throw new Error(await response.text())

      if (onComplete) onComplete()
    } catch (e: any) {
      setErrors([e.message || 'Setup failed'])
    }
  }

  const handleAutoDiscover = async () => {
    try {
      const response = await fetch('/api/cluster/discovery/scan', { method: 'POST' })
      if (!response.ok) throw new Error('Discovery failed')
      const result = await response.json()
      setDiscoveredNodes(Array.isArray(result?.nodes) ? result.nodes : [])
    } catch (e: any) {
      setErrors([e.message || 'Discovery failed'])
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1a1a, #2a2a2a)',
          border: '2px solid #2563eb',
          borderRadius: 12,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>🧙 Cluster Onboarding Wizard</h2>
        <p style={{ margin: '8px 0 0', color: '#a0a0a0' }}>
          Step-by-step setup for your MAP2 Audio Cluster
        </p>
      </div>

      {/* Progress Indicator */}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '12px 0' }}>
        {WIZARD_STEPS.map((step, idx) => (
          <div
            key={step.id}
            style={{
              flex: 1,
              minWidth: 140,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: 12,
              background:
                currentStep === step.id
                  ? 'rgba(37, 99, 235, 0.15)'
                  : currentStep > step.id
                  ? 'rgba(0, 255, 65, 0.1)'
                  : 'rgba(255, 255, 255, 0.05)',
              border: `2px solid ${
                currentStep === step.id ? '#2563eb' : currentStep > step.id ? '#00ff41' : '#333'
              }`,
              borderRadius: 8,
              transition: 'all var(--map2-dur-slow, 380ms) var(--map2-ease-in-out-rack, ease)',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background:
                  currentStep === step.id
                    ? '#2563eb'
                    : currentStep > step.id
                    ? '#00ff41'
                    : 'rgba(255, 255, 255, 0.1)',
                color: currentStep >= step.id ? '#000' : '#666',
              }}
            >
              {currentStep > step.id ? <Checkmark size={16} /> : step.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#888' }}>Step {step.id}</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{step.title}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Error Messages */}
      {errors.length > 0 && (
        <div
          style={{
            padding: 16,
            background: 'rgba(255, 51, 51, 0.1)',
            border: '2px solid #ff3333',
            borderRadius: 8,
          }}
        >
          {errors.map((err, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <WarningAlt size={16} color="#ff3333" />
              <span style={{ color: '#ff3333' }}>{err}</span>
            </div>
          ))}
        </div>
      )}

      {/* Step Content */}
      <div
        style={{
          padding: 24,
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 12,
          minHeight: 400,
        }}
      >
        {currentStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h3 style={{ margin: 0, color: '#2563eb' }}>Step 1: Choose Deployment Mode</h3>
            <p style={{ color: '#a0a0a0' }}>Select how you want to deploy your MAP2 Audio cluster:</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { value: 'all-in-one', label: '🖥️  ALL-IN-ONE', desc: 'Single node with all services (Development/Testing)' },
                { value: 'distributed', label: '🌐 DISTRIBUTED', desc: 'Multiple nodes, distributed services (Production)' },
                { value: 'cloud', label: '☁️  CLOUD', desc: 'Cloud-native with auto-scaling (Enterprise)' },
              ].map(mode => (
                <label
                  key={mode.value}
                  style={{
                    display: 'block',
                    padding: 16,
                    background: deploymentMode === mode.value ? 'rgba(37, 99, 235, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                    border: `2px solid ${deploymentMode === mode.value ? '#2563eb' : '#333'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all var(--map2-dur-base, 220ms) var(--map2-ease-in-out-rack, ease)',
                  }}
                >
                  <input
                    type="radio"
                    name="deployment-mode"
                    value={mode.value}
                    checked={deploymentMode === mode.value}
                    onChange={() => setDeploymentMode(mode.value as any)}
                    style={{ marginRight: 12 }}
                  />
                  <strong>{mode.label}</strong>
                  <div style={{ marginLeft: 28, marginTop: 6, fontSize: 13, color: '#888' }}>{mode.desc}</div>
                </label>
              ))}
            </div>

            <div
              style={{
                marginTop: 16,
                padding: 16,
                background: 'rgba(37, 99, 235, 0.05)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#2563eb' }}>Mode Details:</div>
              <div style={{ fontSize: 12, color: '#a0a0a0', lineHeight: 1.6 }}>
                • <strong>ALL-IN-ONE:</strong> Fastest setup, no network required, limited scalability
                <br />
                • <strong>DISTRIBUTED:</strong> High availability, load balancing, requires 2+ nodes
                <br />
                • <strong>CLOUD:</strong> Auto-scaling, multi-region, requires cloud provider
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h3 style={{ margin: 0, color: '#2563eb' }}>Step 2: Node Discovery</h3>
            <p style={{ color: '#a0a0a0' }}>Discover nodes on your network or manually add them:</p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <LegacyButton variant="primary" onClick={handleAutoDiscover}>
                <Search size={14} style={{ marginRight: 6 }} /> Auto-Discover
              </LegacyButton>
              <LegacyButton variant="secondary">➕ Add Manually</LegacyButton>
              <LegacyButton variant="secondary" onClick={handleAutoDiscover}>
                <Renew size={14} style={{ marginRight: 6 }} /> Refresh
              </LegacyButton>
            </div>

            <div
              style={{
                padding: 16,
                background: '#111',
                border: '1px solid #333',
                borderRadius: 8,
                minHeight: 200,
                maxHeight: 300,
                overflowY: 'auto',
              }}
            >
              {discoveredNodes.length === 0 ? (
                <EmptyState
                  title="No nodes discovered yet"
                  description='Click "Auto-Discover" to scan the network.'
                  compact
                />
              ) : (
                <div>
                  <div style={{ marginBottom: 12, color: '#00ff41', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckmarkFilled size={14} /> Found {discoveredNodes.length} node(s):
                  </div>
                  {discoveredNodes.map((node, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 12,
                        marginBottom: 8,
                        background: 'rgba(37, 99, 235, 0.05)',
                        border: '1px solid rgba(37, 99, 235, 0.3)',
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {node.hostname || 'Unknown'} - {node.ip_address || 'N/A'}
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        Role: {node.role || 'Unknown'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                padding: 16,
                background: 'rgba(37, 99, 235, 0.05)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#2563eb' }}>
                Discovery Methods:
              </div>
              <div style={{ fontSize: 12, color: '#a0a0a0', lineHeight: 1.6 }}>
                • <strong>Auto-Discovery:</strong> mDNS/DNS-SD scan for MAP2 nodes on local network
                <br />
                • <strong>Manual Add:</strong> Specify IP address and credentials for remote nodes
                <br />
                • <strong>Refresh:</strong> Re-scan network for new nodes
              </div>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h3 style={{ margin: 0, color: '#2563eb' }}>Step 3: Network Configuration</h3>
            <p style={{ color: '#a0a0a0' }}>Configure cluster networking and communication:</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                  Cluster Name:
                </label>
                <input
                  type="text"
                  value={clusterName}
                  onChange={e => setClusterName(e.target.value)}
                  placeholder="my-audio-cluster"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#111',
                    border: '1px solid #333',
                    borderRadius: 6,
                    color: '#fff',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                  Management Node IP:
                </label>
                <input
                  type="text"
                  value={managementIp}
                  onChange={e => setManagementIp(e.target.value)}
                  placeholder="192.168.1.100"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#111',
                    border: '1px solid #333',
                    borderRadius: 6,
                    color: '#fff',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                  Network Interface:
                </label>
                <select
                  value={networkInterface}
                  onChange={e => setNetworkInterface(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#111',
                    border: '1px solid #333',
                    borderRadius: 6,
                    color: '#fff',
                  }}
                >
                  <option value="eth0">eth0</option>
                  <option value="wlan0">wlan0</option>
                  <option value="enp0s3">enp0s3</option>
                </select>
              </div>

              <div>
                <NumberInput
                  label="API Port"
                  value={Number.parseInt(apiPort || '8080', 10) || 8080}
                  min={1}
                  max={65535}
                  step={1}
                  profile="integer"
                  onChange={(value) => setApiPort(String(value))}
                  size="small"
                  fullWidth
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={enableMdns}
                  onChange={e => setEnableMdns(e.target.checked)}
                />
                <span>Enable mDNS discovery</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={enableTls}
                  onChange={e => setEnableTls(e.target.checked)}
                />
                <span>Enable TLS/SSL</span>
              </label>
            </div>

            <div
              style={{
                padding: 16,
                background: 'rgba(37, 99, 235, 0.05)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#2563eb' }}>
                Configuration Tips:
              </div>
              <div style={{ fontSize: 12, color: '#a0a0a0', lineHeight: 1.6 }}>
                • <strong>Cluster Name:</strong> Unique identifier for your cluster
                <br />
                • <strong>Management IP:</strong> IP of the primary management/control node
                <br />
                • <strong>mDNS:</strong> Automatic discovery (requires multicast support)
                <br />
                • <strong>TLS:</strong> Encrypted communication (requires certificates)
              </div>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h3 style={{ margin: 0, color: '#2563eb' }}>Step 4: Certificate Setup</h3>
            <p style={{ color: '#a0a0a0' }}>
              Configure SSL/TLS certificates for secure communication:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { value: 'self-signed', label: 'Auto-generate self-signed certificates' },
                { value: 'existing-ca', label: '📜 Use existing certificate authority' },
                { value: 'skip', label: 'Skip (insecure - not recommended)' },
              ].map(mode => (
                <label
                  key={mode.value}
                  style={{
                    display: 'block',
                    padding: 16,
                    background: certMode === mode.value ? 'rgba(37, 99, 235, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                    border: `2px solid ${certMode === mode.value ? '#2563eb' : '#333'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="cert-mode"
                    value={mode.value}
                    checked={certMode === mode.value}
                    onChange={() => setCertMode(mode.value as any)}
                    style={{ marginRight: 12 }}
                  />
                  <strong>{mode.label}</strong>
                </label>
              ))}
            </div>

            <div
              style={{
                padding: 16,
                background: 'rgba(37, 99, 235, 0.05)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#2563eb' }}>
                Certificate Options:
              </div>
              <div style={{ fontSize: 12, color: '#a0a0a0', lineHeight: 1.6 }}>
                • <strong>Self-signed:</strong> Quick setup, browser warnings, good for testing
                <br />
                • <strong>Existing CA:</strong> Production-ready, requires CA cert/key files
                <br />
                • <strong>Skip:</strong> No encryption, only for isolated test environments
              </div>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h3 style={{ margin: 0, color: '#2563eb' }}>Step 5: Review Configuration</h3>
            <p style={{ color: '#a0a0a0' }}>Review your cluster configuration before applying:</p>

            <div
              style={{
                padding: 20,
                background: '#111',
                border: '2px solid #2563eb',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: '#2563eb' }}>
                Configuration Summary:
              </div>

              <div style={{ display: 'grid', gap: 12, fontSize: 13, lineHeight: 1.8 }}>
                <div>
                  <span style={{ color: '#888' }}>Deployment Mode:</span>{' '}
                  <strong>{wizardData.deployment_mode || 'N/A'}</strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Cluster Name:</span>{' '}
                  <strong>{wizardData.cluster_name || 'N/A'}</strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Management IP:</span>{' '}
                  <strong>{wizardData.management_ip || 'N/A'}</strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Network Interface:</span>{' '}
                  <strong>{wizardData.network_interface || 'N/A'}</strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>API Port:</span>{' '}
                  <strong>{wizardData.api_port || 'N/A'}</strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>mDNS Enabled:</span>{' '}
                  <strong>{wizardData.enable_mdns ? 'Yes' : 'No'}</strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>TLS Enabled:</span>{' '}
                  <strong>{wizardData.enable_tls ? 'Yes' : 'No'}</strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Certificate Mode:</span>{' '}
                  <strong>{certMode}</strong>
                </div>

                <div style={{ marginTop: 8 }}>
                  <span style={{ color: '#888' }}>
                    Discovered Nodes ({wizardData.discovered_nodes?.length || 0}):
                  </span>
                  <div style={{ marginLeft: 16, marginTop: 8 }}>
                    {(wizardData.discovered_nodes || []).map((node: any, idx: number) => (
                      <div key={idx} style={{ padding: '4px 0' }}>
                        {idx + 1}. {node.hostname || 'Unknown'} - {node.ip_address || 'N/A'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: 16,
                background: 'rgba(255, 170, 0, 0.1)',
                border: '1px solid #ffaa00',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#ffaa00' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><WarningAlt size={14} /> Important:</span>
              </div>
              <div style={{ fontSize: 12, color: '#ffaa00', lineHeight: 1.6 }}>
                • Review all settings carefully before proceeding
                <br />
                • Changes will be applied to all discovered nodes
                <br />
                • You can go back to modify any step
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <LegacyButton
          variant="secondary"
          onClick={handleBack}
          disabled={currentStep === 1}
          style={{ opacity: currentStep === 1 ? 0.4 : 1 }}
        >
          <ArrowLeft size={14} style={{ marginRight: 6 }} /> Back
        </LegacyButton>

        {currentStep < 5 ? (
          <LegacyButton variant="primary" onClick={handleNext}>
            Next <ArrowRight size={14} style={{ marginLeft: 6 }} />
          </LegacyButton>
        ) : (
          <LegacyButton variant="success" onClick={handleFinish}>
            <CheckmarkFilled size={14} style={{ marginRight: 6 }} /> Finish Setup
          </LegacyButton>
        )}

        <LegacyButton variant="error" onClick={() => onComplete && onComplete()}>
          <Close size={14} style={{ marginRight: 6 }} /> Cancel
        </LegacyButton>
      </div>
    </div>
  )
}
