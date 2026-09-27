import { useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import * as en from 'blockly/msg/en'
import InitLocale from '@/components/BlocksCanvas/core/Locale'
import defineBlocks from '@/components/BlocksCanvas/blocks/index'
import { getBlockTheme } from '@/components/BlocksCanvas/blocks/blockColours'
import { registerGeoScratchRenderer } from '@/components/BlocksCanvas/renderers/geoScratchRenderer'
import { installNamingRegistry } from '@/utils/namingRegistry'
import useSettingsStore from '@/store/useSettingsStore'

const GAP = 24
const PAD = 16
const MAX_SCALE = 1

/** Grid extent and the scale that fits it in the panel, for `columns` columns. */
function gridFor(sizes, columns, panel) {
  const columnWidth = Math.max(...sizes.map((s) => s.width))
  const rowHeights = []
  sizes.forEach((s, i) => {
    const row = Math.floor(i / columns)
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, s.height)
  })
  const used = Math.min(columns, sizes.length)
  const width = used * columnWidth + (used - 1) * GAP
  const height = rowHeights.reduce((sum, h) => sum + h, 0) + (rowHeights.length - 1) * GAP
  const scale = Math.min(
    MAX_SCALE,
    (panel.clientWidth - 2 * PAD) / width,
    (panel.clientHeight - 2 * PAD) / height,
  )
  return { columns, columnWidth, rowHeights, scale }
}

/**
 * Lays the blocks out in block order, in one or two columns, whichever lets
 * them be drawn larger, then scales them to the panel and pins them to its top
 * left. `cleanUp()` and `zoomToFit()` do nothing useful in a read-only
 * workspace, so this does both by hand.
 */
function layOutAndFit(workspace, panel) {
  const blocks = workspace.getTopBlocks(false)
  if (!blocks.length) return
  // The drawn SVG, children included. Blockly's own getHeightWidth() and
  // getBoundingRectangle() both came out narrower than what is drawn here.
  const sizes = blocks.map((b) => {
    const box = b.getSvgRoot().getBBox()
    return { width: box.width, height: box.height }
  })
  const grid = [1, 2]
    .map((columns) => gridFor(sizes, columns, panel))
    .reduce((best, g) => (g.scale > best.scale ? g : best))
  blocks.forEach((block, i) => {
    const row = Math.floor(i / grid.columns)
    const x = (i % grid.columns) * (grid.columnWidth + GAP)
    const y = grid.rowHeights.slice(0, row).reduce((sum, h) => sum + h + GAP, 0)
    const { x: cx, y: cy } = block.getRelativeToSurfaceXY()
    block.moveBy(x - cx, y - cy)
  })
  workspace.setScale(grid.scale)
  workspace.translate(PAD, PAD)
}

/**
 * The identification task's block panel: the scene's own blocks in a real
 * Blockly workspace, with the editor's renderer, theme and naming, so a block
 * reads exactly as it would in the editor. Read-only, and covered so nothing
 * can be dragged or selected; `targetId` gets Blockly's own selection outline.
 *
 * A fresh workspace per scene: the naming registry numbers blocks per
 * workspace, and the scene's labels come from a fresh headless build, so a
 * reused workspace would drift to S6, S7... while the labels say S1, S2...
 * Blocks take their colour when created, so the condition's settings must be
 * applied before `xml` changes. The page mounts it during the fixation cross
 * with `hidden`, so the layout is settled before the trial is shown.
 */
export default function ReadOnlyWorkspace({ xml, targetId, hidden = false }) {
  const hostRef = useRef(null)

  useEffect(() => {
    if (!xml || !hostRef.current) return undefined
    InitLocale(en)
    defineBlocks()
    const workspace = Blockly.inject(hostRef.current, {
      renderer: registerGeoScratchRenderer(),
      theme: getBlockTheme(useSettingsStore.getState().resolvedTheme),
      readOnly: true,
      zoom: { controls: false, wheel: false, startScale: MAX_SCALE },
      move: { scrollbars: false, drag: false, wheel: false },
    })
    Blockly.Events.disable()
    try {
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), workspace)
    } finally {
      Blockly.Events.enable()
    }
    installNamingRegistry(workspace)
    workspace.getBlockById(targetId)?.addSelect()

    // Lay out again whenever a block changes size: the name chip the naming
    // registry adds, and the web font arriving, both widen blocks after load.
    // It settles during the fixation cross, before the trial is shown.
    let disposed = false
    let frame = 0
    const relayout = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (disposed) return
        Blockly.renderManagement.triggerQueuedRenders()
        // Silent, or the moves it makes would schedule the next relayout.
        Blockly.Events.disable()
        try {
          layOutAndFit(workspace, hostRef.current)
        } finally {
          Blockly.Events.enable()
        }
      })
    }
    workspace.addChangeListener((event) => {
      if (event.type !== Blockly.Events.VIEWPORT_CHANGE) relayout()
    })
    document.fonts.ready.then(relayout)
    relayout()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      workspace.dispose()
    }
  }, [xml, targetId])

  return (
    <div
      className="study-identify__workspace"
      style={{ visibility: hidden ? 'hidden' : 'visible' }}
    >
      <div ref={hostRef} className="study-identify__workspace-host" />
      <div className="study-identify__workspace-cover" aria-hidden="true" />
    </div>
  )
}
