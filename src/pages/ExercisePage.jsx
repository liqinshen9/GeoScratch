import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { FullScreenOne, OffScreen } from '@icon-park/react'
import BlocksCanvas from '@/components/BlocksCanvas/BlocksCanvas'
import CategoryToolbox from '@/components/BlocksCanvas/toolbox/CategoryToolbox'
import BlockPalette from '@/components/BlocksCanvas/palette/BlockPalette'
import Scene3D from '@/components/Scene3D/Scene3D'
import GeoScratchLogo from '@/components/Brand/GeoScratchLogo.jsx'
import { Button } from '@/components/ui/button'
import addBlockToWorkspace from '@/utils/addBlockToWorkspace'
import useSceneStore from '@/store/useSceneStore'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import './LandingPage.css'
import './ExercisePage.css'

const exercises = [
  {
    id: 'mickey-spheres',
    title: 'Build a Mickey Mouse head',
    prompt: 'Make a simple 3D Mickey shape.',
    steps: [
      'Create one large sphere as the head.',
      'Create two smaller spheres above the head.',
      'Move one small sphere to the upper-left and one to the upper-right.',
      'When the 3D view looks like Mickey Mouse head, this exercise will turn green.',
    ],
  },
]

function landingNavLinkClass(isActive) {
  return `landing-nav__link${isActive ? ' is-active' : ''}`
}

