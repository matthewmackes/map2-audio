/**
 * Page 3: LCD Settings & Configuration
 * Configure LCD display settings and event behavior.
 */

import React, { useState } from 'react';

interface LCDSettings {
  brightness: number;
  autoOffTime: number;
  soundEnabled: boolean;
  soundVolume: number;
  alertSoundOnly: boolean;
  broadcastMode: 'all' | 'critical' | 'local-only';
  eventRetention: number; // hours
  autoScrollDelay: number; // seconds
}

export function LCDSettingsPage() {
  const [settings, setSettings] = useState<LCDSettings>({
    brightness: 100,
    autoOffTime: 0, // 0 = never
    soundEnabled: true,
    soundVolume: 70,
    alertSoundOnly: true,
    broadcastMode: 'all',
    eventRetention: 24,
    autoScrollDelay: 3
  });
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-cyan-400 mb-2">LCD Settings</h1>
        <p className="text-gray-400">Configure display and event behavior</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Display Settings */}
          <SettingSection title="Display Settings">
            <SliderSetting
              label="Brightness"
              value={settings.brightness}
              min={0}
              max={100}
              unit="%"
              onChange={(brightness) => setSettings({ ...settings, brightness })}
              hint="Adjust LCD backlight brightness"
            />
            
            <SelectSetting
              label="Auto-off Timer"
              value={String(settings.autoOffTime)}
              options={[
                { value: '0', label: 'Never' },
                { value: '5', label: '5 minutes' },
                { value: '15', label: '15 minutes' },
                { value: '30', label: '30 minutes' },
                { value: '60', label: '1 hour' }
              ]}
              onChange={(v) => setSettings({ ...settings, autoOffTime: parseInt(v) })}
              hint="Turn off display after inactivity"
            />
            
            <ToggleSetting
              label="Auto-scroll long messages"
              value={settings.autoScrollDelay > 0}
              onChange={(enabled) => setSettings({ 
                ...settings, 
                autoScrollDelay: enabled ? 3 : 0 
              })}
              hint="Scroll text that exceeds display width"
            />
            
            {settings.autoScrollDelay > 0 && (
              <SliderSetting
                label="Scroll Speed"
                value={settings.autoScrollDelay}
                min={1}
                max={5}
                unit="s"
                onChange={(delay) => setSettings({ ...settings, autoScrollDelay: delay })}
                hint="Delay between scroll steps"
              />
            )}
          </SettingSection>
          
          {/* Sound Settings */}
          <SettingSection title="Audio & Alerts">
            <ToggleSetting
              label="Alert Sounds"
              value={settings.soundEnabled}
              onChange={(enabled) => setSettings({ ...settings, soundEnabled: enabled })}
              hint="Play beep sound on critical events"
            />
            
            {settings.soundEnabled && (
              <>
                <SliderSetting
                  label="Alert Volume"
                  value={settings.soundVolume}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(vol) => setSettings({ ...settings, soundVolume: vol })}
                  hint="Volume for critical alert sounds"
                />
                
                <ToggleSetting
                  label="Critical Alerts Only"
                  value={settings.alertSoundOnly}
                  onChange={(only) => setSettings({ ...settings, alertSoundOnly: only })}
                  hint="Only play sounds for critical severity events"
                />
                
                <div className="bg-gray-800 rounded p-3">
                  <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold text-sm">
                    🔊 Test Alert Sound
                  </button>
                </div>
              </>
            )}
          </SettingSection>
          
          {/* Event Settings */}
          <SettingSection title="Event Management">
            <SelectSetting
              label="Broadcast Mode"
              value={settings.broadcastMode}
              options={[
                { value: 'all', label: 'All Events' },
                { value: 'critical', label: 'Critical Only' },
                { value: 'local-only', label: 'Local Only' }
              ]}
              onChange={(mode) => setSettings({ ...settings, broadcastMode: mode as any })}
              hint="Which events to display on this LCD"
            />
            
            <SelectSetting
              label="Event Retention"
              value={String(settings.eventRetention)}
              options={[
                { value: '1', label: '1 hour' },
                { value: '6', label: '6 hours' },
                { value: '12', label: '12 hours' },
                { value: '24', label: '24 hours' },
                { value: '72', label: '3 days' },
                { value: '168', label: '1 week' }
              ]}
              onChange={(hours) => setSettings({ ...settings, eventRetention: parseInt(hours) })}
              hint="How long to keep event history"
            />
            
            <button className="w-full px-4 py-2 bg-red-900 hover:bg-red-800 rounded font-semibold text-sm">
              🗑️ Clear Event History
            </button>
          </SettingSection>
          
          {/* Save Button */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saveStatus !== 'idle'}
              className={`flex-1 px-4 py-3 rounded font-semibold transition-all ${
                saveStatus === 'saved'
                  ? 'bg-green-600 text-white'
                  : saveStatus === 'saving'
                  ? 'bg-blue-600 text-white opacity-75'
                  : saveStatus === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white'
              }`}
            >
              {saveStatus === 'saving' && '⏳ Saving...'}
              {saveStatus === 'saved' && '✓ Saved!'}
              {saveStatus === 'error' && '✗ Error'}
              {saveStatus === 'idle' && '💾 Save Settings'}
            </button>
            
            <button
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded font-semibold"
            >
              Reset
            </button>
          </div>
        </div>
        
        {/* Preview Panel */}
        <div>
          <SettingSection title="Preview">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-400 mb-2">Brightness Level</p>
                <div
                  className="bg-amber-100 rounded p-4 border-2 border-amber-900"
                  style={{ opacity: settings.brightness / 100 }}
                >
                  <p className="text-amber-900 font-mono text-center">4x20 LCD</p>
                </div>
              </div>
              
              <div>
                <p className="text-sm text-gray-400 mb-2">Current Settings</p>
                <div className="bg-gray-800 rounded p-3 space-y-1 text-xs font-mono">
                  <p>Brightness: <span className="text-cyan-400">{settings.brightness}%</span></p>
                  <p>Sound: <span className="text-cyan-400">{settings.soundEnabled ? 'ON' : 'OFF'}</span></p>
                  <p>Volume: <span className="text-cyan-400">{settings.soundVolume}%</span></p>
                  <p>Mode: <span className="text-cyan-400">{settings.broadcastMode}</span></p>
                  <p>Retention: <span className="text-cyan-400">{settings.eventRetention}h</span></p>
                </div>
              </div>
              
              <div className="bg-blue-900/30 border border-blue-500 rounded p-3">
                <p className="text-sm text-blue-300">
                  <span className="font-semibold">ℹ️</span> Settings apply immediately to this node's LCD display.
                </p>
              </div>
            </div>
          </SettingSection>
        </div>
      </div>
    </div>
  );
}

interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
}

function SettingSection({ title, children }: SettingSectionProps) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-cyan-400 mb-4">{title}</h3>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

interface SliderSettingProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
  hint?: string;
}

function SliderSetting({ label, value, min, max, unit = '', onChange, hint }: SliderSettingProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="text-gray-300 font-semibold">{label}</label>
        <span className="text-cyan-400 font-mono">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
      />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

interface ToggleSettingProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}

function ToggleSetting({ label, value, onChange, hint }: ToggleSettingProps) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-gray-300 font-semibold">{label}</label>
        <button
          onClick={() => onChange(!value)}
          className={`w-12 h-6 rounded-full transition-all ${
            value ? 'bg-cyan-600' : 'bg-gray-700'
          }`}
        >
          <div
            className={`w-5 h-5 rounded-full bg-white transition-all ${
              value ? 'ml-6' : 'ml-0.5'
            }`}
          />
        </button>
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

interface SelectSettingProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  hint?: string;
}

function SelectSetting({ label, value, options, onChange, hint }: SelectSettingProps) {
  return (
    <div>
      <label className="text-gray-300 font-semibold block mb-2">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
