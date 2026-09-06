/** @typedef {number[][]} Mat3 Row-major 3×3 matrix. */
/** @typedef {number[][]} Mat4 Row-major 4×4 homogeneous matrix. */

const DEG = Math.PI / 180

/**
 * @param {number} n
 * @param {number} [decimals]
 */
export function formatMatrixEntry(n, decimals = 4) {
  if (!Number.isFinite(n)) return '0'
  const rounded = Number(n.toFixed(decimals))
  if (Object.is(rounded, -0)) return '0'
  return String(rounded)
}

/**
 * @param {number[][]} m
 * @returns {string}
 */
export function formatMatrixHtml(m) {
  const rows = m
    .map((row) => `<tr>${row.map((v) => `<td>${formatMatrixEntry(v)}</td>`).join('')}</tr>`)
    .join('')
  return `<table class="blockly-matrix-preview-table"><tbody>${rows}</tbody></table>`
}

/**
 * @param {Mat4} a
 * @param {Mat4} b
 * @returns {Mat4}
 */
export function multiplyMat4(a, b) {
  const out = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[i][k] * b[k][j]
      out[i][j] = sum
    }
  }
  return out
}

/**
 * @param {number} angleRad
 * @returns {Mat4}
 */
function rotationX(angleRad) {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  return [
    [1, 0, 0, 0],
    [0, c, -s, 0],
    [0, s, c, 0],
    [0, 0, 0, 1],
  ]
}

/**
 * @param {number} angleRad
 * @returns {Mat4}
 */
function rotationY(angleRad) {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  return [
    [c, 0, s, 0],
    [0, 1, 0, 0],
    [-s, 0, c, 0],
    [0, 0, 0, 1],
  ]
}

/**
 * @param {number} angleRad
 * @returns {Mat4}
 */
function rotationZ(angleRad) {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  return [
    [c, -s, 0, 0],
    [s, c, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]
}

function getAxisRotation(axis, angleRad) {
  if (axis === 'X') return rotationX(angleRad)
  if (axis === 'Y') return rotationY(angleRad)
  return rotationZ(angleRad)
}

/**
 * Homogeneous rotation around one selected axis.
 * @param {'X' | 'Y' | 'Z'} axis
 * @param {number} degrees
 * @returns {Mat4}
 */
export function rotationMatrixAroundAxisFromDegrees(axis, degrees) {
  return getAxisRotation(axis, degrees * DEG)
}

/**
 * @param {number} tx
 * @param {number} ty
 * @param {number} tz
 * @returns {Mat4}
 */
export function translationMatrix(tx, ty, tz) {
  return [
    [1, 0, 0, tx],
    [0, 1, 0, ty],
    [0, 0, 1, tz],
    [0, 0, 0, 1],
  ]
}

/**
 * @param {number} sx
 * @param {number} sy
 * @param {number} sz
 * @returns {Mat4}
 */
export function scaleMatrix(sx, sy, sz) {
  return [
    [sx, 0, 0, 0],
    [0, sy, 0, 0],
    [0, 0, sz, 0],
    [0, 0, 0, 1],
  ]
}

/**
 * @param {Mat4} m4
 * @returns {Mat3}
 */
export function mat4ToMat3(m4) {
  return m4.slice(0, 3).map((row) => row.slice(0, 3))
}

/**
 * @param {'X' | 'Y' | 'Z'} axis
 * @param {number} degrees
 * @returns {Mat3}
 */
export function rotationMatrix3x3AroundAxisFromDegrees(axis, degrees) {
  return mat4ToMat3(rotationMatrixAroundAxisFromDegrees(axis, degrees))
}

/**
 * @param {number} tx
 * @param {number} ty
 * @param {number} tz
 * @returns {Mat3}
 */
export function translationMatrix3x3(tx, ty, tz) {
  return [
    [1, 0, tx],
    [0, 1, ty],
    [0, 0, tz],
  ]
}

/**
 * @param {number} sx
 * @param {number} sy
 * @param {number} sz
 * @returns {Mat3}
 */
export function scaleMatrix3x3(sx, sy, sz) {
  return [
    [sx, 0, 0],
    [0, sy, 0],
    [0, 0, sz],
  ]
}
