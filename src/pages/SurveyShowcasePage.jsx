import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Scene3D from '@/components/Scene3D/Scene3D'
import useSettingsStore, { DEFAULT_SETTINGS } from '@/store/useSettingsStore'
import { getTechnique } from '@/study/phase1/conditions'
import { CONFIGURATIONS, configurationSettings } from '@/study/session/holistic'
import { buildStimulusScene } from '@/study/phase1/buildStimulusScene'
import { positionFromOrbit, DEFAULT_CAMERA_VIEW } from '@/components/Scene3D/sceneConstants'
import './StudyPhase1Page.css'

// Dev-only (routed only when import.meta.env.DEV): one hand-built scene where
// every Phase 1 cue shows at once, for the questionnaire screenshots
// (scripts/surveyScreenshots.mjs). ?t=T1..T10 picks a Phase 1 technique;
// ?c=C1 / C2 a holistic configuration (baseline / perception-driven).
// ?cue=halo / accent is a close-up of one cue, for the Phase 1 intro pages
// (public/study/cue-*.png).

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

// Each close-up is drawn at the size the intro page shows it, with the trial's
// own settings (grid, axes, labels), so a cue looks as it will in a trial.
const CUE_CANVAS = { width: 512, height: 300 }
const CUE_CAMERA_DISTANCE = 16

const CUE_VIEWS = {
  halo: {
    technique: 'T5',
    label: 'Halo',
    scene: {
      id: 'survey-cue-halo',
      colourSalt: 0,
      objects: [
        // Off the view's centre, where the labels settle, so they stay clear of the crossing.
        { key: 'B', role: 'target', kind: 'line', origin: [-2, 0, 0.5], direction: [1, 0.15, -1] },
        { key: 'A', role: 'target', kind: 'line', origin: [-2, 0, 3.5], direction: [-1, 1.4, -1] },
      ],
    },
  },
  accent: {
    technique: 'T4',
    label: 'Collision accent',
    scene: {
      id: 'survey-cue-accent',
      colourSalt: 0,
      objects: [
        { key: 'cube', kind: 'cube', centre: [-2, 0, 2], size: 4 },
        // Across the view, so the part inside the cube is long on screen.
        { key: 'A', role: 'target', kind: 'line', origin: [-2, 0, 2], direction: [1, 0.3, -1] },
      ],
    },
  },
  rings: {
    technique: 'T3',
    label: 'Ringed lines',
    // Closer, so each ring is large enough to count.
    distance: 9,
    scene: {
      id: 'survey-cue-rings',
      colourSalt: 0,
      objects: [
        { key: 'A', role: 'target', kind: 'line', origin: [-1, 0.5, 1], direction: [1, 0.9, -1] },
      ],
    },
  },
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

function resolveView(t, c, cue) {
  const cueView = CUE_VIEWS[cue]
  if (cueView) {
    return {
      id: `cue-${cue}`,
      label: cueView.label,
      settings: { ...getTechnique(cueView.technique).settings, showAxes: false },
      scene: cueView.scene,
      canvas: CUE_CANVAS,
      crop: { top: 0, height: CUE_CANVAS.height },
      cameraPosition: positionFromOrbit({
        ...DEFAULT_CAMERA_VIEW,
        distance: cueView.distance ?? CUE_CAMERA_DISTANCE,
      }),
    }
  }
  const room = { scene: SHOWCASE, canvas: CANVAS, crop: CROP, cameraPosition: CAMERA_POSITION }
  const config = CONFIGURATION_VIEWS.find((view) => view.id === c)
  if (config) {
    return {
      ...room,
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
    ...room,
    id: technique.id,
    label: technique.label,
    settings: { ...technique.settings, ...SCENE_SETTINGS },
  }
}

export default function SurveyShowcasePage() {
  const [params] = useSearchParams()
  const t = params.get('t')
  const c = params.get('c')
  const cue = params.get('cue')
  const view = useMemo(() => resolveView(t, c, cue), [t, c, cue])

  // Builders read the active settings as they run, so apply them first.
  const [scene, setScene] = useState({ objects: [], hiddenLabelKeys: new Set() })
  useEffect(() => {
    useSettingsStore.getState().setExerciseOverrides(view.settings)
    setScene(buildStimulusScene(view.scene))
  }, [view])
  useEffect(() => () => useSettingsStore.getState().clearExerciseOverrides(), [])

  return (
    <div style={{ padding: 16 }}>
      <div
        className="study-phase1__stage"
        data-view={view.id}
        data-label={view.label}
        style={{ width: view.canvas.width, height: view.crop.height }}
      >
        <div
          className="study-phase1__stage"
          style={{
            position: 'absolute',
            top: -view.crop.top,
            width: view.canvas.width,
            height: view.canvas.height,
          }}
        >
          <Scene3D
            key={view.id}
            objects={scene.objects}
            hiddenLabelKeys={scene.hiddenLabelKeys}
            interactive={false}
            cameraPosition={view.cameraPosition}
          />
        </div>
      </div>
    </div>
  )
}
