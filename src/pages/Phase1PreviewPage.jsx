import { useCallback, useEffect, useMemo, useState } from 'react'
import Scene3D from '@/components/Scene3D/Scene3D'
import useSettingsStore from '@/store/useSettingsStore'
import { TECHNIQUES, getTechnique } from '@/study/phase1/conditions'
import { getStudyStimulusSet, findStimulus, generateStimulus } from '@/study/phase1/stimuli'
import { resolveSequence } from '@/study/phase1/sequence'
import { buildStimulusScene } from '@/study/phase1/buildStimulusScene'
import { targetLabelKeys, toggleLabelKeys } from '@/study/phase1/labelToggle'
import {
  VIEWPORT,
  DIFFICULTY_LEVELS,
  CLUTTER_LEVELS,
  PAIR_TYPES,
  DEPTH_SEPARATIONS,
} from '@/study/phase1/stimulusConfig'
import '@/components/EditorShell/editor-shell.css'
import './StudyPhase1Page.css'

// Dev-only (routed only when import.meta.env.DEV): look at any stimulus under
// any technique, or generate ad-hoc stimuli at a chosen difficulty, for pilot
// calibration of DEPTH_SEPARATIONS. See docs/architecture/study-phase1.md.

export default function Phase1PreviewPage() {
  const stimulusSet = useMemo(() => getStudyStimulusSet(), [])
  const allStimuli = useMemo(
    () => [...stimulusSet.practice, ...stimulusSet.measured],
    [stimulusSet],
  )
  const [techniqueId, setTechniqueId] = useState('T1')
  const [source, setSource] = useState('set')
  const [stimulusId, setStimulusId] = useState(stimulusSet.measured[0].id)
  const [custom, setCustom] = useState({
    seed: 'pilot-1',
    clutter: 'low',
    difficulty: 'medium',
    pairType: 'line-line',
    nearer: 'A',
  })
  const [orbit, setOrbit] = useState(false)
  const [code, setCode] = useState('P01')

  const stimulus = useMemo(() => {
    if (source === 'set') return findStimulus(stimulusSet, stimulusId)
    try {
      return generateStimulus({ id: 'custom', ...custom })
    } catch (err) {
      console.error('[GeoScratch] Preview stimulus failed:', err)
      return null
    }
  }, [source, stimulusSet, stimulusId, custom])

  const [scene, setScene] = useState(null)
  const [labelsOff, setLabelsOff] = useState(() => new Set())
  useEffect(() => {
    useSettingsStore.getState().setExerciseOverrides(getTechnique(techniqueId).settings)
    setScene(stimulus ? buildStimulusScene(stimulus) : null)
    setLabelsOff(new Set())
  }, [techniqueId, stimulus])

  const handleObjectClick = useCallback(
    (object) => {
      const keys = targetLabelKeys(stimulus, object)
      if (keys.length) setLabelsOff((current) => toggleLabelKeys(current, keys))
    },
    [stimulus],
  )

  const hiddenLabelKeys = useMemo(
    () => new Set([...(scene?.hiddenLabelKeys ?? []), ...labelsOff]),
    [scene, labelsOff],
  )

  useEffect(() => () => useSettingsStore.getState().clearExerciseOverrides(), [])

  const sequence = useMemo(() => resolveSequence(code, stimulusSet), [code, stimulusSet])
  const setCustomField = (key) => (e) => setCustom((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="phase1-preview">
      <div className="phase1-preview__controls">
        <h1 className="text-lg font-semibold">Phase 1 preview (dev only)</h1>

        <label>
          Technique
          <select value={techniqueId} onChange={(e) => setTechniqueId(e.target.value)}>
            {TECHNIQUES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id}: {t.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Source
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="set">Study stimulus set</option>
            <option value="custom">Ad-hoc stimulus</option>
          </select>
        </label>

        {source === 'set' ? (
          <label>
            Stimulus
            <select value={stimulusId} onChange={(e) => setStimulusId(e.target.value)}>
              {allStimuli.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} ({s.clutter}, {s.difficulty}, {s.pairType})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Seed
              <input type="text" value={custom.seed} onChange={setCustomField('seed')} />
            </label>
            <label>
              Difficulty (gaps: {JSON.stringify(DEPTH_SEPARATIONS)})
              <select value={custom.difficulty} onChange={setCustomField('difficulty')}>
                {DIFFICULTY_LEVELS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Clutter
              <select value={custom.clutter} onChange={setCustomField('clutter')}>
                {CLUTTER_LEVELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Pair type
              <select value={custom.pairType} onChange={setCustomField('pairType')}>
                {PAIR_TYPES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Nearer target
              <select value={custom.nearer} onChange={setCustomField('nearer')}>
                <option>A</option>
                <option>B</option>
              </select>
            </label>
          </>
        )}

        <label className="flex-row items-center gap-2" style={{ flexDirection: 'row' }}>
          <input type="checkbox" checked={orbit} onChange={(e) => setOrbit(e.target.checked)} />
          Allow orbit (inspection only; untick to reset the camera)
        </label>

        <div className="phase1-preview__info">
          {stimulus
            ? `nearer: ${stimulus.nearer}\ndepths: A ${stimulus.depths.A}, B ${stimulus.depths.B}\ngap: ${stimulus.depthGap}\ncrossing (NDC): ${stimulus.crossingNdc.join(', ')}\nobjects: ${stimulus.objects.map((o) => `${o.key}:${o.kind}`).join(' ')}`
            : 'Could not place this stimulus; try another seed.'}
        </div>

        <label>
          Participant code
          <input type="text" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <div className="phase1-preview__info">
          {`square row: ${sequence.squareRow}\norder: ${sequence.techniqueOrder.join(' ')}`}
        </div>
      </div>

      <div
        className="study-phase1__stage"
        style={{ width: VIEWPORT.width, height: VIEWPORT.height }}
      >
        <Scene3D
          key={orbit ? 'orbit' : 'fixed'}
          objects={scene?.objects ?? []}
          interactive={orbit}
          hiddenLabelKeys={hiddenLabelKeys}
          onObjectClick={handleObjectClick}
        />
      </div>
    </div>
  )
}
