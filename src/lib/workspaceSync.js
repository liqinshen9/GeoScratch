import { supabase, isSupabaseConfigured } from './supabaseClient'

/**
 * Phase 2: mirrors the in-progress Blockly workspace XML to
 * `workspace_snapshots` so an accidental tab close does not lose work. One row
 * per (participant, workspace_id); only the latest state is kept.
 *
 * All of this is a no-op when the backend is not configured or the user is not
 * signed in yet -- see docs/architecture/backend.md.
 */

/** Whether a cloud push/pull should run right now. */
export function shouldSync(authStatus) {
  return isSupabaseConfigured && authStatus === 'ready'
}

/**
 * Given the locally-restored XML and a cloud snapshot row, decide what to load.
 * Cloud wins when present: study machines may be shared or have their site data
 * cleared between sessions, so the server copy is the source of truth.
 *
 * @returns {string|null} the XML to load, or null to keep whatever is there
 */
export function chooseSnapshot({ local, cloud }) {
  if (cloud && typeof cloud.xml === 'string' && cloud.xml.length > 0) return cloud.xml
  if (typeof local === 'string' && local.length > 0) return local
  return null
}

/** Fetch this workspace's snapshot for the current user, or null. */
export async function fetchSnapshot(workspaceId) {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase
    .from('workspace_snapshots')
    .select('xml, updated_at')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) {
    console.error('[GeoScratch] Failed to fetch workspace snapshot:', error)
    return null
  }
  return data
}

/** Upsert this workspace's latest XML. Fire-and-forget; never blocks the editor. */
export function pushSnapshot({ profileId, workspaceId, exerciseNumber, xml }) {
  if (!isSupabaseConfigured || !profileId) return
  supabase
    .from('workspace_snapshots')
    .upsert(
      {
        profile_id: profileId,
        workspace_id: workspaceId,
        exercise_number: exerciseNumber ?? null,
        xml,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id,workspace_id' },
    )
    .then(({ error }) => {
      if (error) console.error('[GeoScratch] Failed to push workspace snapshot:', error)
    })
}
