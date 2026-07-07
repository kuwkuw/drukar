import type { RawMesh } from './raw.js';
import { triCount } from './raw.js';

export interface EdgeTopology {
  /** Undirected edges referenced by exactly one triangle. */
  boundaryEdgeCount: number;
  /** Undirected edges referenced by three or more triangles. */
  nonManifoldEdgeCount: number;
  /** Closed loops of boundary vertices, following the half-edge direction. */
  boundaryLoops: number[][];
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/** Count how many triangles share each undirected edge, find boundary loops. */
export function analyzeEdges(mesh: RawMesh): EdgeTopology {
  const undirected = new Map<string, number>();
  const directed = new Set<string>();
  const tris = triCount(mesh);
  for (let t = 0; t < tris; t++) {
    for (let e = 0; e < 3; e++) {
      const a = mesh.indices[t * 3 + e]!;
      const b = mesh.indices[t * 3 + ((e + 1) % 3)]!;
      undirected.set(edgeKey(a, b), (undirected.get(edgeKey(a, b)) ?? 0) + 1);
      directed.add(`${a}_${b}`);
    }
  }

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  for (const count of undirected.values()) {
    if (count === 1) boundaryEdgeCount++;
    else if (count > 2) nonManifoldEdgeCount++;
  }

  // Boundary half-edges: directed edges whose reverse never occurs. In a
  // consistently wound mesh they chain head-to-tail around each hole.
  const nextFrom = new Map<number, number>();
  for (let t = 0; t < tris; t++) {
    for (let e = 0; e < 3; e++) {
      const a = mesh.indices[t * 3 + e]!;
      const b = mesh.indices[t * 3 + ((e + 1) % 3)]!;
      if (!directed.has(`${b}_${a}`) && undirected.get(edgeKey(a, b)) === 1) {
        nextFrom.set(a, b);
      }
    }
  }

  const boundaryLoops: number[][] = [];
  const visited = new Set<number>();
  for (const start of nextFrom.keys()) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let v: number | undefined = start;
    while (v !== undefined && !visited.has(v)) {
      visited.add(v);
      loop.push(v);
      v = nextFrom.get(v);
    }
    // Only report proper cycles back to the start; broken chains (non-manifold
    // boundary junctions) are not fillable loops.
    if (v === start && loop.length >= 3) boundaryLoops.push(loop);
  }

  return { boundaryEdgeCount, nonManifoldEdgeCount, boundaryLoops };
}

/**
 * Remove "fins": triangles with two or more boundary edges hanging off the
 * surface. Iterates because removing a flap can expose another.
 */
export function dropDanglingFaces(mesh: RawMesh, maxIterations = 3): RawMesh {
  let current = mesh;
  for (let iter = 0; iter < maxIterations; iter++) {
    const undirected = new Map<string, number>();
    const tris = triCount(current);
    for (let t = 0; t < tris; t++) {
      for (let e = 0; e < 3; e++) {
        const a = current.indices[t * 3 + e]!;
        const b = current.indices[t * 3 + ((e + 1) % 3)]!;
        undirected.set(edgeKey(a, b), (undirected.get(edgeKey(a, b)) ?? 0) + 1);
      }
    }
    const kept: number[] = [];
    for (let t = 0; t < tris; t++) {
      let boundary = 0;
      for (let e = 0; e < 3; e++) {
        const a = current.indices[t * 3 + e]!;
        const b = current.indices[t * 3 + ((e + 1) % 3)]!;
        if (undirected.get(edgeKey(a, b)) === 1) boundary++;
      }
      if (boundary < 2) {
        kept.push(
          current.indices[t * 3]!,
          current.indices[t * 3 + 1]!,
          current.indices[t * 3 + 2]!,
        );
      }
    }
    if (kept.length === current.indices.length) return current;
    current = { positions: current.positions, indices: new Uint32Array(kept) };
  }
  return current;
}

export interface OrientResult {
  mesh: RawMesh;
  flippedFaces: number;
  /** False when a Möbius-like conflict was found — mesh is non-orientable. */
  orientable: boolean;
}

/**
 * Make triangle winding consistent across connected components by BFS over
 * face adjacency: two neighbours are consistent when they traverse their
 * shared edge in opposite directions.
 */
