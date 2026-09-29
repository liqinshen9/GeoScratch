import {
  clearCustomName,
  getDisplayName,
  isCustomNamed,
  isNameTaken,
  setCustomName,
} from '@/utils/namingRegistry'

// Names the blocks an exercise's givens describe after the givens (P, Q, n),
// so the scene's labels match the task panel whatever order the blocks were
// made in. See docs/architecture/naming-registry.md#exercise-given-names.

/**
 * @param {object} workspace
 * @param {{ name: string, matches: (block) => boolean }[]} givenNames
 */
export function applyGivenNames(workspace, givenNames) {
  if (!workspace || !givenNames?.length) return
  const blocks = workspace.getAllBlocks(false)

  // A block edited away from its given gives the name back.
  for (const block of blocks) {
    if (!isCustomNamed(block)) continue
    const given = givenNames.find(({ name }) => name === getDisplayName(block))
    if (given && !given.matches(block)) clearCustomName(block)
  }

  // Names are unique, so a second match (a duplicated n) keeps its number.
  for (const { name, matches } of givenNames) {
    if (isNameTaken(workspace, name)) continue
    const block = blocks.find((candidate) => !isCustomNamed(candidate) && matches(candidate))
    if (block) setCustomName(block, name)
  }
}
