import { useCallback, useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'

// Transfer a palette press into Blockly's gesture so connection previews, undo
// and trash behave just like an existing block. See docs/architecture/blockly-integration.md.
export function usePaletteDrag(workspace, hostRef, closePalette) {
  const activeRef = useRef(null)

  useEffect(() => {
    const overSavedTrash = (active, event) => {
      const rect = active.palette?.querySelector('.my-block-trash')?.getBoundingClientRect()
      return (
        active.deleteSaved &&
        rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      )
    }
    let suppressClick = false
    const pointerdown = () => {
      suppressClick = false
    }
    const click = (event) => {
      if (
        suppressClick &&
        event.detail > 0 &&
        event.target.closest?.('.palette-block-preview, .my-block-card')
      ) {
        event.preventDefault()
        event.stopPropagation()
        suppressClick = false
      }
    }
    const inside = (event) => {
      const rect = hostRef.current?.getBoundingClientRect()
      const palette = activeRef.current?.palette
      const overlay = palette?.isConnected ? palette.getBoundingClientRect() : null
      if (
        overlay &&
        event.clientX >= overlay.left &&
        event.clientX <= overlay.right &&
        event.clientY >= overlay.top &&
        event.clientY <= overlay.bottom
      )
        return false
      return (
        rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      )
    }
    const finish = (event, cancel = false) => {
      const active = activeRef.current
      if (!active || (event.pointerId != null && event.pointerId !== active.down.pointerId)) return
      if (!active.gesture) {
        activeRef.current = null
        return
      }
      const validDrop = inside(event)
      const savedTrash = overSavedTrash(active, event)
      activeRef.current = null
      if (cancel || !validDrop) {
        active.gesture.handleMove(
          new PointerEvent('pointermove', {
            pointerId: active.down.pointerId,
            pointerType: active.down.pointerType,
            clientX: -10000,
            clientY: -10000,
            buttons: 1,
          }),
        )
        active.gesture.cancel()
        Blockly.Events.setGroup(active.group)
        active.blocks.filter((block) => !block.isDeadOrDying()).forEach((block) => block.dispose())
        if (!cancel && savedTrash) active.deleteSaved?.()
      } else {
        active.blocks.forEach((block) => {
          block.getSvgRoot().style.visibility = ''
        })
        active.gesture.handleUp(event)
        const position = active.blocks[0].getRelativeToSurfaceXY()
        active.blocks.slice(1).forEach((block, index) => {
          const start = active.positions[index + 1]
          const current = block.getRelativeToSurfaceXY()
          block.moveBy(
            start.x + position.x - active.positions[0].x - current.x,
            start.y + position.y - active.positions[0].y - current.y,
          )
        })
      }
      active.ghost?.remove()
      active.palette?.querySelector('.my-block-trash')?.classList.remove('is-active')
      document.body.classList.remove('palette-dragging')
      Blockly.Events.setGroup(active.previousGroup)
    }
    const move = (event) => {
      const active = activeRef.current
      if (!active || event.pointerId !== active.down.pointerId) return
      if (!active.gesture) {
        if (
          Math.hypot(event.clientX - active.down.clientX, event.clientY - active.down.clientY) < 6
        )
          return
        active.previousGroup = Blockly.Events.getGroup()
        suppressClick = true
        active.group = Blockly.utils.idGenerator.genUid()
        Blockly.Events.setGroup(active.group)
        active.blocks = active.create({
          clientX: active.down.clientX,
          clientY: active.down.clientY,
        })
        const block = active.blocks?.[0]
        if (!block) {
          activeRef.current = null
          Blockly.Events.setGroup(active.previousGroup)
          return
        }
        const point = Blockly.utils.svgMath.screenToWsCoordinates(
          workspace,
          new Blockly.utils.Coordinate(active.down.clientX, active.down.clientY),
        )
        const position = block.getRelativeToSurfaceXY()
        active.blocks.forEach((root) =>
          root.moveBy(
            point.x - active.offset.x / workspace.scale - position.x,
            point.y - active.offset.y / workspace.scale - position.y,
          ),
        )
        active.positions = active.blocks.map((root) => root.getRelativeToSurfaceXY())
        const boxes = active.blocks.map((root, index) => {
          const bounds = root.getSvgRoot().getBBox()
          return {
            x: bounds.x + active.positions[index].x,
            y: bounds.y + active.positions[index].y,
            width: bounds.width,
            height: bounds.height,
          }
        })
        const left = Math.min(...boxes.map((box) => box.x))
        const top = Math.min(...boxes.map((box) => box.y))
        const width = Math.max(...boxes.map((box) => box.x + box.width)) - left
        const height = Math.max(...boxes.map((box) => box.y + box.height)) - top
        const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        ghost.setAttribute('viewBox', `0 0 ${width} ${height}`)
        ghost.setAttribute('width', width * workspace.scale)
        ghost.setAttribute('height', height * workspace.scale)
        ghost.classList.add('palette-drag-preview')
        active.blocks.forEach((root, index) => {
          const copy = root.getSvgRoot().cloneNode(true)
          copy.setAttribute(
            'transform',
            `translate(${active.positions[index].x - left}, ${active.positions[index].y - top})`,
          )
          copy.removeAttribute('id')
          const originalText = root.getSvgRoot().querySelectorAll('text')
          copy.querySelectorAll('text').forEach((text, index) => {
            const style = getComputedStyle(originalText[index])
            text.style.fontSize = style.fontSize
            text.style.fontFamily = style.fontFamily
            text.style.fontWeight = style.fontWeight
          })
          copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
          ghost.append(copy)
        })
        active.ghostOffset = {
          x: (left - boxes[0].x) * workspace.scale,
          y: (top - boxes[0].y) * workspace.scale,
        }
        document.body.append(ghost)
        active.ghost = ghost
        const down = new PointerEvent('pointerdown', {
          clientX: active.down.clientX,
          clientY: active.down.clientY,
          pointerId: active.down.pointerId,
          pointerType: active.down.pointerType,
          button: 0,
          buttons: 1,
        })
        Blockly.Touch.clearTouchIdentifier()
        Blockly.Touch.checkTouchIdentifier(down)
        active.gesture = workspace.getGesture(down)
        active.gesture.handleBlockStart(down, block)
        active.gesture.handleWsStart(down, workspace)
        active.gesture.handleMove(event)
        document.body.classList.add('palette-dragging')
      }
      const dx = (event.clientX - active.down.clientX) / workspace.scale
      const dy = (event.clientY - active.down.clientY) / workspace.scale
      active.blocks.slice(1).forEach((block, index) => {
        const current = block.getRelativeToSurfaceXY()
        const start = active.positions[index + 1]
        block.moveBy(start.x + dx - current.x, start.y + dy - current.y)
      })
      if (inside(event)) closePalette()
      active.palette
        ?.querySelector('.my-block-trash')
        ?.classList.toggle('is-active', Boolean(overSavedTrash(active, event)))
      active.ghost.style.left = `${event.clientX - active.offset.x + active.ghostOffset.x}px`
      active.ghost.style.top = `${event.clientY - active.offset.y + active.ghostOffset.y}px`
      const rect = hostRef.current.getBoundingClientRect()
      const ghostX = event.clientX - active.offset.x + active.ghostOffset.x
      const ghostY = event.clientY - active.offset.y + active.ghostOffset.y
      const useGhost =
        ghostX < rect.left ||
        ghostY < rect.top ||
        ghostX + Number(active.ghost.getAttribute('width')) > rect.right ||
        ghostY + Number(active.ghost.getAttribute('height')) > rect.bottom
      active.ghost.style.display = useGhost ? 'block' : 'none'
      active.blocks.forEach((block) => {
        block.getSvgRoot().style.visibility = useGhost ? 'hidden' : ''
      })
    }
    const cancel = (event) => finish(event, true)
    const keydown = (event) => {
      if (event.key === 'Escape' && activeRef.current) {
        event.preventDefault()
        cancel(event)
      }
    }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerdown', pointerdown, true)
    window.addEventListener('click', click, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('blur', cancel)
    return () => {
      cancel({})
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerdown', pointerdown, true)
      window.removeEventListener('click', click, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('blur', cancel)
    }
  }, [workspace, hostRef, closePalette])

  return useCallback(
    (event, create, deleteSaved) => {
      if (
        !workspace?.rendered ||
        workspace.isDragging() ||
        event.button !== 0 ||
        event.isPrimary === false
      )
        return
      const preview = event.currentTarget
        .closest('.palette-block-preview, .my-block-card')
        ?.querySelector('.blocklyBlockCanvas > .blocklyBlock')
      const rect = preview?.getBoundingClientRect()
      activeRef.current = {
        down: event.nativeEvent,
        offset: {
          x: Math.max(
            0,
            Math.min(event.clientX - (rect?.left ?? event.clientX), (rect?.width ?? 24) - 1),
          ),
          y: Math.max(
            0,
            Math.min(event.clientY - (rect?.top ?? event.clientY), (rect?.height ?? 24) - 1),
          ),
        },
        create,
        deleteSaved,
        palette: event.currentTarget.closest('.blocks-col--palette-flyout'),
      }
    },
    [workspace],
  )
}