export function orientConsistently(mesh: RawMesh): OrientResult {
  const tris = triCount(mesh);
  const facesByEdge = new Map<string, number[]>();
  for (let t = 0; t < tris; t++) {
    for (let e = 0; e < 3; e++) {
      const a = mesh.indices[t * 3 + e]!;
      const b = mesh.indices[t * 3 + ((e + 1) % 3)]!;
      const key = edgeKey(a, b);
      const list = facesByEdge.get(key);
      if (list) list.push(t);
      else facesByEdge.set(key, [t]);
    }
  }

  const flipped = new Uint8Array(tris); // 1 = flip this face in the output
  const state = new Int8Array(tris); // 0 unvisited, 1 visited
  let flippedFaces = 0;
  let orientable = true;

  const directedEdge = (t: number, e: number): [number, number] => {
    const a = mesh.indices[t * 3 + e]!;
    const b = mesh.indices[t * 3 + ((e + 1) % 3)]!;
    return flipped[t] ? [b, a] : [a, b];
  };

  for (let seed = 0; seed < tris; seed++) {
    if (state[seed]) continue;
    state[seed] = 1;
    const queue = [seed];
    while (queue.length > 0) {
      const t = queue.pop()!;
      for (let e = 0; e < 3; e++) {
        const [a, b] = directedEdge(t, e);
        const neighbours = facesByEdge.get(edgeKey(a, b));
        if (!neighbours || neighbours.length !== 2) continue; // boundary or non-manifold
        const other = neighbours[0] === t ? neighbours[1]! : neighbours[0]!;
        // Find how the neighbour traverses this edge.
        let otherDir: [number, number] | null = null;
        for (let oe = 0; oe < 3; oe++) {
          const d = directedEdge(other, oe);
          if (edgeKey(d[0], d[1]) === edgeKey(a, b)) {
            otherDir = d;
            break;
          }
        }
        if (!otherDir) continue;
        const consistent = otherDir[0] === b && otherDir[1] === a;
        if (state[other]) {
          if (!consistent) orientable = false;
          continue;
        }
        if (!consistent) {
          flipped[other] = flipped[other] ? 0 : 1;
          flippedFaces++;
        }
        state[other] = 1;
        queue.push(other);
      }
    }
  }

  if (flippedFaces === 0) return { mesh, flippedFaces, orientable };
  const indices = new Uint32Array(mesh.indices.length);
  for (let t = 0; t < tris; t++) {
    if (flipped[t]) {
      indices[t * 3] = mesh.indices[t * 3]!;
      indices[t * 3 + 1] = mesh.indices[t * 3 + 2]!;
      indices[t * 3 + 2] = mesh.indices[t * 3 + 1]!;
    } else {
      indices[t * 3] = mesh.indices[t * 3]!;
      indices[t * 3 + 1] = mesh.indices[t * 3 + 1]!;
      indices[t * 3 + 2] = mesh.indices[t * 3 + 2]!;
    }
  }
  return { mesh: { positions: mesh.positions, indices }, flippedFaces, orientable };
}

/**
 * Fan-triangulate boundary loops up to `maxLoopVerts`. The fill triangles
 * are wound to pair with the existing boundary half-edges.
 * Returns the number of holes filled.
 */
export function fillHoles(
  mesh: RawMesh,
  maxLoopVerts: number,
): { mesh: RawMesh; filled: number; skipped: number } {
  const { boundaryLoops } = analyzeEdges(mesh);
  if (boundaryLoops.length === 0) return { mesh, filled: 0, skipped: 0 };
  const extra: number[] = [];
  let filled = 0;
  let skipped = 0;
  for (const loop of boundaryLoops) {
    if (loop.length > maxLoopVerts) {
      skipped++;
      continue;
    }
    // Boundary half-edges run v0→v1→…→vn→v0; new faces must contain the
    // reversed edges, so each fan triangle is (v0, v[i+1], v[i]).
    for (let i = 1; i < loop.length - 1; i++) {
      extra.push(loop[0]!, loop[i + 1]!, loop[i]!);
    }
    filled++;
  }
  if (extra.length === 0) return { mesh, filled, skipped };
  const indices = new Uint32Array(mesh.indices.length + extra.length);
  indices.set(mesh.indices);
  indices.set(extra, mesh.indices.length);
  return { mesh: { positions: mesh.positions, indices }, filled, skipped };
}
