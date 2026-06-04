import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ChevronRight, Trash2 } from 'lucide-react'
import BlocksCanvas from '@/components/BlocksCanvas/BlocksCanvas'
import Scene3D from '@/components/Scene3D/Scene3D'
import GeoScratchLogo from '@/components/Brand/GeoScratchLogo.jsx'
import { Button } from '@/components/ui/button'
import { getCategory } from '@/components/BlocksCanvas/catalog/blockCatalog'
import useSceneStore from '@/store/useSceneStore'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import './LandingPage.css'
import './ExercisePage.css'

const exercises = [
  {
    id: 'point-plane-distance',
    title: 'Point to plane distance',
    prompt: 'Find the shortest distance from a point to a plane, then mark the closest point on the plane.',
    steps: [
      'Create a point-normal plane.',
      'Create a separate point away from the plane.',
      'Use Show any point on object with the plane to display a known point on that plane.',
    ],
  },
  {
    id: 'composite-primitives',
    title: 'Build a complex object',
    prompt: 'Create a complex object by combining multiple primitives into one reusable object.',
    steps: [
      'Create at least two primitives such as cubes and spheres.',
      'Place them at different centres so they form a recognizable structure.',
      'Run the scene and inspect how the primitives align in 3D.',
    ],
  },
  {
    id: 'skew-line-distance',
    title: 'Distance between skew lines',
    prompt: 'Find the shortest distance between two 3D lines that do not intersect and are not parallel.',
    steps: [
      'Create two vector lines with different position vectors.',
      'Give the lines non-parallel direction vectors.',
      'Use cross product and dot product blocks to reason about the shortest distance.',
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
  const [selectedId, setSelectedId] = useState(exercises[0].id)
  const clearWorkspaceRef = useRef(() => {})

  const selectedExercise = useMemo(
    () => exercises.find((exercise) => exercise.id === selectedId) ?? exercises[0],
    [selectedId],
  )

  const selectedIndex = exercises.findIndex((exercise) => exercise.id === selectedExercise.id)
  const category = getCategory(categoryId)

  const handleObjectsChange = useCallback(
    (objs) => {
      setPendingObjects(objs)
      if (autoRender) setObjects(objs)
    },
    [autoRender, setPendingObjects, setObjects],
  )

  function selectNextExercise() {
    setSelectedId(exercises[(selectedIndex + 1) % exercises.length].id)
  }

  return (
    <div className="exercise-page exercise-page--editor">
      <header className="landing-nav exercise-landing-nav">
        <Link to="/" className="landing-nav__logo app-nav__logo">
          <GeoScratchLogo showWordmark />
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

          <header className="panel-column-header exercise-head">
            <h2>{category?.label ?? 'Create'}</h2>
            {category?.subtitle && <p>{category.subtitle}</p>}
          </header>

          <header className="panel-column-header exercise-head exercise-workspace-head">
            <div>
              <h2>Workspace</h2>
              <p>Build your answer here</p>
            </div>
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
          </header>

          <header className="panel-column-header exercise-head exercise-head--last">
            <h2>3D View</h2>
          </header>
        </div>

        <div className="exercise-editor-body-row">
          <aside className="exercise-task-panel">
            <div className="exercise-task-panel__top">
              <span className="exercise-task-number">
                Exercise {selectedIndex + 1} of {exercises.length}
              </span>
              <h1>{selectedExercise.title}</h1>
              <p>{selectedExercise.prompt}</p>
            </div>

            <ol className="exercise-task-steps">
              {selectedExercise.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>

            <div className="exercise-task-actions">
              <button className="exercise-task-button" type="button" onClick={selectNextExercise}>
                Next
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </aside>

          <BlocksCanvas
            categoryId={categoryId}
            workspaceMaximized={false}
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
