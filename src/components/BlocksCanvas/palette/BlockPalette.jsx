import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as Blockly from 'blockly/core'
import { Delete } from '@icon-park/react'
import { getCategory } from '@/components/BlocksCanvas/catalog/blockCatalog'
import { getBlockTheme } from '@/components/BlocksCanvas/blocks/blockColours'
import { MY_BLOCK_COLOUR } from '@/components/BlocksCanvas/blocks/myBlockAppearance'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useSettingsStore from '@/store/useSettingsStore'
import { registerGeoScratchRenderer } from '@/components/BlocksCanvas/renderers/geoScratchRenderer'

const PALETTE_WS_OPTIONS = {
  readOnly: true,
  scrollbars: false,
  zoom: { controls: false, wheel: false, startScale: 0.72 },
  move: { scrollbars: false, drag: false, wheel: false },
  renderer: registerGeoScratchRenderer(),
}

const SELECTION_FEEDBACK_MS = 450
const MY_BLOCK_TRANSFER_TYPE = 'application/x-geoscratch-my-block-id'

function useSelectionFeedback() {
  const itemRef = useRef(null)
  const timerRef = useRef(0)
  const hoveredRef = useRef(false)

  const setSelected = (selected) => {
    itemRef.current
      ?.querySelectorAll('.blocklyBlock')
      .forEach((root) => root.classList.toggle('blocklySelected', selected))
  }

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current)
    },
    [],
  )

  const flashSelection = () => {
    window.clearTimeout(timerRef.current)
    setSelected(true)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = 0
      if (!hoveredRef.current) setSelected(false)
    }, SELECTION_FEEDBACK_MS)
  }

  const handlePointerEnter = () => {
    hoveredRef.current = true
    setSelected(true)
  }

  const handlePointerLeave = () => {
    hoveredRef.current = false
    if (!timerRef.current) setSelected(false)
  }

  return { itemRef, flashSelection, handlePointerEnter, handlePointerLeave }
}

function BlockPreview({ type, onSelect, onDragStartBlock }) {
  const hostRef = useRef(null)
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme)
  const { itemRef, flashSelection, handlePointerEnter, handlePointerLeave } =
    useSelectionFeedback()

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || !Blockly.Blocks[type]) return

    const ws = Blockly.inject(host, {
      ...PALETTE_WS_OPTIONS,
      theme: getBlockTheme(resolvedTheme),
    })
    const block = ws.newBlock(type)
    block.initSvg()
    block.render()
    block.moveBy(10, 10)

    const hw = block.getHeightWidth()
    const scale = PALETTE_WS_OPTIONS.zoom.startScale
    host.style.height = `${Math.ceil(hw.height * scale + 18)}px`

    Blockly.svgResize(ws)

    return () => {
      ws.dispose()
      host.innerHTML = ''
    }
  }, [type, resolvedTheme])

  const handleDragStart = (event) => {
    if (!event.dataTransfer) return
    flashSelection()
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-geoscratch-block-type', type)
    onDragStartBlock?.(type)
  }

  const handleSelect = () => {
    flashSelection()
    onSelect(type)
  }

  return (
    <div
      ref={itemRef}
      className="palette-block-preview"
      title="Click to add or drag into workspace"
    >
      <div className="palette-block-preview__blockly-host" ref={hostRef} />
      <div
        className="palette-block-preview__drag-surface"
        role="button"
        tabIndex={0}
        draggable
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onDragStart={handleDragStart}
        onClick={handleSelect}
      />
    </div>
  )
}

function MyBlockPreview({ xmlText }) {
  const hostRef = useRef(null)
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || !xmlText) return

    const ws = Blockly.inject(host, {
      ...PALETTE_WS_OPTIONS,
      theme: getBlockTheme(resolvedTheme),
    })

    try {
      const dom = Blockly.utils.xml.textToDom(xmlText)
      dom.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
      Blockly.Xml.domToWorkspace(dom, ws)

      let nextY = 0
      ws.getTopBlocks(true).forEach((topBlock) => {
        const bounds = topBlock.getBoundingRectangle()
        topBlock.moveBy(-bounds.left, nextY - bounds.top)
        nextY += bounds.getHeight() + 16
      })
      ws.getAllBlocks(false).forEach((savedBlock) => savedBlock.setColour(MY_BLOCK_COLOUR))

      const bounds = ws.getBlocksBoundingBox()
      const availableWidth = Math.max(host.clientWidth - 20, 1)
      const scale = Math.min(PALETTE_WS_OPTIONS.zoom.startScale, availableWidth / bounds.getWidth())
      ws.setScale(scale)
      host.style.height = `${Math.ceil(bounds.getHeight() * scale + 18)}px`
      Blockly.svgResize(ws)
      ws.scrollCenter()
    } catch (error) {
      console.error('[GeoScratch] My Block preview error:', error)
    }

    return () => {
      ws.dispose()
      host.innerHTML = ''
    }
  }, [xmlText, resolvedTheme])

  return <span className="my-block-card__preview" ref={hostRef} />
}

