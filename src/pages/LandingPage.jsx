import { Link, NavLink } from 'react-router-dom'
import GeoScratchLogo from '@/components/Brand/GeoScratchLogo.jsx'
import './LandingPage.css'

function landingNavLinkClass(isActive) {
  return `landing-nav__link${isActive ? ' is-active' : ''}`
}

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link to="/" className="landing-nav__logo app-nav__logo">
          <GeoScratchLogo showMark={false} showWordmark />
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
        </nav>
      </header>

      <main className="landing-hero">
        <div className="landing-hero__content">
          <h1 className="landing-hero__title">
            <span className="landing-hero__title-line">
              Snap blocks together.
            </span>
            <span className="landing-hero__title-line landing-hero__accent">
              See it in 3D.
            </span>
          </h1>

          <div className="landing-hero__actions">
            <Link to="/sandbox" className="landing-btn landing-btn--primary">
              Open sandbox
            </Link>
          </div>
        </div>

        <div className="landing-hero__mark" aria-hidden="true">
          <GeoScratchLogo />
        </div>
      </main>
    </div>
  )
}
