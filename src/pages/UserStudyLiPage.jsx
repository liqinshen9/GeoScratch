import { useEffect } from 'react'
import ParticipantGate from '@/components/ParticipantGate/ParticipantGate'
import useThemeSync from '@/hooks/useThemeSync'
import useAuthStore from '@/store/useAuthStore'
import ExercisePage from '@/pages/ExercisePage'

const POINT_STYLES = {
  attached_corner_point: { color: '#3b82f6', label: 'P', anchor: 'p' },
  pivot_center_point: { color: '#6b7280', label: 'C', anchor: 'c' },
}
const LABEL_COLORS = Object.fromEntries(
  Object.values(POINT_STYLES).map(({ label, color }) => [label, color]),
)

const SETTINGS = Object.freeze({
  showAxisToggleButton: false,
  cubeShowEdges: false,
  objectHighlightEnabled: false,
  objectsReceiveShadows: false,
  primitivesCastShadows: false,
  pointShadowsEnabled: false,
  cameraShadowsEnabled: false,
  haloEnabled: false,
  haloLineVectorEnabled: false,
})

function styleStudyPoints(objects) {
  objects.forEach((object) =>
    object?.traverse((child) => {
      const style = POINT_STYLES[child.userData?.geoType]
      if (style) {
        child.userData.clickLabelAnchor = style.anchor
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((material) => material?.color?.set(style.color))
      }
      child.userData?.labels?.forEach((label) => {
        if (LABEL_COLORS[label.name]) label.color = LABEL_COLORS[label.name]
      })
    }),
  )
  return objects
}

export default function UserStudyLiPage() {
  useThemeSync()

  useEffect(() => {
    useAuthStore.getState().bootstrap()
  }, [])

  return (
    <ParticipantGate>
      <div className="app-container flex h-dvh flex-col overflow-hidden">
        <main className="flex min-h-0 flex-1 flex-col">
          <ExercisePage
            exerciseId="cube-point-pivot-rotation"
            standalone
            workspaceId="userstudy-Li-cube-point-pivot-rotation"
            settingsOverrides={SETTINGS}
            showAnswerHighlight={false}
            hideAnimationTransport
            transformObjects={styleStudyPoints}
            toggleLabelsOnLeftClick
          />
        </main>
      </div>
    </ParticipantGate>
  )
}
