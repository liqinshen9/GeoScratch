import * as Blockly from 'blockly/core'

const TRANSFORM_STEP_LABEL_MIN_WIDTH = 165

class TransformStepLabel extends Blockly.FieldLabelSerializable {
  constructor(value, minWidth) {
    super(value)
    this.minWidth_ = minWidth
  }

  getSize() {
    const size = super.getSize()
    return new Blockly.utils.Size(Math.max(size.width, this.minWidth_), size.height)
  }
}

export function createTransformStepLabel() {
  return new TransformStepLabel('', TRANSFORM_STEP_LABEL_MIN_WIDTH)
}
