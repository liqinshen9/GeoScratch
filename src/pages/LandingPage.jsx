import { Link } from 'react-router-dom'
import GeoScratchLogo from '@/components/Brand/GeoScratchLogo.jsx'
import './LandingPage.css'

export default function LandingPage() {
  return (
    <div className="landing-page">
      {/* Absolute backdrop block creating the background swoop */}
      <div className="landing-curve-swoop" aria-hidden="true" />

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
