import React, { useState } from 'react' // Import useState for feedback
import useSettingsStore from '@/store/useSettingsStore'
import { LINE_STYLES, LINE_COLLISION_STYLES } from '../store/lineStyles'
import { Button } from '@/components/ui/button'

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <label className="text-sm font-medium text-slate-900">{label}</label>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 accent-indigo-600 cursor-pointer"
      />
    </div>
  )
}

function SettingsSection({ title, children }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-2">
        {title}
      </h2>
      <div className="space-y-8">{children}</div>
    </section>
  )
}

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
          <SettingsSection title="Scene">
            <ToggleRow
              label="Show 3D Labels"
              description="Display names of elements in the viewport"
              checked={settings.showLabels}
              onChange={(v) => updateSetting('showLabels', v)}
            />
            <ToggleRow
              label="Show Grid"
              description="Display the ground grid in the viewport"
              checked={settings.showGrid}
              onChange={(v) => updateSetting('showGrid', v)}
            />
            <ToggleRow
              label="Show Box"
              description="Display the bounding box in the viewport"
              checked={settings.showBox}
              onChange={(v) => updateSetting('showBox', v)}
            />
            <ToggleRow
              label="Show Box Front Wireframe"
              description="Display the wireframe on whichever box wall is currently facing the camera"
              checked={settings.showBoxFrontWireframe}
              onChange={(v) => updateSetting('showBoxFrontWireframe', v)}
            />
            <ToggleRow
              label="Show Axes"
              description="Display the X, Y, Z axes and axis labels in the viewport"
              checked={settings.showAxes}
              onChange={(v) => updateSetting('showAxes', v)}
            />
            <ToggleRow
              label="Object Shadows"
              description="Let objects receive shadows cast by other objects"
              checked={settings.objectsReceiveShadows}
              onChange={(v) => updateSetting('objectsReceiveShadows', v)}
            />
          </SettingsSection>

          <SettingsSection title="Camera">
            <ToggleRow
              label="Auto-Frame Camera"
              description="Move the camera to frame the scene on load and whenever a new object is added. When off, only your mouse (and the reset-view button) ever moves the camera."
              checked={settings.autoFocusOnNewObject}
              onChange={(v) => updateSetting('autoFocusOnNewObject', v)}
            />
          </SettingsSection>

          <SettingsSection title="Sphere">
            <ToggleRow
              label="Show Gridlines"
              description="Display latitude/longitude edge lines on sphere objects"
              checked={settings.sphereShowGridlines}
              onChange={(v) => updateSetting('sphereShowGridlines', v)}
            />
          </SettingsSection>

          <SettingsSection title="Teapot">
            <ToggleRow
              label="Show Gridlines"
              description="Display mesh edge lines on teapot objects"
              checked={settings.teapotShowGridlines}
              onChange={(v) => updateSetting('teapotShowGridlines', v)}
            />
          </SettingsSection>

          <SettingsSection title="Vector Line">
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

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Collision Style</label>
              <p className="text-xs text-slate-500 mt-0.5">
                How a plain-tube line looks where it passes through a solid object
              </p>
              <select
                value={settings.lineCollisionStyle}
                onChange={(e) => updateSetting('lineCollisionStyle', e.target.value)}
                className="w-full p-2.5 rounded border border-slate-300 text-sm focus:border-indigo-500 outline-none"
              >
                {Object.entries(LINE_COLLISION_STYLES).map(([key, value]) => (
                  <option key={key} value={value}>
                    {key.replace(/_/g, ' ').toLowerCase()}
                  </option>
                ))}
              </select>
            </div>

            <ToggleRow
              label="Thick Line Primitives"
              description="Render Plain Line and Illuminated Line as thin solid tubes instead of hairline GL lines"
              checked={settings.thickLinePrimitives}
              onChange={(v) => updateSetting('thickLinePrimitives', v)}
            />
          </SettingsSection>

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
