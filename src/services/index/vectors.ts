export const DIM = 512;

export function b64ToFloats(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export function floatsToB64(v: Float32Array): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192)); // a char at a time is ~5 MB of appends for Tidy's vectors
  return btoa(bin);
}

/** dot(row a of A, row b of B) for row-major n*DIM matrices */
export function dot(A: Float32Array, a: number, B: Float32Array, b: number): number {
  let s = 0;
  const ao = a * DIM, bo = b * DIM;
  for (let j = 0; j < DIM; j++) s += A[ao + j] * B[bo + j];
  return s;
}

/** Scores of every row of M against query q (row 0 of q). */
export function scoreAll(M: Float32Array, q: Float32Array): Float32Array {
  const n = M.length / DIM;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dot(M, i, q, 0);
  return out;
}

export function isZero(M: Float32Array, i: number): boolean {
  return M[i * DIM] === 0 && M[i * DIM + 1] === 0 && M[i * DIM + 2] === 0;
}
