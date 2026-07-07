import { Document, NodeIO } from '@gltf-transform/core';
import type { RawMesh, Vec3 } from './raw.js';
import { faceNormal, faceVerts, triCount, weldVertices } from './raw.js';

const io = new NodeIO();

/** Read a GLB/GLTF binary, flattening all mesh primitives into one RawMesh. */
export async function readGlb(data: Uint8Array): Promise<RawMesh> {
  const doc = await io.readBinary(data);
  const positions: number[] = [];
  const indices: number[] = [];

  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const matrix = node.getWorldMatrix(); // column-major mat4
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4 /* TRIANGLES */) continue;
      const posAccessor = prim.getAttribute('POSITION');
      if (!posAccessor) continue;
      const pos = posAccessor.getArray();
      if (!pos) continue;
      const base = positions.length / 3;
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i]!;
        const y = pos[i + 1]!;
        const z = pos[i + 2]!;
        positions.push(
          matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
          matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
          matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
        );
      }
      const idx = prim.getIndices()?.getArray();
      if (idx) {
        for (let i = 0; i < idx.length; i++) indices.push(base + idx[i]!);
      } else {
        for (let i = 0; i < pos.length / 3; i++) indices.push(base + i);
      }
    }
  }

  return weldVertices({
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  });
}

/**
 * Write a preview GLB. Vertices are de-indexed so each face carries flat
 * normals — keeps browser-side loading dumb and dependency-free.
 */
export async function writeGlb(mesh: RawMesh): Promise<Uint8Array> {
  const tris = triCount(mesh);
  const positions = new Float32Array(tris * 9);
  const normals = new Float32Array(tris * 9);
  for (let t = 0; t < tris; t++) {
    const [a, b, c] = faceVerts(mesh, t);
    const n: Vec3 = faceNormal(a, b, c) ?? [0, 0, 1];
    const verts = [a, b, c];
    for (let v = 0; v < 3; v++) {
      positions.set(verts[v]!, t * 9 + v * 3);
      normals.set(n, t * 9 + v * 3);
    }
  }

  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc
    .createAccessor('position')
    .setType('VEC3')
    .setArray(positions)
    .setBuffer(buffer);
  const normal = doc.createAccessor('normal').setType('VEC3').setArray(normals).setBuffer(buffer);
  const material = doc
    .createMaterial('drukar')
    .setBaseColorFactor([0.72, 0.76, 0.85, 1])
    .setRoughnessFactor(0.55)
    .setMetallicFactor(0.05);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setMaterial(material);
  const gltfMesh = doc.createMesh('model').addPrimitive(prim);
  const node = doc.createNode('drukar-model').setMesh(gltfMesh);
  doc.createScene('scene').addChild(node);
  return io.writeBinary(doc);
}
