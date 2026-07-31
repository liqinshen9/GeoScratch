import * as Blockly from 'blockly/core'

const FALLBACK_OFFSET = 28

function getTopLevelBlocks(dom) {
  return Array.from(dom.children || []).filter((node) => node.tagName?.toLowerCase() === 'block')
}

function getNumericAttribute(node, name, fallback = 0) {
  const value = Number(node.getAttribute(name))
  return Number.isFinite(value) ? value : fallback
}

function getViewCenter(workspace) {
  const metrics = workspace.getMetrics()
  return {
    x: metrics.viewLeft + metrics.viewWidth / 2,
    y: metrics.viewTop + metrics.viewHeight / 2,
  }
}

function clientToWorkspaceXY(workspace, clientX, clientY) {
  const screenCoord = new Blockly.utils.Coordinate(clientX, clientY)
  return Blockly.utils.svgMath.screenToWsCoordinates(workspace, screenCoord)
}

function prepareCompositeDom(dom, workspace, options) {
  dom.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))

  const topBlocks = getTopLevelBlocks(dom)
  if (!topBlocks.length) return dom

  const anchor =
    Number.isFinite(options.clientX) && Number.isFinite(options.clientY)
      ? clientToWorkspaceXY(workspace, options.clientX, options.clientY)
      : getViewCenter(workspace)

  const minX = Math.min(...topBlocks.map((node) => getNumericAttribute(node, 'x')))
  const minY = Math.min(...topBlocks.map((node) => getNumericAttribute(node, 'y')))
  const existingCount = workspace.getTopBlocks(false).length
  const offset = existingCount * FALLBACK_OFFSET

  topBlocks.forEach((node) => {
    const x = getNumericAttribute(node, 'x')
    const y = getNumericAttribute(node, 'y')
    node.setAttribute('x', String(Math.round(anchor.x + x - minX + offset)))
    node.setAttribute('y', String(Math.round(anchor.y + y - minY + offset)))
  })

  return dom
}

export default function addCompositeBlockToWorkspace(workspace, xmlText, options = {}) {
  if (!workspace || workspace.isFlyout || !xmlText) return false

  const group = Blockly.utils.idGenerator.genUid()
  Blockly.Events.setGroup(group)
  try {
    const dom = Blockly.utils.xml.textToDom(xmlText)
    Blockly.Xml.domToWorkspace(prepareCompositeDom(dom, workspace, options), workspace)
    Blockly.svgResize(workspace)
    return true
  } catch (err) {
    console.error('[GeoScratch] addCompositeBlockToWorkspace error:', err)
    return false
  } finally {
    Blockly.Events.setGroup(false)
  }
}
