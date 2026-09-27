import * as Blockly from 'blockly/core'
import defineBlocks from '@/components/BlocksCanvas/blocks/index'
import { BlockRegistry } from '@/components/BlocksCanvas/state/BlockRegistry'
import { installNamingRegistry } from '@/utils/namingRegistry'
import runAndSync from '@/utils/runAndSync'
import { getLabelVisibilityKeysForObject } from '@/components/Scene3D/labels/labelData'
import { stimulusToXml, targetBlockIds } from './stimulusToXml'

/**
 * Scene objects for block XML, built in a headless workspace through the
 * editor's own pipeline. The caller applies the condition's settings first.
 */
export function buildSceneFromXml(xml) {
  defineBlocks()
  const workspace = new Blockly.Workspace()
  let objects = []
  try {
    Blockly.Events.disable()
    try {
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), workspace)
    } finally {
      Blockly.Events.enable()
    }
    installNamingRegistry(workspace)
    runAndSync(workspace, (built) => (objects = built), new BlockRegistry(), {
      runtimeMode: 'study',
    })
  } finally {
    workspace.dispose()
  }
  return objects
}

/**
 * Builds a stimulus's scene objects through the editor's own pipeline, in a
 * headless workspace: same generator, runtime, builders and collisions as the
 * 3D view. Builders read the active settings as they run, so the caller must
 * apply the condition's settings BEFORE calling this.
 * See docs/architecture/study-phase1.md#scene-build.
 *
 * @returns {{ objects: object[], hiddenLabelKeys: Set<string> }}
 *   `hiddenLabelKeys` hides every label except the A / B target letters.
 */
export function buildStimulusScene(stimulus) {
  const objects = buildSceneFromXml(stimulusToXml(stimulus))
  const targets = new Set(Object.values(targetBlockIds(stimulus)))
  const hiddenLabelKeys = new Set(
    objects
      .filter((object) => !targets.has(object.userData?.srcBlockId))
      .flatMap((object) => getLabelVisibilityKeysForObject(object)),
  )
  return { objects, hiddenLabelKeys }
}
