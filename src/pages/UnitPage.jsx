import { Navigate } from 'react-router-dom'

// Keep existing unit bookmarks working; all challenges now live on the cards.
export default function UnitPage() {
  return <Navigate to="/exercises" replace />
}
