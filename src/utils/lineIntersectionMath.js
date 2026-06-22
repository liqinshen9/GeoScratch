//solve three component equations for two unknowns
//For line intersections, those unknowns are t1 and t2.
export function leastSquares2(col1, col2, target, dot) {
  const a11 = dot(col1, col1)
  const a12 = dot(col1, col2)
  const a22 = dot(col2, col2)
  const b1 = dot(col1, target)
  const b2 = dot(col2, target)
  const trace = a11 + a22
  const delta = Math.hypot(a11 - a22, 2 * a12)
  const lambda1 = (trace + delta) / 2
  const lambda2 = (trace - delta) / 2
  const tolerance = Math.max(lambda1, 1) * 1e-12
  const applyEigenInverse = (lambda, vx, vy) => {
    if (lambda <= tolerance) return [0, 0]
    const scale = (vx * b1 + vy * b2) / lambda
    return [scale * vx, scale * vy]
  }
  let vx1
  let vy1
  let vx2
  let vy2

  if (Math.abs(a12) <= 1e-12 && Math.abs(a11 - a22) <= 1e-12) {
    vx1 = 1
    vy1 = 0
    vx2 = 0
    vy2 = 1
  } else if (Math.abs(a12) <= 1e-12) {
    const firstIsX = a11 >= a22
    vx1 = firstIsX ? 1 : 0
    vy1 = firstIsX ? 0 : 1
    vx2 = firstIsX ? 0 : 1
    vy2 = firstIsX ? 1 : 0
  } else {
    const length = Math.hypot(a12, lambda1 - a11)
    vx1 = a12 / length
    vy1 = (lambda1 - a11) / length
    vx2 = -vy1
    vy2 = vx1
  }

  const part1 = applyEigenInverse(lambda1, vx1, vy1)
  const part2 = applyEigenInverse(lambda2, vx2, vy2)
  return [part1[0] + part2[0], part1[1] + part2[1]]
}

export function closestLineData(lineA, lineB, ops, leastSquares2Fn = leastSquares2) {
  const p1 = lineA.origin
  const d1 = lineA.direction
  const p3 = lineB.origin
  const d2 = lineB.direction

  //Move known points to the right side:
  //p1 + d1*t1 = p3 + d2*t2 becomes d1*t1 - d2*t2 = p3 - p1.
  //This gives one x equation, one y equation, and one z equation.
  const target = ops.sub(p3, p1)
  const [t1, t2] = leastSquares2Fn(d1, ops.scale(d2, -1), target, ops.dot)

  //Find one point on each line, then use their midpoint.
  const pointA = ops.add(p1, ops.scale(d1, t1))
  const pointB = ops.add(p3, ops.scale(d2, t2))
  const midpoint = ops.scale(ops.add(pointA, pointB), 0.5)
  const gap = ops.distance(pointA, pointB)

  return { t1, t2, pointA, pointB, midpoint, gap }
}
