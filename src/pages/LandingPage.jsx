import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--geo-bg)] px-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-bold text-[var(--geo-text)]">GeoScratch</h1>
        <p className="mt-3 text-base text-[var(--geo-text-muted)]">
          Build 3D geometry with blocks and see the result live.
        </p>
        <Link
          to="/sandbox"
          className="mt-8 inline-block rounded-md bg-[var(--geo-gold)] px-6 py-2.5 text-base font-semibold text-[var(--geo-text)] hover:bg-[var(--geo-butter)]"
        >
          Open sandbox
        </Link>
      </div>
    </div>
  )
}
