// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { canonicalizeWorkspaceXml, toWorkspaceXmlText } from './blocklyXml'

const xml = (inner) => `<xml xmlns="https://developers.google.com/blockly/xml">${inner}</xml>`

describe('canonicalizeWorkspaceXml', () => {
  it('treats the same blocks at different positions as identical', () => {
    // This is the whole point: "you already saved this block" must not depend on
    // where the block happened to sit on the workspace.
    const a = xml('<block type="geo_cube" id="aaa" x="10" y="20"></block>')
    const b = xml('<block type="geo_cube" id="zzz" x="800" y="640"></block>')

    expect(canonicalizeWorkspaceXml(a)).toBe(canonicalizeWorkspaceXml(b))
  })

  it('treats different block types as different', () => {
    const cube = xml('<block type="geo_cube" id="a"></block>')
    const sphere = xml('<block type="geo_sphere" id="a"></block>')

    expect(canonicalizeWorkspaceXml(cube)).not.toBe(canonicalizeWorkspaceXml(sphere))
  })

  it('treats differing field values as different', () => {
    const one = xml('<block type="scalar"><field name="VALUE">1</field></block>')
    const two = xml('<block type="scalar"><field name="VALUE">2</field></block>')

    expect(canonicalizeWorkspaceXml(one)).not.toBe(canonicalizeWorkspaceXml(two))
  })

  it('ignores the order of top-level blocks', () => {
    // Top-level blocks have no inherent order in a workspace.
    const ab = xml('<block type="geo_cube" id="a"></block><block type="geo_sphere" id="b"></block>')
    const ba = xml('<block type="geo_sphere" id="b"></block><block type="geo_cube" id="a"></block>')

    expect(canonicalizeWorkspaceXml(ab)).toBe(canonicalizeWorkspaceXml(ba))
  })

  it('respects the order of nested inputs', () => {
    // Inner ordering IS meaningful -- it is which socket a block is plugged into.
    const ab = xml(
      '<block type="vector_arithmetic"><value name="A"><block type="linalg_vec3"></block></value><value name="B"><block type="linalg_point"></block></value></block>',
    )
    const ba = xml(
      '<block type="vector_arithmetic"><value name="B"><block type="linalg_point"></block></value><value name="A"><block type="linalg_vec3"></block></value></block>',
    )

    expect(canonicalizeWorkspaceXml(ab)).not.toBe(canonicalizeWorkspaceXml(ba))
  })

  it('ignores attribute ordering', () => {
    const a = xml('<block type="geo_cube" disabled="true" id="a"></block>')
    const b = xml('<block disabled="true" id="a" type="geo_cube"></block>')

    expect(canonicalizeWorkspaceXml(a)).toBe(canonicalizeWorkspaceXml(b))
  })
})

describe('toWorkspaceXmlText', () => {
  it('leaves an already-wrapped document alone', () => {
    const wrapped = xml('<block type="geo_cube"></block>')
    expect(toWorkspaceXmlText(wrapped)).toBe(wrapped)
  })

  it('wraps a bare block so it can be loaded into a workspace', () => {
    const result = toWorkspaceXmlText('<block type="geo_cube"></block>')

    // The serialiser adds an empty xmlns to the re-parented block; harmless, but
    // it means the block tag is not byte-identical to the input.
    expect(result).toMatch(/^<xml/)
    expect(result).toMatch(/<block[^>]*type="geo_cube"/)
  })
})
