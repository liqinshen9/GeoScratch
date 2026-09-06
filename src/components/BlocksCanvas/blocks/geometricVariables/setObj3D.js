import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
// import { threeObjStore } from '@/utils/store' // Global store for persisting THREE objects

let REGISTERED = false

/**
 * Register variables_set_obj3D building blocks + generator
 */
export function initSetObj3DBlock() {
  if (REGISTERED) return
  REGISTERED = true

  // === Block Defination ===
  Blockly.Blocks['variables_set_obj3D'] = {
    init: function () {
      this.appendValueInput('VALUE')
        .setCheck('obj3D')
        .appendField('set')
        .appendField(
          new Blockly.FieldDropdown(() => {
            const variables = this.workspace.getVariableMap().getVariablesOfType('obj3D')
            return variables.length ? variables.map((v) => [v.name, v.name]) : [['', '']]
          }),
          'VAR'
        )
        .appendField('to')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setStyle(BLOCK_STYLES.OBJECT_VARIABLE)
      this.setTooltip('Set a 3D object variable')
    },
  }

  // === Generator ===
  javascriptGenerator.forBlock['variables_set_obj3D'] = function (
    block,
    generator
  ) {
    const varName = generator.getVariableName(block.getFieldValue('VAR'))
    const argument0 =
      generator.valueToCode(block, 'VALUE', Order.NONE) || 'null'

    // No manual declaration here: the JavaScript generator's own init()
    // already emits `var <every used workspace variable>;` for every real
    // Blockly.Variables-backed variable (definitions_.variables) -- adding
    // our own `let`/`var` for the same name would re-declare it (SyntaxError).
    // That built-in declaration already defaults to `undefined`, which is
    // exactly as falsy-safe as an explicit `null` for a `get` block that
    // runs before this `set` (Blockly's top-level stacks execute in
    // creation order, not screen position) -- it degrades gracefully
    // instead of throwing a ReferenceError that would abort the entire
    // generated scene.

    // Evaluate the value expression exactly once: splicing `argument0` in
    // twice (once per statement) would construct two SEPARATE objects for
    // an expression with side effects (every creation block's generated
    // code is a function call), so threeObjStore[varName] -- what actually
    // gets rendered -- would silently diverge from the `varName` JS
    // variable itself.
    const setLocal = `${varName} = ${argument0};\n`
    const persist = `threeObjStore["${varName}"] = ${varName};\n`
    const nameStamp = `if (${varName} && typeof ${varName} === 'object') ${varName}.userData = Object.assign(${varName}.userData || {}, { label: "${varName}" });\n`

    return setLocal + persist + nameStamp
  }
}
