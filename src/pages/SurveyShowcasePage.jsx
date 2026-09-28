import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Scene3D from '@/components/Scene3D/Scene3D'
import useSettingsStore, { DEFAULT_SETTINGS } from '@/store/useSettingsStore'
import { getTechnique } from '@/study/phase1/conditions'
import { CONFIGURATIONS, configurationSettings } from '@/study/session/holistic'
import { buildSceneFromXml } from '@/study/phase1/buildStimulusScene'
import { stimulusToXml } from '@/study/phase1/stimulusToXml'
import { positionFromOrbit, DEFAULT_CAMERA_VIEW } from '@/components/Scene3D/sceneConstants'
import './StudyPhase1Page.css'

// Dev-only (routed only when import.meta.env.DEV): one hand-built scene where
// every Phase 1 cue shows at once, for the questionnaire screenshots
// (scripts/surveyScreenshots.mjs). ?t=T1..T10 picks a Phase 1 technique;
// ?c=C1 / C2 a holistic configuration (baseline / perception-driven).

// The camera looks at the room's centre, but the near floor corner projects
// lower than the back corner, so the room sits low in the frame. Render on a
// taller canvas and show only the window around the room (measured once; the
// scene and camera are fixed).
const CANVAS = { width: 900, height: 1300 }
const CROP = { top: 251, height: 915 }

// The editor's default viewing angle, far enough back to show the whole room. Objects sit around the origin,
// larger than in a trial so they read at this distance; the floor and walls
// catch the shadows.
const CAMERA_POSITION = positionFromOrbit({ ...DEFAULT_CAMERA_VIEW, distance: 116 })

const SHOWCASE = {
  id: 'survey-showcase',
  colourSalt: 0,
  objects: [
    { key: 'cube', kind: 'cube', centre: [0, 0, 0], size: 8 },
    { key: 'sphere', kind: 'sphere', centre: [-7, -5.5, 11], radius: 4.5 },
    { key: 'point', kind: 'point', position: [-9, 5, 8] },
    { key: 'through', kind: 'line', origin: [0, 0, 0], direction: [4, 1, 3] },
    { key: 'cross', kind: 'line', origin: [-5, 3, 10], direction: [2, -1, -5] },
    // Passes in front of 'cross' right of the cube, so a halo shows in the open.
    { key: 'front', kind: 'line', origin: [8, 0.5, -11.5], direction: [-7, 12, -2] },
    { key: 'vec', kind: 'vector', origin: [-15, -8, -4], vector: [20, 9, -5] },
  ],
}

const SCENE_SETTINGS = {
  showGrid: false,
  showAxes: false,
  showAxisGizmo: false,
  showBoxFrontWireframe: false,
  showLabels: false,
}

// A holistic task runs in the editor, so a configuration layers over the app
// defaults rather than a Phase 1 technique, and keeps its labels: label detail
// is part of what the two configurations change.
const CONFIGURATION_VIEWS = [
  { id: 'C1', label: 'Baseline configuration', configuration: CONFIGURATIONS.BASELINE },
  { id: 'C2', label: 'Perception-driven configuration', configuration: CONFIGURATIONS.PERCEPTION },
]

function resolveView(t, c) {
  const config = CONFIGURATION_VIEWS.find((view) => view.id === c)
  if (config) {
    return {
      id: config.id,
      label: config.label,
      settings: {
        ...DEFAULT_SETTINGS,
        ...configurationSettings(config.configuration),
        ...SCENE_SETTINGS,
        showLabels: true,
      },
    }
  }
  const technique = getTechnique(t ?? 'T1') ?? getTechnique('T1')
  return {
    id: technique.id,
    label: technique.label,
    settings: { ...technique.settings, ...SCENE_SETTINGS },
  }
}

export default function SurveyShowcasePage() {
  const [params] = useSearchParams()
  const t = params.get('t')
  const c = params.get('c')
  const view = useMemo(() => resolveView(t, c), [t, c])

  // Builders read the active settings as they run, so apply them first.
  const [objects, setObjects] = useState([])
  useEffect(() => {
    useSettingsStore.getState().setExerciseOverrides(view.settings)
    setObjects(buildSceneFromXml(stimulusToXml(SHOWCASE)))
  }, [view])
  useEffect(() => () => useSettingsStore.getState().clearExerciseOverrides(), [])

  return (
    <div style={{ padding: 16 }}>
      <div
        className="study-phase1__stage"
        data-view={view.id}
        data-label={view.label}
        style={{ width: CANVAS.width, height: CROP.height }}
      >
        <div
          className="study-phase1__stage"
          style={{
            position: 'absolute',
            top: -CROP.top,
            width: CANVAS.width,
            height: CANVAS.height,
          }}
        >
          <Scene3D
            key={view.id}
            objects={objects}
            interactive={false}
            cameraPosition={CAMERA_POSITION}
          />
        </div>
      </div>
    </div>
  )
}
