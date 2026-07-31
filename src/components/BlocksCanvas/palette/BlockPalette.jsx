import { useLayoutEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import { getCategory } from '@/components/BlocksCanvas/catalog/blockCatalog'
import { GEO_SCRATCH_BLOCK_THEME } from '@/components/BlocksCanvas/blocks/blockColours'
import useWorkspaceStore from '@/store/useWorkspaceStore'

const PALETTE_WS_OPTIONS = {
  readOnly: true,
  scrollbars: false,
  zoom: { controls: false, wheel: false, startScale: 0.72 },
  move: { scrollbars: false, drag: false, wheel: false },
  renderer: 'geras',
  theme: GEO_SCRATCH_BLOCK_THEME,
}

function BlockPreview({ type, onSelect, onDragStartBlock }) {
  const hostRef = useRef(null)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || !Blockly.Blocks[type]) return

    const ws = Blockly.inject(host, PALETTE_WS_OPTIONS)
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
  }, [type])

  const handleDragStart = (event) => {
    if (!event.dataTransfer) return
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-geoscratch-block-type', type)
    onDragStartBlock?.(type)
  }

  return (
    <div className="palette-block-preview" title="Click to add or drag into workspace">
      <div className="palette-block-preview__blockly-host" ref={hostRef} />
      <div
        className="palette-block-preview__drag-surface"
        role="button"
        tabIndex={0}
        draggable
        onDragStart={handleDragStart}
        onClick={() => onSelect(type)}
      />
    </div>
  )
}

function MyBlockCard({ block, onSelect, onDelete, onDragStartBlock }) {
  const handleDragStart = (event) => {
    if (!event.dataTransfer) return
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-geoscratch-my-block-id', block.id)
    onDragStartBlock?.(block.id)
  }

  return (
    <div className="my-block-card" draggable onDragStart={handleDragStart}>
      <button
        type="button"
        className="my-block-card__main"
        onClick={() => onSelect(block.id)}
        title="Add this saved block to the workspace"
      >
        <strong>{block.name}</strong>
      </button>
      <button
        type="button"
        className="my-block-card__delete"
        onClick={() => onDelete(block.id)}
        aria-label={`Delete ${block.name}`}
        title="Delete saved block"
      >
        x
      </button>
    </div>
  )
}

function MyBoxPalette({
  onMakeBlock,
  onUserBlockSelect,
  onUserBlockDelete,
  onUserBlockDragStart,
}) {
  const userBlocks = useWorkspaceStore((state) => state.userBlocks)

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
                onDelete={onUserBlockDelete}
                onDragStartBlock={onUserBlockDragStart}
              />
            ))
          ) : (
            <p className="my-box-empty">Save a workspace or a passed exercise to reuse it here.</p>
          )}
        </section>
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
