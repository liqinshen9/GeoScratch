import React, { useState, useRef, useEffect } from 'react'
import useSceneStore from '@/store/useSceneStore'
import { LINE_STYLES } from '@/store/lineStyles'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { SettingConfig } from '@icon-park/react'

export default function ViewSettingsDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  const settings = useSceneStore((state) => state.settings)
  const updateSetting = useSceneStore((state) => state.updateSetting)

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Maps your enum values strictly to readable UI labels for the selection list
  const stylesList = [
    { id: LINE_STYLES.PLAIN_LINE, name: 'Plain Lines' },
    { id: LINE_STYLES.ILLUMINATED_LINE, name: 'Illuminated Lines' },
    { id: LINE_STYLES.PLAIN_TUBE, name: 'Plain Tubes (Cylinders)' },
    { id: LINE_STYLES.RINGED_TUBE, name: 'Ringed Tubes' },
  ]

  return (
    <div className="relative inline-block text-left" ref={containerRef}>

      {/* Trigger element matching header navigation interaction */}
      <div
        className="flex items-center gap-1.5 cursor-pointer opacity-90 hover:opacity-100 transition-opacity py-1 select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <SettingConfig
          theme="outline"
          size="22"
          fill="#ffffff"
        />
        <span className="text-sm font-medium text-white tracking-wide hidden sm:inline">
          View Options
        </span>
      </div>

      {/* Styled Dropdown Panel matched to your Workspace Flyout UI */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-64 rounded-xl bg-white border border-slate-200 p-4 shadow-lg z-50 space-y-4 text-left">

          {/* Header Title Matching Category Headers */}
          <div className="text-xs font-bold uppercase tracking-wider text-indigo-900">
            Line Glyph Style
          </div>

          <div className="h-[1px] w-full bg-slate-100" />

          {/* Vertical Glyph Selection List */}
          <div className="flex flex-col gap-1">
            {stylesList.map((style) => {
              const isActive = settings.lineStyle === style.id
              return (
                <button
                  key={style.id}
                  onClick={() => updateSetting('lineStyle', style.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                      ? 'bg-indigo-50 text-indigo-900 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  {style.name}
                </button>
              )
            })}
          </div>

          <div className="h-[1px] w-full bg-slate-100" />

          {/* Global Visibility Overlay Headers */}
          <div className="text-xs font-bold uppercase tracking-wider text-indigo-900">
            Overlays
          </div>

          {/* Active Label Layer Configuration Row */}
          <div className="flex items-center justify-between gap-4">
            <Label
              htmlFor="toggle-labels"
              className="text-sm font-medium text-slate-600 cursor-pointer select-none"
            >
              Show Text Labels
            </Label>
            <Switch
              id="toggle-labels"
              checked={settings.showLabels ?? true}
              onCheckedChange={(checked) => updateSetting('showLabels', checked)}
              className="data-[state=checked]:bg-indigo-600"
            />
          </div>

        </div>
      )}
    </div>
  )
}
