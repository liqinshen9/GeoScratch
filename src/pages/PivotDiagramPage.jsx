import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Scene3D from '@/components/Scene3D/Scene3D'
import useSettingsStore from '@/store/useSettingsStore'
import { buildSceneFromXml } from '@/study/phase1/buildStimulusScene'
import { getExerciseModule } from '@/exercises'
import { setCustomName } from '@/utils/namingRegistry'
import { positionFromOrbit, DEFAULT_CAMERA_VIEW } from '@/components/Scene3D/sceneConstants'
import './StudyPhase1Page.css'

// Dev-only: the pivot exercise's start and goal pictures, drawn by the real
// scene so they match it (scripts/pivotDiagrams.mjs screenshots them).
// ?pose=start|goal, ?theme=light|dark.

const PIVOT_DIAGRAM_CANVAS = { width: 460, height: 368 }

const CAMERA_POSITION = positionFromOrbit({ distance: 9.5, azimuthDeg: 30, elevationDeg: 24 })

// The goal is the start rotated 90 degrees about Y through the cube's centre,
// which leaves the cube itself looking the same, so only P moves.
const CORNER = { start: [0, 2, 2], goal: [2, 2, 2] }

const pointXml = (id, [x, y, z]) =>
  `<block type="linalg_point" id="${id}"><field name="X">${x}</field><field name="Y">${y}</field><field name="Z">${z}</field></block>`

const sceneXml = (corner) => `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="geo_cube" id="diagram-cube">
    <value name="SIDE_LENGTH_INPUT"><block type="scalar" id="diagram-side"><field name="scalar">2</field></block></value>
    <value name="CENTRE">${pointXml('diagram-centre', [1, 1, 1])}</value>
  </block>
  ${pointXml('diagram-p', corner)}
</xml>`

function nameGivens(workspace) {
  setCustomName(workspace.getBlockById('diagram-cube'), 'C')
  setCustomName(workspace.getBlockById('diagram-p'), 'P')
}

export default function PivotDiagramPage() {
  const [params] = useSearchParams()
  const pose = params.get('pose') === 'goal' ? 'goal' : 'start'
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light'

  // Builders read the active settings as they run, so apply them first.
  const [objects, setObjects] = useState([])
  useEffect(() => {
    useSettingsStore.getState().setExerciseOverrides({
      ...getExerciseModule('cube-point-pivot-rotation').settingsOverrides,
      theme,
      showAxisGizmo: false,
      // It fades out with distance, which reads as half a grid in a small picture.
      showGrid: false,
    })
    setObjects(buildSceneFromXml(sceneXml(CORNER[pose]), nameGivens))
  }, [pose, theme])
  useEffect(() => () => useSettingsStore.getState().clearExerciseOverrides(), [])

  return (
    <div style={{ padding: 16 }}>
      <div
        className="study-phase1__stage"
        data-view={`${pose}-${theme}`}
        style={{ width: PIVOT_DIAGRAM_CANVAS.width, height: PIVOT_DIAGRAM_CANVAS.height }}
      >
        <Scene3D
          key={`${pose}-${theme}`}
          objects={objects}
          interactive={false}
          cameraPosition={CAMERA_POSITION}
        />
      </div>
    </div>
  )
}
