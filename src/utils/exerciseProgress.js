// Which exercises the student has completed, kept in localStorage so the
// browser can show progress across sessions on this device. This is a local
// convenience only: when the Supabase backend is enabled, exercise_attempts is
// the authoritative record (see docs/architecture/backend.md). Nothing here
// talks to the backend.

const STORAGE_KEY = 'geoscratch:solved-exercises'

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const ids = raw ? JSON.parse(raw) : []
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []
  } catch {
    // No storage (private mode, disabled, SSR): behave as "nothing solved".
    return []
  }
}

function write(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Storage unavailable -- progress simply won't persist this session.
  }
}

/** The set of solved exercise ids. */
export function getSolvedExerciseIds() {
  return new Set(read())
}

export function isExerciseSolved(id) {
  return read().includes(id)
}

/** Record an exercise as solved. Returns true when it was not already solved. */
export function markExerciseSolved(id) {
  const ids = read()
  if (ids.includes(id)) return false
  write([...ids, id])
  return true
}

/**
 * Drop an exercise's solved mark -- used when a previously-passing workspace is
 * edited into an incorrect state. Returns true when it had been solved.
 */
export function unmarkExerciseSolved(id) {
  const ids = read()
  if (!ids.includes(id)) return false
  write(ids.filter((existing) => existing !== id))
  return true
}

export function clearSolvedExercises() {
  write([])
}
