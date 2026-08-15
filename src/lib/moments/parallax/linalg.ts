// Small dense linear algebra for the two-view geometry pipeline. Everything
// here operates on tiny matrices (≤9×9), so clarity beats cleverness.

export type Mat3 = number[]; // row-major, length 9

/**
 * Jacobi eigendecomposition of a symmetric n×n matrix (row-major).
 * Returns eigenvalues (descending) and matching eigenvectors as columns.
 */
export function symmetricEigen(A: number[], n: number): { values: number[]; vectors: number[] } {
  const a = A.slice();
  const v = new Array(n * n).fill(0);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;

  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++)
      for (let q = p + 1; q < n; q++) off += a[p * n + q] * a[p * n + q];
    if (off < 1e-22) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-30) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p];
          const akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k];
          const aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p];
          const vkq = v[k * n + q];
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (i, j) => a[j * n + j] - a[i * n + i]
  );
  const values = order.map((i) => a[i * n + i]);
  const vectors = new Array(n * n);
  for (let c = 0; c < n; c++)
    for (let r = 0; r < n; r++) vectors[r * n + c] = v[r * n + order[c]];
  return { values, vectors };
}

/** Smallest-eigenvalue eigenvector of AᵀA where A is m×n row-major. */
export function minRightSingularVector(A: number[], m: number, n: number): number[] {
  const ata = new Array(n * n).fill(0);
  for (let i = 0; i < m; i++)
    for (let r = 0; r < n; r++) {
      const air = A[i * n + r];
      if (air === 0) continue;
      for (let c = r; c < n; c++) ata[r * n + c] += air * A[i * n + c];
    }
  for (let r = 1; r < n; r++) for (let c = 0; c < r; c++) ata[r * n + c] = ata[c * n + r];
  const { vectors } = symmetricEigen(ata, n);
  const out = new Array(n);
  for (let r = 0; r < n; r++) out[r] = vectors[r * n + (n - 1)];
  return out;
}

/** SVD of a 3×3 matrix via eigendecompositions of EᵀE and EEᵀ. */
export function svd3(E: Mat3): { U: Mat3; S: number[]; V: Mat3 } {
  const EtE = mul3(transpose3(E), E);
  const { values, vectors: V } = symmetricEigen(EtE, 3);
  const S = values.map((x) => Math.sqrt(Math.max(0, x)));
  // U columns = E·v / σ (fall back to anything orthogonal for σ≈0).
  const U: number[] = new Array(9).fill(0);
  for (let c = 0; c < 3; c++) {
    const vcol = [V[c], V[3 + c], V[6 + c]];
    let u = matVec3(E, vcol);
    const s = S[c];
    if (s > 1e-12) {
      u = u.map((x) => x / s);
    } else {
      const u0 = [U[0], U[3], U[6]];
      const u1 = [U[1], U[4], U[7]];
      u = cross3(u0, u1);
      const n = Math.hypot(u[0], u[1], u[2]) || 1;
      u = u.map((x) => x / n);
    }
    U[c] = u[0];
    U[3 + c] = u[1];
    U[6 + c] = u[2];
  }
  return { U, S, V };
}

export function transpose3(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
}

export function matVec3(m: Mat3, v: number[]): number[] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function cross3(a: number[], b: number[]): number[] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function det3(m: Mat3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

/** Solve A x = b for small dense systems by Gaussian elimination with pivoting. */
export function solveLinear(A: number[], b: number[], n: number): number[] | null {
  const a = A.slice();
  const x = b.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(a[r * n + col]) > Math.abs(a[piv * n + col])) piv = r;
    if (Math.abs(a[piv * n + col]) < 1e-12) return null;
    if (piv !== col) {
      for (let c = 0; c < n; c++) {
        const tmp = a[col * n + c];
        a[col * n + c] = a[piv * n + c];
        a[piv * n + c] = tmp;
      }
      const tmp = x[col];
      x[col] = x[piv];
      x[piv] = tmp;
    }
    const d = a[col * n + col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r * n + col] / d;
      if (f === 0) continue;
      for (let c = col; c < n; c++) a[r * n + c] -= f * a[col * n + c];
      x[r] -= f * x[col];
    }
  }
  for (let i = 0; i < n; i++) x[i] /= a[i * n + i];
  return x;
}
