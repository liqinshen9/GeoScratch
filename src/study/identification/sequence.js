import { createRng } from '@/study/phase1/prng'
import { williamsSquare } from '@/study/phase1/williams'
import { IDENTIFICATION_CELLS } from './identificationConfig'

/**
 * The cell order comes from a 4 x 4 Williams square. Which measured scene set
 * goes with which cell comes from a rotation that advances once per four slots
 * as well as per slot, so the two are crossed (slots 1-16 cover every pairing).
 * Over 20 slots each set meets each cell five times.
 *
 * @param {number} slot  1-based counterbalancing slot
 */
export function resolveIdentificationOrder(slot) {
  const s = slot - 1
  const square = williamsSquare(IDENTIFICATION_CELLS.length)
  const cellOrder = square[s % square.length].map((i) => IDENTIFICATION_CELLS[i].id)
  const setRotation = (s + Math.floor(s / 4)) % IDENTIFICATION_CELLS.length
  return { cellOrder, setRotation }
}

export function setForCell(cellId, setRotation) {
  const cellIndex = IDENTIFICATION_CELLS.findIndex((c) => c.id === cellId)
  return (cellIndex + setRotation) % IDENTIFICATION_CELLS.length
}

/** A participant's blocks; `researchId` seeds the trial shuffles. */
export function resolveIdentificationSequence(researchId, slot, scenes) {
  const { cellOrder, setRotation } = resolveIdentificationOrder(slot)
  const blocks = cellOrder.map((cellId, blockIndex) => {
    const rng = createRng(`${researchId}:identify:block${blockIndex}`)
    const set = setForCell(cellId, setRotation)
    const practice = scenes.practice[blockIndex].map((s) => s.id)
    const measured = rng.shuffle(scenes.measured[set].map((s) => s.id))
    const trials = [
      ...practice.map((sceneId) => ({ sceneId, practice: true })),
      ...measured.map((sceneId) => ({ sceneId, practice: false })),
    ].map((trial, trialIndex) => ({ ...trial, trialIndex }))
    return { blockIndex, cell: cellId, sceneSet: set, trials }
  })
  return { researchId, slot, scenesSeed: scenes.seed, cellOrder, setRotation, blocks }
}
