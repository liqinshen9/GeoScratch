// App theme (light / dark / follow the OS). The resolved value -- always
// 'light' or 'dark' -- is what every consumer actually styles against; see
// docs/architecture/theming.md.

export const THEMES = Object.freeze({
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
})

// Default to an explicit light theme. `system` is opt-in from Settings.
export const DEFAULT_THEME = THEMES.LIGHT

export const RESOLVED_THEMES = Object.freeze(['light', 'dark'])

const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)'

/** True when the OS is asking for a dark UI (false in non-browser contexts). */
export function systemPrefersDark() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(PREFERS_DARK_QUERY).matches
}

/**
 * Collapse a `theme` setting to the concrete scheme to paint.
 * @param {string} theme  one of THEMES
 * @param {boolean} [prefersDark]  OS preference; defaults to a live media check
 * @returns {'light' | 'dark'}
 */
export function resolveTheme(theme, prefersDark = systemPrefersDark()) {
  if (theme === THEMES.LIGHT || theme === THEMES.DARK) return theme
  return prefersDark ? THEMES.LIGHT : THEMES.DARK
}

/** Subscribe to OS light/dark changes. Returns an unsubscribe function. */
export function watchSystemTheme(callback) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(PREFERS_DARK_QUERY)
  const handler = (event) => callback(event.matches)
  mql.addEventListener('change', handler)
  return () => mql.removeEventListener('change', handler)
}

export const THEME_STORAGE_KEY = 'geoscratch:theme'
