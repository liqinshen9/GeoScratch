import { Navigate } from 'react-router-dom'
import { UNITS } from '@/data/exercises'

// The browser has no standalone overview any more: the unit page carries the
// full unit list in its rail, so /exercises just opens the first unit.
export default function ExerciseBrowserPage() {
  return <Navigate to={`/exercises/${UNITS[0].id}`} replace />
}
