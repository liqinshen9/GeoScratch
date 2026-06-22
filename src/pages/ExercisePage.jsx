import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { FullScreenOne, OffScreenOne } from '@icon-park/react'
import BlocksCanvas from '@/components/BlocksCanvas/BlocksCanvas'
import CategoryToolbox from '@/components/BlocksCanvas/toolbox/CategoryToolbox'
import BlockPalette from '@/components/BlocksCanvas/palette/BlockPalette'
import Scene3D from '@/components/Scene3D/Scene3D'
import GeoScratchLogo from '@/components/Brand/GeoScratchLogo.jsx'
import { Button } from '@/components/ui/button'
import addBlockToWorkspace from '@/utils/addBlockToWorkspace'
import useSceneStore from '@/store/useSceneStore'
import useWorkspaceStore from '@/store/useWorkspaceStore'

import './ExercisePage.css'
import { closestLineData } from '@/utils/lineIntersectionMath'

const exercises = [
  {
    id: 'line-intersection',
    title: 'Intersect two 3D lines',
    prompt: 'Find where the two 3D lines meet. If they do not intersect, find the shortest distance between them.',
    preview: 'line-intersection',
    validation: 'line-intersection',
    steps: [
      'Create two Vector Equation of Line blocks.',
      'Use the position and direction values shown in the question.',
      'Use the Intersect 3D lines block from Compute.',
      'Connect both lines to the intersection block. If the lines are skew, use the closest midpoint and gap shown in the 3D view.',
    ],
  },
  {
    id: 'mickey-spheres',
    title: 'Build a Mickey Mouse head',
    prompt: 'Make a simple 3D Mickey shape.',
    preview: 'mickey',
    validation: 'mickey',
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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function vecDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function vecSub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function vecAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function vecScale(a, scalar) {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar]
}

function vecLength(a) {
  return Math.hypot(a[0], a[1], a[2])
}

function vecCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function closestExerciseLineData(lineA, lineB) {
  return closestLineData(
    { origin: lineA.position, direction: lineA.direction },
    { origin: lineB.position, direction: lineB.direction },
    {
      dot: vecDot,
      sub: vecSub,
      add: vecAdd,
      scale: vecScale,
      distance: (a, b) => vecLength(vecSub(a, b)),
    },
  )
}

function generateLineIntersectionProblem() {
  for (let attempts = 0; attempts < 80; attempts += 1) {
    const lineA = {
      position: [randomInt(-4, 4), randomInt(-4, 4), randomInt(-4, 4)],
      direction: [randomInt(-5, 5), randomInt(-5, 5), randomInt(-5, 5)],
    }
    const lineB = {
      position: [randomInt(-4, 4), randomInt(-4, 4), randomInt(-4, 4)],
      direction: [randomInt(-5, 5), randomInt(-5, 5), randomInt(-5, 5)],
    }

    if (vecLength(lineA.direction) < 1 || vecLength(lineB.direction) < 1) continue
    if (vecLength(vecCross(lineA.direction, lineB.direction)) < 1) continue

    const solution = closestExerciseLineData(lineA, lineB)
    if (!solution) continue
    if (solution.gap < 0.35 || solution.gap > 8) continue

    return { lineA, lineB, solution }
  }

  const lineA = { position: [2, 3, 2], direction: [1, 4, 1] }
  const lineB = { position: [2, 1, 1], direction: [5, 2, 1] }
  return { lineA, lineB, solution: closestExerciseLineData(lineA, lineB) }
}

function formatNumber(value) {
  const rounded = Number(value.toFixed(3))
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function formatVec(vec) {
  return `(${vec.map(formatNumber).join(', ')})`
}

function vectorFromThree(vec) {
  if (!vec?.isVector3) return null
  return [vec.x, vec.y, vec.z]
}

function closeNumber(a, b, tolerance = 1e-3) {
  return Math.abs(a - b) <= tolerance
}

function closeVec(a, b, tolerance = 1e-3) {
  return Boolean(a && b && a.every((value, index) => closeNumber(value, b[index], tolerance)))
}

function lineMatchesTarget(object, target) {
  const origin = vectorFromThree(object?.userData?.origin)
  const direction = vectorFromThree(object?.userData?.direction)
  return closeVec(origin, target.position) && closeVec(direction, target.direction)
}

function vectorFromVec3Block(block) {
  if (block?.type !== 'linalg_vec3') return null
  return ['X', 'Y', 'Z'].map((field) => Number(block.getFieldValue(field)))
}

function workspaceHasTargetLine(workspace, target) {
  if (!workspace) return false
  return workspace.getBlocksByType('geo_vector', false).some((block) => {
    const position = vectorFromVec3Block(block.getInputTargetBlock('POS'))
    const direction = vectorFromVec3Block(block.getInputTargetBlock('DIR'))
    return closeVec(position, target.position) && closeVec(direction, target.direction)
  })
}

function findVariable(objects, type, name) {
  return objects.find(
    (object) =>
      object?.userData?.geoType === type &&
      String(object.userData.variableName).toLowerCase() === name,
  )
}

function getWorldPosition(object) {
  const userCentre = object?.userData?.centre ?? object?.userData?.center
  if (userCentre?.isVector3) return userCentre
  return object?.position
}

export default function ExercisePage() {
  const { objects, autoRender, setPendingObjects, setObjects } = useSceneStore()
  const { workspace } = useWorkspaceStore()
  const lineProblem = useMemo(() => generateLineIntersectionProblem(), [])
  const [categoryId, setCategoryId] = useState('create')
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toolboxPosition, setToolboxPosition] = useState(null)
  const clearWorkspaceRef = useRef(() => { })

  const selectedExercise = exercises[exerciseIndex] ?? exercises[0]

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
  const lineIntersectionProgress = useMemo(() => {
    const lines = objects.filter((object) => object?.userData?.geoType === 'geo_vector_line')
    const lineA = lines.find((line) => lineMatchesTarget(line, lineProblem.lineA))
    const lineB = lines.find((line) => lineMatchesTarget(line, lineProblem.lineB))
    const intersections = objects.filter((object) => object?.userData?.geoType === 'geo_line_intersection')
    const hasTargetLines =
      Boolean(lineA && lineB) ||
      (
        workspaceHasTargetLine(workspace, lineProblem.lineA) &&
        workspaceHasTargetLine(workspace, lineProblem.lineB)
      )
    const hasIntersectionResult = intersections.some((intersection) => {
      const point = vectorFromThree(intersection.userData?.point)
      return (
        intersection.userData?.status === 'skew' &&
        closeVec(point, lineProblem.solution.midpoint, 0.01) &&
        closeNumber(Number(intersection.userData?.distance), lineProblem.solution.gap, 0.01)
      )
    })

    return {
      hasTargetLines,
      hasIntersectionResult,
      passed: hasTargetLines && hasIntersectionResult,
    }
  }, [objects, lineProblem, workspace])

  const exercisePassed = selectedExercise.validation === 'line-intersection'
    ? lineIntersectionProgress.passed
    : mickeyPassed
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

      <main className="exercise-editor-shell">
        <div className="exercise-editor-header-row">
          {!workspaceMaximized && (
            <header className="panel-column-header exercise-head">
              <h2>Exercise</h2>
            </header>
          )}

          {!workspaceMaximized && (
            <header className="panel-column-header exercise-head">
              <h2>Toolbox</h2>
            </header>
          )}

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
                  <OffScreenOne theme="outline" size="24" fill="#333" />
                ) : (
                  <FullScreenOne theme="outline" size="24" fill="#333" />
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
          <aside className={`exercise-task-panel${exercisePassed ? ' is-passed' : ''}`}>
            <div className="exercise-task-panel__top">
              <div className="exercise-task-panel__meta-row">
                <span className="exercise-task-number">
                  Exercise {exerciseIndex + 1} of {exercises.length}
                </span>
              </div>
              <div className="exercise-selector" aria-label="Exercises">
                {exercises.map((exercise, index) => (
                  <button
                    key={exercise.id}
                    type="button"
                    className={`exercise-selector__button${index === exerciseIndex ? ' is-active' : ''}`}
                    onClick={() => setExerciseIndex(index)}
                    aria-pressed={index === exerciseIndex}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              {exercisePassed && (
                <div className="exercise-pass-badge">Passed</div>
              )}
              <h1>{selectedExercise.title}</h1>
              {selectedExercise.preview === 'line-intersection' ? (
                <div className="exercise-target-preview exercise-target-preview--line-intersection" aria-label="Target 3D line intersection preview">
                  <div className="exercise-target-preview__line exercise-target-preview__line--a" />
                  <div className="exercise-target-preview__line exercise-target-preview__line--b" />
                  <div className="exercise-target-preview__intersection-dot" />
                </div>
              ) : (
                <div className="exercise-target-preview exercise-target-preview--mickey" aria-label="Target 3D Mickey sphere preview">
                  <div className="exercise-target-preview__ear exercise-target-preview__ear--left" />
                  <div className="exercise-target-preview__ear exercise-target-preview__ear--right" />
                  <div className="exercise-target-preview__face" />
                </div>
              )}
              <p>{selectedExercise.prompt}</p>
              {selectedExercise.validation === 'line-intersection' && (
                <div className="exercise-line-question" aria-label="Generated line values">
                  <section>
                    <h3>Line 1</h3>
                    <p>Position {formatVec(lineProblem.lineA.position)}</p>
                    <p>Direction {formatVec(lineProblem.lineA.direction)}</p>
                  </section>
                  <section>
                    <h3>Line 2</h3>
                    <p>Position {formatVec(lineProblem.lineB.position)}</p>
                    <p>Direction {formatVec(lineProblem.lineB.direction)}</p>
                  </section>
                </div>
              )}
            </div>

            {paletteOpen && !workspaceMaximized && (
              <div
                className={`exercise-blocks-panel${toolboxPosition ? ' is-dragging' : ''}`}
                style={toolboxPosition ? { left: toolboxPosition.x, top: toolboxPosition.y } : undefined}
                onMouseDown={startToolboxDrag}
              >
                <BlockPalette categoryId={categoryId} onBlockSelect={handleBlockSelect} />
              </div>
            )}

            {selectedExercise.validation === 'line-intersection' ? (
              <ol className="exercise-subtask-list">
                <li className={lineIntersectionProgress.hasTargetLines ? 'is-complete' : ''}>
                  <strong>Create the two lines: </strong>
                  <span>Use the generated position and direction values exactly.</span>
                </li>
                <li className={lineIntersectionProgress.hasIntersectionResult ? 'is-complete' : ''}>
                  <strong>Find the intersection or distance: </strong>
                  <span>Use Intersect 3D lines. For skew lines, read the closest midpoint and gap.</span>
                </li>
              </ol>
            ) : (
              <ol className="exercise-task-steps">
                {selectedExercise.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
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
