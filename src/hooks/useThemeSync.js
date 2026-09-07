import { useEffect, useSyncExternalStore } from 'react'
import useSettingsStore from '@/store/useSettingsStore'
import { resolveTheme, systemPrefersDark, watchSystemTheme } from '@/store/themeConfig'

// Live OS preference as an external store, so components re-render when the
// user flips their system appearance while `theme: 'system'`.
function subscribePrefersDark(callback) {
  return watchSystemTheme(() => callback())
}

function usePrefersDark() {
  return useSyncExternalStore(
    subscribePrefersDark,
    () => systemPrefersDark(),
    () => false,
  )
}

/**
 * Keeps `document.documentElement[data-theme]` and the store's `resolvedTheme`
 * in step with the `theme` setting and the OS preference. Mount once, near the
 * app root (see layout/Layout.jsx). The pre-paint value is set by the inline
 * script in index.html; this hook takes over once React is running.
 */
export default function useThemeSync() {
  const theme = useSettingsStore((s) => s.settings.theme)
  const setResolvedTheme = useSettingsStore((s) => s.setResolvedTheme)
  const prefersDark = usePrefersDark()

  const resolved = resolveTheme(theme, prefersDark)

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = resolved
    }
    setResolvedTheme(resolved)
  }, [resolved, setResolvedTheme])
}

/** Read the concrete scheme ('light' | 'dark') in a component. */
export function useResolvedTheme() {
  return useSettingsStore((s) => s.resolvedTheme)
}
