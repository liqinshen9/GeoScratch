import { Link, NavLink, useLocation } from 'react-router-dom'
import GeoScratchLogo from '@/components/Brand/GeoScratchLogo.jsx'
import useSettingsStore from '@/store/useSettingsStore'
import { THEMES } from '@/store/themeConfig'

const SUN_PATH =
  'M12 4V2M12 22v-2M4 12H2m20 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z'
const MOON_PATH = 'M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z'

// A plain light/dark switch. The icon shows the CURRENT theme (sun = light,
// moon = dark); clicking flips to the other. `system` is an opt-in from Settings.
function ThemeToggle() {
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme)
  const updateSetting = useSettingsStore((s) => s.updateSetting)
  const themeLocked = useSettingsStore((s) => Object.hasOwn(s.exerciseOverrides, 'theme'))

  const isDark = resolvedTheme === 'dark'
  const next = isDark ? THEMES.LIGHT : THEMES.DARK
  const label = `Switch to ${next} theme`

  return (
    <button
      type="button"
      onClick={() => updateSetting('theme', next)}
      disabled={themeLocked}
      title={themeLocked ? 'Theme set by the current exercise' : label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d={isDark ? MOON_PATH : SUN_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

function navLinkClass(isActive) {
  // Use h-full and items-center inside the link to lock vertical alignment completely
  return `flex h-full items-center px-4 rounded-lg text-sm transition-all duration-200 ease-out no-underline ${
    isActive
      ? 'bg-white/15 text-white shadow-sm'
      : 'text-white/75 hover:text-white hover:bg-white/5 active:bg-white/10'
  }`
}

export default function Header() {
  const location = useLocation()
  // Both /exercises (the browser) and /exercise/:n (an open exercise) should
  // read as "you're in the exercise area" -- NavLink's own isActive only
  // matches its own `to` prefix, which wouldn't cover both paths at once.
  const isExerciseAreaActive = location.pathname.startsWith('/exercise')

  return (
    <header className="app-nav flex h-14 w-full items-center justify-between bg-[var(--nav-bg)] px-6 sm:px-8 shadow-md border-b border-white/10 z-[999] shrink-0 select-none">
      <Link to="/landing" className="app-nav__logo flex items-center gap-2 no-underline text-white">
        <GeoScratchLogo showWordmark compact />
      </Link>

      <nav
        className="landing-nav__links flex h-full items-center justify-center gap-2 pr-2 py-2"
        aria-label="Main Navigation"
      >
        <NavLink to="/exercises" className={navLinkClass(isExerciseAreaActive)}>
          Exercises
        </NavLink>
        <NavLink to="/sandbox" className={({ isActive }) => navLinkClass(isActive)}>
          Sandbox
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => navLinkClass(isActive)}>
          Settings
        </NavLink>
        <ThemeToggle />
      </nav>
    </header>
  )
}
