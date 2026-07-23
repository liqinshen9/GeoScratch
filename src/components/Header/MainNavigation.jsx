import React from 'react'
import { Link, NavLink } from 'react-router-dom'
import GeoScratchLogo from '@/components/Brand/GeoScratchLogo.jsx'

function landingNavLinkClass(isActive) {
  return `landing-nav__link${isActive ? ' is-active' : ''}`
}

export default function MainNavigation({ extraClass = '' }) {
  return (
    <header className={`landing-nav ${extraClass}`}>
      <Link to="/" className="landing-nav__logo app-nav__logo">
        <GeoScratchLogo showWordmark compact />
      </Link>

      <nav className="landing-nav__links" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => landingNavLinkClass(isActive)}>
          Home
        </NavLink>
        <NavLink to="/exercise" className={({ isActive }) => landingNavLinkClass(isActive)}>
          Exercise
        </NavLink>
        <NavLink to="/sandbox" className={({ isActive }) => landingNavLinkClass(isActive)}>
          Sandbox
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => landingNavLinkClass(isActive)}>
          Settings
        </NavLink>
      </nav>
    </header>
  )
}