function MyBlockCard({ block, onSelect, onDragStartBlock, onDragEndBlock }) {
  const { itemRef, flashSelection, handlePointerEnter, handlePointerLeave } =
    useSelectionFeedback()

  const handleDragStart = (event) => {
    if (!event.dataTransfer) return
    flashSelection()
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setData(MY_BLOCK_TRANSFER_TYPE, block.id)
    const blockPreview = itemRef.current?.querySelector('.my-block-card__preview')
    if (blockPreview) event.dataTransfer.setDragImage(blockPreview, 12, 12)
    onDragStartBlock?.(block.id)
  }

  const handleSelect = () => {
    flashSelection()
    onSelect(block.id)
  }

  return (
    <div
      ref={itemRef}
      className="my-block-card"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEndBlock}
    >
      <button
        type="button"
        className="my-block-card__main"
        onClick={handleSelect}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        title="Add this saved block to the workspace"
        aria-label={`Add ${block.name}`}
      >
        <MyBlockPreview xmlText={block.xmlText} />
      </button>
    </div>
  )
}

function MyBoxPalette({ onMakeBlock, onUserBlockSelect, onUserBlockDelete, onUserBlockDragStart }) {
  const userBlocks = useWorkspaceStore((state) => state.userBlocks)
  const recentDeletedBlocks = useWorkspaceStore((state) => state.recentDeletedUserBlocks)
  const restoreUserBlock = useWorkspaceStore((state) => state.restoreUserBlock)
  const [trashActive, setTrashActive] = useState(false)
  const [trashPanelOpen, setTrashPanelOpen] = useState(false)

  const handleTrashDragOver = (event) => {
    if (!event.dataTransfer.types.includes(MY_BLOCK_TRANSFER_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setTrashActive(true)
    setTrashPanelOpen(false)
  }

  const handleTrashDragLeave = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setTrashActive(false)
  }

  const handleTrashDrop = (event) => {
    event.preventDefault()
    const blockId = event.dataTransfer.getData(MY_BLOCK_TRANSFER_TYPE)
    setTrashActive(false)
    if (userBlocks.some((block) => block.id === blockId)) onUserBlockDelete(blockId)
  }

  const handleRestoreDeleted = (blockId) => {
    const deletedBlock = recentDeletedBlocks.find((block) => block.id === blockId)
    if (!deletedBlock) return
    restoreUserBlock(deletedBlock)
    setTrashPanelOpen(false)
  }

  const handleTrashClick = () => {
    setTrashPanelOpen((open) => !open)
  }

  return (
    <div className="block-palette my-box-palette">
      <div className="block-palette-scroll">
        <button type="button" className="make-block-button" onClick={onMakeBlock}>
          Make a Block
        </button>

        <section className="palette-group">
          <h3 className="palette-group-label">Saved Blocks</h3>
          {userBlocks.length ? (
            userBlocks.map((block) => (
              <MyBlockCard
                key={block.id}
                block={block}
                onSelect={onUserBlockSelect}
                onDragStartBlock={onUserBlockDragStart}
                onDragEndBlock={() => setTrashActive(false)}
              />
            ))
          ) : (
            <p className="my-box-empty">Save a workspace or a passed exercise to reuse it here.</p>
          )}
        </section>
        <div className="my-block-trash-row">
          <button
            type="button"
            className={`workspace-control-button my-block-trash${trashActive ? ' is-active' : ''}`}
            aria-label="Saved blocks trash"
            title="Drag a saved block here to delete it; click to view deleted blocks"
            onClick={handleTrashClick}
            onDragEnter={handleTrashDragOver}
            onDragOver={handleTrashDragOver}
            onDragLeave={handleTrashDragLeave}
            onDrop={handleTrashDrop}
          >
            <span className={`workspace-trash-icon${trashActive ? ' is-open' : ''}`}>
              <Delete theme="outline" size="18" fill="currentColor" />
            </span>
          </button>
        </div>
        {trashPanelOpen && (
          <div className="workspace-trash-panel my-block-trash-panel">
            {recentDeletedBlocks.length ? (
              recentDeletedBlocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  className="workspace-trash-item__button"
                  title={`Restore ${block.name}`}
                  onClick={() => handleRestoreDeleted(block.id)}
                >
                  <MyBlockPreview xmlText={block.xmlText} />
                </button>
              ))
            ) : (
              <div className="workspace-trash-empty">Nothing deleted</div>
            )}
          </div>
        )}
      </div>

      <p className="block-palette-hint">Click or drag a saved block into the workspace</p>
    </div>
  )
}

export default function BlockPalette({
  categoryId,
  onBlockSelect,
  onBlockDragStart,
  onMakeBlock,
  onUserBlockSelect,
  onUserBlockDelete,
  onUserBlockDragStart,
}) {
  const category = getCategory(categoryId)
  if (!category) return null

  if (categoryId === 'mybox') {
    return (
      <MyBoxPalette
        onMakeBlock={onMakeBlock}
        onUserBlockSelect={onUserBlockSelect}
        onUserBlockDelete={onUserBlockDelete}
        onUserBlockDragStart={onUserBlockDragStart}
      />
    )
  }

  return (
    <div className="block-palette">
      <div className="block-palette-scroll">
        {category.groups.map((group) => (
          <section key={group.label} className="palette-group">
            <h3 className="palette-group-label">{group.label}</h3>
            {group.blocks.map(({ type }) => (
              <BlockPreview
                key={type}
                type={type}
                onSelect={onBlockSelect}
                onDragStartBlock={onBlockDragStart}
              />
            ))}
          </section>
        ))}
      </div>

      <p className="block-palette-hint">Click a block or drag it into the workspace</p>
    </div>
  )
}
