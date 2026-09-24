import { readBlockData, writeBlockData } from '@/utils/namingRegistry'

export const MY_BLOCK_COLOUR = '#fb7185'

const MY_BLOCK_DATA_NAMESPACE = 'geoScratchMyBlock'

export function isMyBlockInstance(block) {
  return Boolean(readBlockData(block, MY_BLOCK_DATA_NAMESPACE))
}

export function markMyBlockInstance(block, sourceId) {
  if (!block) return
  writeBlockData(block, MY_BLOCK_DATA_NAMESPACE, { sourceId })
  block.setColour(MY_BLOCK_COLOUR)
}

export function applyMyBlockColours(workspace) {
  workspace?.getAllBlocks(false).forEach((block) => {
    if (isMyBlockInstance(block)) block.setColour(MY_BLOCK_COLOUR)
  })
}
