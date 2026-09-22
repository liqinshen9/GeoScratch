// Always exactly one decimal ("[1.0, 2.0, 2.0]"), so a label read live during
// an animation keeps a steady width instead of flickering between lengths.
// Anything that rounds to zero prints as 0.0, never -0.0.
export function formatVectorLive(vector) {
  const fixed = (value) => (Math.abs(value) < 0.05 ? 0 : value).toFixed(1)
  return `[${fixed(vector.x)}, ${fixed(vector.y)}, ${fixed(vector.z)}]`
}

export function createVectorNotationRuntime() {
  const getLabel = (value, fallback) => value?.userData?.label || fallback
  const hasLabel = (value) => Boolean(value?.userData?.label)
  const hasVisibleLabel = (value) => Boolean(value?.userData?.labelVisible)

  const setVectorMetadata = (vector, metadata = {}) => {
    if (!vector) return vector
    vector.userData = {
      ...(vector.userData || {}),
      ...metadata,
    }
    return vector
  }

  return {
    binaryLabel: (left, operator, right, leftFallback = 'a', rightFallback = 'b') =>
      `${getLabel(left, leftFallback)} ${operator} ${getLabel(right, rightFallback)}`,
    dotLabel: (left, right) => `${getLabel(left, 'p')} dot ${getLabel(right, 'q')}`,
    formatNumber: (value) => Number(Number(value).toFixed(3)),
    formatVector: (vector) =>
      '[' +
      [vector.x, vector.y, vector.z].map((value) => Number(value.toFixed(3))).join(', ') +
      ']',
    formatVectorLive,
    getLabel,
    hasLabel,
    hasVisibleLabel,
    shouldShowOperandLabels: (left, right) => !hasLabel(left) && !hasLabel(right),
    setVectorMetadata,
  }
}
