import React, { useState } from 'react' // Import useState for feedback
import useSettingsStore from '@/store/useSettingsStore'
import { LINE_STYLES, LINE_COLLISION_STYLES } from '../store/lineStyles'
import { COLOR_PRESETS } from '../store/colorPresets'
import { OBJECT_HIGHLIGHT_STYLES } from '../store/highlightStyles'
import { Button } from '@/components/ui/button'
import './SettingsPage.css'

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="settings-row">
      <div className="settings-row__copy">
        <label className="settings-label">{label}</label>
        {description && <p className="settings-description">{description}</p>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="settings-switch"
      />
    </div>
  )
}

function SettingsSection({ title, children, className = '' }) {
  return (
    <section className={`settings-card ${className}`}>
      <h2 className="settings-card__title">{title}</h2>
      <div className="settings-card__body">{children}</div>
    </section>
  )
}

function GeometryTile({ title, children }) {
  return (
    <section className="settings-geometry-tile">
      <h3 className="settings-geometry-tile__title">{title}</h3>
      <div className="settings-geometry-tile__body">{children}</div>
    </section>
  )
}

function SelectField({ label, description, value, onChange, children }) {
  return (
    <div className="settings-field">
      <label className="settings-label">{label}</label>
      {description && <p className="settings-description">{description}</p>}
      <select value={value} onChange={onChange} className="settings-select">
        {children}
      </select>
    </div>
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
    <div className="settings-page">
      <div className="settings-page__inner">
        <header className="settings-page__header">
          <h1 className="settings-page__title">Settings</h1>
        </header>

        <main className="settings-layout">
          <div className="settings-stack">
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
                label="Zoom-Invariant Line & Point Sizing"
                description="Keep lines, tubes, and point markers a consistent apparent size on screen as you zoom in or out, instead of shrinking to invisible or ballooning in world space"
                checked={settings.zoomInvariantSizing}
                onChange={(v) => updateSetting('zoomInvariantSizing', v)}
              />
            </SettingsSection>

            <SettingsSection title="Pre-attentive processing">
              <ToggleRow
                label="Highlight the selected object"
                description="Draw attention to a 3D object when you click it or select its block, using a pre-attentive visual cue."
                checked={settings.objectHighlightEnabled}
                onChange={(v) => updateSetting('objectHighlightEnabled', v)}
              />
              <SelectField
                label="Highlight style"
                description="Blink gently pulses the object's opacity; Glow lights it up with a soft amber halo."
                value={settings.objectHighlightStyle}
                onChange={(e) => updateSetting('objectHighlightStyle', e.target.value)}
              >
                {Object.entries(OBJECT_HIGHLIGHT_STYLES).map(([key, value]) => (
                  <option key={key} value={value}>
                    {key.replace(/_/g, ' ').toLowerCase()}
                  </option>
                ))}
              </SelectField>
            </SettingsSection>
          </div>

          <div className="settings-compact-group">
            <SettingsSection title="Shadows">
              <ToggleRow
                label="Object Shadows"
                description="Let objects receive shadows cast by other objects"
                checked={settings.objectsReceiveShadows}
                onChange={(v) => updateSetting('objectsReceiveShadows', v)}
              />
              <ToggleRow
                label="Camera Shadows"
                description="Let the camera-following headlamp cast shadows. Turning this off leaves the fixed overhead light as the only shadow source."
                checked={settings.cameraShadowsEnabled}
                onChange={(v) => updateSetting('cameraShadowsEnabled', v)}
              />
            </SettingsSection>

            <SettingsSection title="Colors">
              <SelectField
                label="Color Preset"
                description="Each object type (Point, Vector, Line, Plane, Sphere, Cube, Teapot) gets its own color family, and every block matches the color of the object it renders."
                value={settings.colorPreset}
                onChange={(e) => updateSetting('colorPreset', e.target.value)}
              >
                {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>
                    {preset.label}
                  </option>
                ))}
              </SelectField>
            </SettingsSection>

            <SettingsSection title="Camera">
              <ToggleRow
                label="Auto-Frame Camera"
                description="Move the camera to frame the scene on load and whenever a new object is added. When off, only your mouse (and the reset-view button) ever moves the camera."
                checked={settings.autoFocusOnNewObject}
                onChange={(v) => updateSetting('autoFocusOnNewObject', v)}
              />
            </SettingsSection>

            <SettingsSection title="Halos">
              <ToggleRow
                label="Enable Halos"
                description="When a line passes in front of another line, cut a small gap in the farther one right at the crossing, so it reads clearly as passing behind. All three line styles; vectors not yet supported."
                checked={settings.haloEnabled}
                onChange={(v) => updateSetting('haloEnabled', v)}
              />
            </SettingsSection>
          </div>

          <SettingsSection title="Objects & Geometry" className="settings-card--wide">
            <div className="settings-geometry-grid">
              <GeometryTile title="Point">
                <ToggleRow
                  label="Extra Large Points"
                  description={'Render point markers (Point blocks, "show point on object", etc.) 1.6x larger'}
                  checked={settings.extraLargePoints}
                  onChange={(v) => updateSetting('extraLargePoints', v)}
                />
                <ToggleRow
                  label="Matte Points"
                  description="Render point markers with a flat, non-shiny matte finish instead of the default subtle sheen"
                  checked={settings.mattePoints}
                  onChange={(v) => updateSetting('mattePoints', v)}
                />
              </GeometryTile>

              <GeometryTile title="Vector">
                <SelectField
                  label="Vector Style"
                  value={settings.vectorStyle}
                  onChange={(e) => updateSetting('vectorStyle', e.target.value)}
                >
                  {Object.entries(LINE_STYLES).map(([key, value]) => (
                    <option key={key} value={value}>
                      {key.replace(/_/g, ' ').toLowerCase()}
                    </option>
                  ))}
                </SelectField>
                <ToggleRow
                  label="Extra Thick Vectors"
                  description="Render vector shafts (Plain Tube, Ringed Tube, thick Plain Line) at 2.7x their normal thickness"
                  checked={settings.extraThickVectors}
                  onChange={(v) => updateSetting('extraThickVectors', v)}
                />
              </GeometryTile>

              <GeometryTile title="Line">
                <SelectField
                  label="Line Style"
                  value={settings.lineStyle}
                  onChange={(e) => updateSetting('lineStyle', e.target.value)}
                >
                  {Object.entries(LINE_STYLES).map(([key, value]) => (
                    <option key={key} value={value}>
                      {key.replace(/_/g, ' ').toLowerCase()}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Collision Style"
                  description="How a line visually indicates passing through a solid object"
                  value={settings.lineCollisionStyle}
                  onChange={(e) => updateSetting('lineCollisionStyle', e.target.value)}
                >
                  {Object.entries(LINE_COLLISION_STYLES).map(([key, value]) => (
                    <option key={key} value={value}>
                      {key.replace(/_/g, ' ').toLowerCase()}
                    </option>
                  ))}
                </SelectField>
                <ToggleRow
                  label="Extra Thick Lines"
                  description="Render all tube-based line styles (Plain Tube, Ringed Tube, thick Plain Line, collision accents) at 2.7x their normal thickness"
                  checked={settings.extraThickLines}
                  onChange={(v) => updateSetting('extraThickLines', v)}
                />
              </GeometryTile>

              <GeometryTile title="Plane">
                <ToggleRow
                  label="Show Point & Normal"
                  description="Display the point and normal vector that define a point-normal plane, alongside the plane itself"
                  checked={settings.showPlanePointNormal}
                  onChange={(v) => updateSetting('showPlanePointNormal', v)}
                />
              </GeometryTile>

              <GeometryTile title="Teapot">
                <ToggleRow
                  label="Show Gridlines"
                  description="Display mesh edge lines on teapot objects"
                  checked={settings.teapotShowGridlines}
                  onChange={(v) => updateSetting('teapotShowGridlines', v)}
                />
              </GeometryTile>

              <GeometryTile title="Sphere">
                <ToggleRow
                  label="Show Gridlines"
                  description="Display latitude/longitude edge lines on sphere objects"
                  checked={settings.sphereShowGridlines}
                  onChange={(v) => updateSetting('sphereShowGridlines', v)}
                />
              </GeometryTile>

              <GeometryTile title="Cube">
                <ToggleRow
                  label="Outline Edges"
                  description="Draw the 12 edge lines around cube objects"
                  checked={settings.cubeShowEdges}
                  onChange={(v) => updateSetting('cubeShowEdges', v)}
                />
              </GeometryTile>
            </div>
          </SettingsSection>

          <SettingsSection title="Axis" className="settings-card--wide">
            <ToggleRow
              label="Show Axis Toggle in Scene"
              description="Show a quick on/off button for the axes in the 3D view's controls, next to Reset View"
              checked={settings.showAxisToggleButton}
              onChange={(v) => updateSetting('showAxisToggleButton', v)}
            />
            <ToggleRow
              label="Show Origin Label"
              description="Label the origin with a small 'O' next to its marker"
              checked={settings.showOriginLabel}
              onChange={(v) => updateSetting('showOriginLabel', v)}
            />
            <ToggleRow
              label="Show Scale Labels"
              description="Show numeric labels (5, 10, 15...) at the tick marks along each axis"
              checked={settings.showAxisScaleLabels}
              onChange={(v) => updateSetting('showAxisScaleLabels', v)}
            />
            <ToggleRow
              label="Show Axis Gizmo"
              description="Show a small always-visible orientation compass in the corner of the 3D view, independent of whether the in-scene axes are shown"
              checked={settings.showAxisGizmo}
              onChange={(v) => updateSetting('showAxisGizmo', v)}
            />
          </SettingsSection>

          <div className="settings-actions">
            <Button onClick={handleSave} className="settings-save-button">
              {isSaving ? 'Saved!' : 'Save Changes'}
            </Button>

            <Button variant="outline" onClick={resetSettings} className="settings-reset-button">
              Reset Defaults
            </Button>
          </div>
        </main>
      </div>
    </div>
  )
}
