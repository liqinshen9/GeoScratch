import { useLayoutEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import { getCategory } from '@/components/BlocksCanvas/catalog/blockCatalog'

const PALETTE_WS_OPTIONS = {
  readOnly: true,
  scrollbars: false,
  zoom: { controls: false, wheel: false, startScale: 0.9 },
  move: { scrollbars: false, drag: false, wheel: false },
  renderer: 'geras',
  theme: Blockly.Themes.Classic,
}

function BlockPreview({ type, onSelect }) {
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
    host.style.height = `${Math.ceil(hw.height + 20)}px`

    const svg = block.getSvgRoot()
    if (svg) svg.style.cursor = 'pointer'

    const onClick = () => onSelect(type)
    host.addEventListener('click', onClick)
    Blockly.svgResize(ws)

    return () => {
      host.removeEventListener('click', onClick)
      ws.dispose()
      host.innerHTML = ''
    }
  }, [type, onSelect])

  return <div className="palette-block-preview" ref={hostRef} role="button" tabIndex={0} />
}

export default function BlockPalette({ categoryId, onBlockSelect }) {
  const category = getCategory(categoryId)
  if (!category) return null

  return (
    <div className="block-palette">
      <div className="block-palette-scroll">
        {category.groups.map((group) => (
          <section key={group.label} className="palette-group">
            <h3 className="palette-group-label">{group.label}</h3>
            {group.blocks.map(({ type }) => (
              <BlockPreview key={type} type={type} onSelect={onBlockSelect} />
            ))}
          </section>
        ))}
      </div>

      <p className="block-palette-hint">Click a block to add it to the workspace</p>
    </div>
  )
}
