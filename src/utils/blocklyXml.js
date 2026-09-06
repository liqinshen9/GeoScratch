import * as Blockly from 'blockly/core'

// Attributes that describe where a block sits, not what it is. Two "My Blocks"
// saved from the same arrangement at different workspace positions, or with
// freshly generated ids, must compare as duplicates.
const IGNORED_DUPLICATE_ATTRIBUTES = new Set(['id', 'x', 'y'])

/**
 * Serialises one XML node to a stable string, ignoring position/identity
 * attributes and sorting so that ordering differences do not read as content
 * differences. Recursive; `canonicalizeWorkspaceXml` is the entry point.
 */
export function canonicalizeNode(node) {
  const tagName = node.tagName?.toLowerCase()
  if (!tagName) return ''

  const attributes = Array.from(node.attributes || [])
    .filter((attribute) => !IGNORED_DUPLICATE_ATTRIBUTES.has(attribute.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((attribute) => `${attribute.name}=${JSON.stringify(attribute.value)}`)
    .join(',')

  // Only top-level blocks are sorted: they have no inherent order in a
  // workspace, whereas an inner input/field order is meaningful.
  const children = Array.from(node.children || []).map(canonicalizeNode)
  if (tagName === 'xml') children.sort()

  const text = Array.from(node.childNodes || [])
    .filter((child) => child.nodeType === Node.TEXT_NODE)
    .map((child) => child.textContent.trim())
    .filter(Boolean)
    .join(' ')

  return `${tagName}(${attributes}){${JSON.stringify(text)}}[${children.join('')}]`
}

/**
 * A comparable fingerprint for workspace XML. Two XML texts describing the same
 * blocks produce the same string regardless of ids or positions -- this is what
 * makes "you already saved this block" detection work.
 *
 * Returns '' on malformed XML, which compares equal to other failures; callers
 * treat that as "cannot tell" rather than "definitely a duplicate".
 */
export function canonicalizeWorkspaceXml(xmlText) {
  try {
    return canonicalizeNode(Blockly.utils.xml.textToDom(xmlText))
  } catch (err) {
    console.error('[GeoScratch] Failed to compare My Block XML:', err)
    return ''
  }
}

/**
 * Wraps a bare `<block>` in an `<xml>` root if it is not already wrapped, so the
 * result can be handed to Blockly.Xml.domToWorkspace.
 */
export function toWorkspaceXmlText(xmlText) {
  const dom = Blockly.utils.xml.textToDom(xmlText)
  if (dom.tagName?.toLowerCase() === 'xml') return xmlText

  const xml = Blockly.utils.xml.createElement('xml')
  xml.appendChild(dom)
  return Blockly.Xml.domToText(xml)
}