export default function ExercisePage() {
  const { objects, autoRender, setPendingObjects, setObjects } = useSceneStore()
  const { workspace } = useWorkspaceStore()
  const [categoryId, setCategoryId] = useState('create')
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toolboxPosition, setToolboxPosition] = useState(null)
  const clearWorkspaceRef = useRef(() => {})

  const selectedExercise = exercises[0]

  const mickeyPassed = useMemo(() => {
    const getWorldPosition = (object) => {
      const userCentre = object?.userData?.centre ?? object?.userData?.center
      if (userCentre?.isVector3) return userCentre
      return object?.position
    }

    const spheres = objects.filter((object) => object?.userData?.geoType === 'geo_sphere')
    if (spheres.length < 3) return false

    const spheresWithData = spheres
      .map((sphere) => ({
        object: sphere,
        position: getWorldPosition(sphere),
        radius: Number(sphere?.userData?.radius) || 1,
      }))
      .filter((sphere) => sphere.position)

    return spheresWithData.some((head) => {
      const ears = spheresWithData.filter((sphere) => sphere.object !== head.object)
      const minHorizontalGap = Math.max(0.12, head.radius * 0.25)
      const minVerticalGap = Math.max(0.12, head.radius * 0.2)
      const leftEar = ears.some(
        (ear) =>
          ear.position.x < head.position.x - minHorizontalGap &&
          ear.position.y > head.position.y + minVerticalGap &&
          ear.radius <= head.radius,
      )
      const rightEar = ears.some(
        (ear) =>
          ear.position.x > head.position.x + minHorizontalGap &&
          ear.position.y > head.position.y + minVerticalGap &&
          ear.radius <= head.radius,
      )

      return leftEar && rightEar
    })
  }, [objects])
  const handleObjectsChange = useCallback(
    (objs) => {
      setPendingObjects(objs)
      if (autoRender) setObjects(objs)
    },
    [autoRender, setPendingObjects, setObjects],
  )

  function selectCategory(nextCategoryId) {
    setCategoryId(nextCategoryId)
    setPaletteOpen((isOpen) => (nextCategoryId === categoryId ? !isOpen : true))
  }

  const handleBlockSelect = useCallback(
    (type) => {
      if (!workspace) return
      addBlockToWorkspace(workspace, type)
    },
    [workspace],
  )

  function startToolboxDrag(event) {
    if (event.button !== 0) return
    if (event.target.closest('.palette-block-preview')) return

    const panel = event.currentTarget
    const panelRect = panel.getBoundingClientRect()
    const origin = toolboxPosition ?? {
      x: panelRect.left,
      y: panelRect.top,
    }

    event.preventDefault()
    setToolboxPosition(origin)

    function moveToolbox(moveEvent) {
      const currentPanelRect = panel.getBoundingClientRect()
      const maxX = Math.max(8, window.innerWidth - currentPanelRect.width - 8)
      const maxY = Math.max(8, window.innerHeight - currentPanelRect.height - 8)
      const nextX = Math.min(Math.max(8, origin.x + moveEvent.clientX - event.clientX), maxX)
      const nextY = Math.min(Math.max(8, origin.y + moveEvent.clientY - event.clientY), maxY)
      setToolboxPosition({ x: nextX, y: nextY })
    }

    function stopToolbox() {
      window.removeEventListener('mousemove', moveToolbox)
      window.removeEventListener('mouseup', stopToolbox)
    }

    window.addEventListener('mousemove', moveToolbox)
    window.addEventListener('mouseup', stopToolbox)
  }

  return (
    <div className={`exercise-page exercise-page--editor${workspaceMaximized ? ' exercise-page--workspace-maximized' : ''}`}>
      <header className="landing-nav exercise-landing-nav">
        <Link to="/" className="landing-nav__logo app-nav__logo">
          <GeoScratchLogo showMark={false} showWordmark />
        </Link>

        <nav className="landing-nav__links" aria-label="Main">
          <NavLink to="/" end className={({ isActive }) => landingNavLinkClass(isActive)}>
            Home
          </NavLink>
          <NavLink to="/exercise" className={({ isActive }) => landingNavLinkClass(isActive)}>
            Exercise
          </NavLink>
          <NavLink to="/sandbox" className={({ isActive }) => landingNavLinkClass(isActive)}>
            Sandbox
          </NavLink>
        </nav>
      </header>

      <main className="exercise-editor-shell">
        <div className="exercise-editor-header-row">
          <header className="panel-column-header exercise-head">
            <h2>Exercise</h2>
          </header>

          <header className="panel-column-header exercise-head">
            <h2>Toolbox</h2>
          </header>

          <header className="panel-column-header exercise-head exercise-workspace-head">
            <div>
              <h2>Workspace</h2>
              <p>Build your answer here</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setWorkspaceMaximized((maximized) => !maximized)}
                disabled={!workspace}
                title={workspaceMaximized ? 'Restore panels' : 'Maximize workspace'}
                aria-label={workspaceMaximized ? 'Restore panels' : 'Maximize workspace'}
                aria-pressed={workspaceMaximized}
              >
                {workspaceMaximized ? (
                  <OffScreen theme="outline" size="24" fill="currentColor" />
                ) : (
                  <FullScreenOne theme="outline" size="24" fill="currentColor" />
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => clearWorkspaceRef.current()}
                disabled={!workspace}
              >
                <Trash2 aria-hidden="true" />
                Clear
              </Button>
            </div>
          </header>

          <header className="panel-column-header exercise-head exercise-head--last">
            <h2>3D View</h2>
          </header>
        </div>

        <div className="exercise-editor-body-row">
          <aside className={`exercise-task-panel${mickeyPassed ? ' is-passed' : ''}`}>
            <div className="exercise-task-panel__top">
              <div className="exercise-task-panel__meta-row">
                <span className="exercise-task-number">
                  Exercise 1 of 1
                </span>
              </div>
              {mickeyPassed && (
                <div className="exercise-pass-badge">Passed</div>
              )}
              <h1>{selectedExercise.title}</h1>
              <div className="exercise-target-preview exercise-target-preview--mickey" aria-label="Target 3D Mickey sphere preview">
                <div className="exercise-target-preview__ear exercise-target-preview__ear--left" />
                <div className="exercise-target-preview__ear exercise-target-preview__ear--right" />
                <div className="exercise-target-preview__face" />
              </div>
              <p>{selectedExercise.prompt}</p>
            </div>

            {paletteOpen && (
              <div
                className={`exercise-blocks-panel${toolboxPosition ? ' is-dragging' : ''}`}
                style={toolboxPosition ? { left: toolboxPosition.x, top: toolboxPosition.y } : undefined}
                onMouseDown={startToolboxDrag}
              >
                <BlockPalette categoryId={categoryId} onBlockSelect={handleBlockSelect} />
              </div>
            )}

            <ol className="exercise-task-steps">
              {selectedExercise.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </aside>

          <aside className="exercise-category-panel">
            <CategoryToolbox selected={categoryId} onSelect={selectCategory} />
          </aside>

          <BlocksCanvas
            categoryId={categoryId}
            workspaceMaximized={workspaceMaximized}
            hideInlineControls
            onCategoryChange={setCategoryId}
            onObjectsChange={handleObjectsChange}
            onRegisterClear={(fn) => {
              clearWorkspaceRef.current = fn
            }}
          />
          <Scene3D objects={objects} />
        </div>
      </main>
    </div>
  )
}
