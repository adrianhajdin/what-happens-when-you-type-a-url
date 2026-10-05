/**
 * The Tripo export is a whole diorama of design/s3.png (towers, tube, keys,
 * padlock). Keep only the padlock's triangles, prune what's left, then run
 * the usual compression. Bounds measured from a vertex-density plot of the
 * raw model (front view, raw model units).
 *
 *   node scripts/extract-padlock.mjs raw-models/padlock.glb raw-models/padlock-only.glb
 *   npx gltf-transform optimize raw-models/padlock-only.glb public/models/padlock.min.glb \
 *     --compress meshopt --texture-compress webp --texture-size 1024 --simplify true --simplify-ratio 0.25 --simplify-error 0.002
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup } from "@gltf-transform/functions";

const BOUNDS = { minX: -0.045, maxX: 0.105, minY: 0.262 };

const [, , input, output] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);

for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    const idx = prim.getIndices();
    const n = idx ? idx.getCount() : pos.getCount();
    const v = [0, 0, 0];
    const inside = new Uint8Array(pos.getCount());
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v);
      inside[i] = v[0] > BOUNDS.minX && v[0] < BOUNDS.maxX && v[1] > BOUNDS.minY ? 1 : 0;
    }
    const kept = [];
    for (let t = 0; t < n; t += 3) {
      const a = idx ? idx.getScalar(t) : t;
      const b = idx ? idx.getScalar(t + 1) : t + 1;
      const c = idx ? idx.getScalar(t + 2) : t + 2;
      if (inside[a] && inside[b] && inside[c]) kept.push(a, b, c);
    }
    const accessor = doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(kept)).setBuffer(pos.getBuffer());
    prim.setIndices(accessor);
    console.log(`kept ${kept.length / 3} of ${n / 3} triangles`);
  }
}
// rendered unlit (the neon is baked into the base colour): normal + metallic-roughness maps are dead weight
for (const mat of doc.getRoot().listMaterials()) {
  mat.setNormalTexture(null);
  mat.setMetallicRoughnessTexture(null);
}
// drop the now-unreferenced vertices
const { compactPrimitive } = await import("@gltf-transform/functions");
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) compactPrimitive(prim);
await doc.transform(dedup(), prune());
await io.write(output, doc);
