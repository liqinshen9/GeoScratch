import React from 'react'
import { Link } from 'react-router-dom'
import useSettingsStore from '@/store/useSettingsStore'
import { LINE_STYLES } from '../store/lineStyles'
import { Button } from '@/components/ui/button'
import MainNavigation from '@/components/Header/MainNavigation'

export default function SettingsPage() {
  const { settings, updateSetting, resetSettings } = useSettingsStore()

  return (
    <div className="landing-page min-h-screen flex flex-col">
      
      <MainNavigation />

      {/* Clean, high-contrast container */}
      <div className="flex-1 w-full max-w-2xl mx-auto px-6 py-12 flex flex-col gap-8 text-left">
        <header className="border-b border-slate-300 pb-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Application Settings
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Customize your 3D workspace environment variables
          </p>
        </header>

        <main className="flex flex-col gap-6">
          {/* Toggle Option - Light Theme Card */}
          <section className="flex items-center justify-between p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
            <div>
              <label htmlFor="showLabels" className="text-sm font-semibold text-slate-900 block">
                Show Labels
              </label>
              <span className="text-xs text-slate-500">
                Display element names dynamically in the 3D viewport canvas
              </span>
            </div>
            <input
              id="showLabels"
              type="checkbox"
              checked={settings.showLabels}
              onChange={(e) => updateSetting('showLabels', e.target.checked)}
              className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
            />
          </section>

          {/* Range Slider - Light Theme Card */}
          <section className="flex flex-col gap-3 p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center">
              <label htmlFor="gridOpacity" className="text-sm font-semibold text-slate-900">
                Grid Opacity
              </label>
              <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                {Math.round(settings.gridOpacity * 100)}%
              </span>
            </div>
            <input
              id="gridOpacity"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={settings.gridOpacity}
              onChange={(e) => updateSetting('gridOpacity', parseFloat(e.target.value))}
              className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
          </section>

          {/* Dropdown Selector - Light Theme Card */}
          <section className="flex flex-col gap-2 p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
            <label htmlFor="lineStyle" className="text-sm font-semibold text-slate-900 block">
              Line Style
            </label>
            <select
              id="lineStyle"
              value={settings.lineStyle}
              onChange={(e) => updateSetting('lineStyle', e.target.value)}
              className="w-full p-2.5 rounded-lg bg-white border border-slate-300 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer outline-none"
            >
              {Object.entries(LINE_STYLES).map(([key, value]) => (
                <option key={key} value={value}>
                  {key.replace(/_/g, ' ').toLowerCase()}
                </option>
              ))}
            </select>
          </section>

          {/* Active Buttons - High Contrast */}
          <div className="flex gap-4 items-center justify-end pt-4 mt-2 border-t border-slate-300">
            <Link to="/exercise">
              <Button type="button" className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5">
                Back to Exercises
              </Button>
            </Link>
            <Button 
              variant="outline" 
              type="button" 
              onClick={resetSettings}
              className="border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              Reset Defaults
            </Button>
          </div>
        </main>
      </div>
    </div>
  )
}
