import React, { useState } from 'react' // Import useState for feedback
import useSettingsStore from '@/store/useSettingsStore'
import { LINE_STYLES } from '../store/lineStyles'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  const { settings, updateSetting, resetSettings } = useSettingsStore()
  const [isSaving, setIsSaving] = useState(false)

  // A proper save action that doesn't force navigation
  const handleSave = () => {
    setIsSaving(true)
    // Perform any API calls here if needed
    setTimeout(() => setIsSaving(false), 500) // Simulate saving
  }

  return (
    <div className="bg-white h-[calc(100dvh-var(--app-nav-height))] overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-10 h-full">
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Settings</h1>
        </header>

        <main className="space-y-10">
          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-2">
              3D View Settings
            </h2>

            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-slate-900">Show 3D Labels</label>
                  <p className="text-xs text-slate-500 mt-0.5">Display names of elements in the viewport</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showLabels}
                  onChange={(e) => updateSetting('showLabels', e.target.checked)}
                  className="w-5 h-5 accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-slate-900">Grid Opacity</label>
                  <span className="text-xs font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                    {Math.round(settings.gridOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0" max="1" step="0.1"
                  value={settings.gridOpacity}
                  onChange={(e) => updateSetting('gridOpacity', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-slate-900">Show Grid &amp; Axes</label>
                  <p className="text-xs text-slate-500 mt-0.5">Display the grid, bounding box, and axes in the viewport. Turn off to see only the geometric objects</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showSceneChrome}
                  onChange={(e) => updateSetting('showSceneChrome', e.target.checked)}
                  className="w-5 h-5 accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-slate-900">Light Background</label>
                  <p className="text-xs text-slate-500 mt-0.5">Use a light background in the 3D viewport instead of dark</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.sceneBackground === 'light'}
                  onChange={(e) => updateSetting('sceneBackground', e.target.checked ? 'light' : 'dark')}
                  className="w-5 h-5 accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Line Style</label>
                <select
                  value={settings.lineStyle}
                  onChange={(e) => updateSetting('lineStyle', e.target.value)}
                  className="w-full p-2.5 rounded border border-slate-300 text-sm focus:border-indigo-500 outline-none"
                >
                  {Object.entries(LINE_STYLES).map(([key, value]) => (
                    <option key={key} value={value}>
                      {key.replace(/_/g, ' ').toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <div className="pt-8 border-t border-slate-100 flex items-center gap-4">
            <Button
              onClick={handleSave}
              className="bg-indigo-600 hover:bg-indigo-700 h-9 px-6 text-sm font-medium"
            >
              {isSaving ? 'Saved!' : 'Save Changes'}
            </Button>

            <Button
              variant="outline"
              onClick={resetSettings}
              className="h-9 px-4 text-sm font-medium border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              Reset Defaults
            </Button>
          </div>
        </main>
      </div>
    </div>
  )
}
