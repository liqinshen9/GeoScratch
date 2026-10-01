import { createRng } from './prng'
import { williamsSquare, participantRow } from './williams'
import { TECHNIQUE_IDS } from './conditions'

export const SEQUENCE_VERSION = 3

/** The Williams row and the technique order it gives, without building trials. */
export function resolveTechniqueOrder(participantCode, slot = null) {
  const square = williamsSquare(TECHNIQUE_IDS.length)
  const squareRow = participantRow(participantCode, square.length, slot)
  return { squareRow, techniqueOrder: square[squareRow].map((index) => TECHNIQUE_IDS[index]) }
}

/**
 * A participant's full Phase 1 sequence, derived only from their code, their
 * counterbalancing slot and the stimulus set: technique order from the
 * Williams square, then per block the
 * practice stimuli followed by the measured stimuli, each shuffled by a seed
 * that includes the block index. The resolved object is also stored on the
 * profile so analysis never depends on this function staying unchanged.
 */
export function resolveSequence(participantCode, stimulusSet, slot = null) {
  const { squareRow, techniqueOrder } = resolveTechniqueOrder(participantCode, slot)

  const blocks = techniqueOrder.map((technique, blockIndex) => {
    const rng = createRng(`${participantCode}:phase1:block${blockIndex}`)
    const practice = rng.shuffle(stimulusSet.practice.map((s) => s.id))
    const measured = rng.shuffle(stimulusSet.measured.map((s) => s.id))
    const trials = [
      ...practice.map((stimulusId) => ({ stimulusId, practice: true })),
      ...measured.map((stimulusId) => ({ stimulusId, practice: false })),
    ].map((trial, trialIndex) => ({ ...trial, trialIndex }))
    return { blockIndex, technique, trials }
  })

  return {
    version: SEQUENCE_VERSION,
    participantCode,
    slot,
    squareRow,
    stimulusSetSeed: stimulusSet.seed,
    techniqueOrder,
    blocks,
  }
}
