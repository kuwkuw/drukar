import type { RawMesh } from './raw.js';
import { faceNormal, faceVerts, triCount, weldVertices } from './raw.js';

const HEADER_BYTES = 80;
const TRI_BYTES = 50; // 12 floats (48 bytes) + uint16 attribute

/**
 * Binary STL: 80-byte header, uint32 triangle count, then per triangle
 * normal (3×f32), three vertices (9×f32) and a uint16 attribute, all
 * little-endian.
 */
export function writeBinaryStl(mesh: RawMesh, headerText = 'drukar binary STL'): Buffer {
  const tris = triCount(mesh);
  const buf = Buffer.alloc(HEADER_BYTES + 4 + tris * TRI_BYTES);
  buf.write(headerText.slice(0, HEADER_BYTES), 0, 'ascii');
  buf.writeUInt32LE(tris, HEADER_BYTES);
  let offset = HEADER_BYTES + 4;
  for (let t = 0; t < tris; t++) {
    const [a, b, c] = faceVerts(mesh, t);
    const n = faceNormal(a, b, c) ?? [0, 0, 0];
    for (const v of [n, a, b, c]) {
      buf.writeFloatLE(v[0], offset);
      buf.writeFloatLE(v[1], offset + 4);
      buf.writeFloatLE(v[2], offset + 8);
      offset += 12;
    }
    buf.writeUInt16LE(0, offset);
    offset += 2;
  }
  return buf;
}

/** Parse binary or ASCII STL; vertices are welded into an indexed mesh. */
export function readStl(data: Buffer): RawMesh {
  if (isBinaryStl(data)) return readBinaryStl(data);
  return readAsciiStl(data.toString('ascii'));
}

function isBinaryStl(data: Buffer): boolean {
  if (data.length < HEADER_BYTES + 4) return false;
  const tris = data.readUInt32LE(HEADER_BYTES);
  if (data.length === HEADER_BYTES + 4 + tris * TRI_BYTES) return true;
  // Some exporters pad binary files; fall back to sniffing for ASCII keywords.
  const head = data.subarray(0, 512).toString('ascii');
  return !(head.trimStart().startsWith('solid') && head.includes('facet'));
}

function readBinaryStl(data: Buffer): RawMesh {
  const tris = data.readUInt32LE(HEADER_BYTES);
  const positions = new Float32Array(tris * 9);
  const indices = new Uint32Array(tris * 3);
  let offset = HEADER_BYTES + 4;
  for (let t = 0; t < tris; t++) {
    offset += 12; // skip stored normal; we recompute from geometry
    for (let v = 0; v < 3; v++) {
      positions[t * 9 + v * 3] = data.readFloatLE(offset);
      positions[t * 9 + v * 3 + 1] = data.readFloatLE(offset + 4);
      positions[t * 9 + v * 3 + 2] = data.readFloatLE(offset + 8);
      indices[t * 3 + v] = t * 3 + v;
      offset += 12;
    }
    offset += 2;
  }
  return weldVertices({ positions, indices });
}

function readAsciiStl(text: string): RawMesh {
  const vertexRe = /vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/g;
  const coords: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = vertexRe.exec(text)) !== null) {
    coords.push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  const tris = Math.floor(coords.length / 9);
  const positions = new Float32Array(coords.slice(0, tris * 9));
  const indices = new Uint32Array(tris * 3);
  for (let i = 0; i < tris * 3; i++) indices[i] = i;
  return weldVertices({ positions, indices });
}
