export function attachSingleStepDrag(block) {
  if (block._singleStepDragEnabled || typeof block.startDrag !== 'function') return

  const startDrag = block.startDrag.bind(block)
  block.startDrag = (event) => {
    startDrag({
      altKey: event?.altKey ?? false,
      ctrlKey: true,
      metaKey: event?.metaKey ?? false,
    })
  }
  block._singleStepDragEnabled = true
}
