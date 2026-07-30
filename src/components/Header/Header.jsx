import { Link, NavLink } from 'react-router-dom'
import GeoScratchLogo from '@/components/Brand/GeoScratchLogo.jsx'

function navLinkClass(isActive) {
  // Use h-full and items-center inside the link to lock vertical alignment completely
  return `flex h-full items-center px-4 rounded-lg text-sm transition-all duration-200 ease-out no-underline ${isActive
      ? 'bg-white/15 text-white shadow-sm'
      : 'text-white/75 hover:text-white hover:bg-white/5 active:bg-white/10'
    }`
}

export default function Header() {
  return (
    <header className="app-nav flex h-14 w-full items-center justify-between bg-[#002ea6] px-6 sm:px-8 shadow-md border-b border-white/10 z-[999] shrink-0 select-none">
      <Link to="/landing" className="app-nav__logo flex items-center gap-2 no-underline text-white">
        <GeoScratchLogo showWordmark compact />
      </Link>

      <nav className="landing-nav__links flex h-full items-center justify-center gap-2 pr-2 py-2" aria-label="Main Navigation">
        <NavLink to="/exercise" className={({ isActive }) => navLinkClass(isActive)}>
          Exercise
        </NavLink>
        <NavLink to="/sandbox" className={({ isActive }) => navLinkClass(isActive)}>
          Sandbox
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => navLinkClass(isActive)}>
          Settings
        </NavLink>
      </nav>
    </header>
  )
}
