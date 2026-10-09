/**
 * Rebuild york-chiller/public/models/ymc2.glb from the original float mesh.
 *
 *   npm install --prefix york-chiller/scripts
 *   node york-chiller/scripts/build-ymc2-lod.mjs <original.glb> <out.glb>
 *
 * The original is the uncompressed Meshy mesh (about 119,514 triangles), not the
 * quantized file this script writes. meshoptimizer 1.3.0, @gltf-transform 4.5.1, sharp.
 *
 * Weld rule: merge a vertex only when position, normal, and UV are the same bits.
 * A position-only weld drops the second UV and streaks the control box.
 *
 * The near mesh is a border-locked simplify of the original indices. It stops
 * near 51,080 triangles because real UV seams stay split.
 *
 * The far mesh uses the same weld, then a border-locked simplify aimed at 27,000
 * triangles. Painted vertices (nameplate, OptiView, JCI, panel) are locked so
 * they cannot move. Vertices on a seam whose two sides sample different colors
 * are seam-locked. Permissive collapses are allowed only on the remaining flat
 * shell. PreserveFolds keeps the top edge. Attributes are copied from the
 * surviving source vertices. simplifyWithUpdate is not used.
 */
import { NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { compactPrimitive, meshopt } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import { statSync } from 'node:fs'

const srcPath = process.argv[2]
const outPath = process.argv[3]
if (!srcPath || !outPath) {
  console.error('usage: node build-ymc2-lod.mjs <original.glb> <out.glb>')
  process.exit(1)
}

await MeshoptEncoder.ready
await MeshoptSimplifier.ready

const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

const doc = await io.read(srcPath)
const srcMesh = doc.getRoot().listMeshes()[0]
const srcPrim = srcMesh.listPrimitives()[0]
const pos = srcPrim.getAttribute('POSITION').getArray()
const nrm = srcPrim.getAttribute('NORMAL').getArray()
const uv = srcPrim.getAttribute('TEXCOORD_0').getArray()
const srcIdx = Uint32Array.from(srcPrim.getIndices().getArray())
const vertCount = pos.length / 3
const scene = doc.getRoot().listScenes()[0]

function fbits(value) {
  return new Uint32Array(new Float32Array([value]).buffer)[0] >>> 0
}

function weldAttributes() {
  const groups = new Map()
  const remap = new Uint32Array(vertCount)
  let unique = 0
  for (let i = 0; i < vertCount; i++) {
    const key = [
      fbits(pos[i * 3]), fbits(pos[i * 3 + 1]), fbits(pos[i * 3 + 2]),
      fbits(nrm[i * 3]), fbits(nrm[i * 3 + 1]), fbits(nrm[i * 3 + 2]),
      fbits(uv[i * 2]), fbits(uv[i * 2 + 1]),
    ].join(',')
    let rep = groups.get(key)
    if (rep === undefined) {
      groups.set(key, i)
      rep = i
      unique++
    }
    remap[i] = rep
  }
  const indices = new Uint32Array(srcIdx.length)
  for (let i = 0; i < srcIdx.length; i++) indices[i] = remap[srcIdx[i]]
  console.log('weld pos+normal+uv', unique, 'merged', vertCount - unique)
  return { indices, remap }
}

function addNear(indices) {
  const [out, err] = MeshoptSimplifier.simplify(indices, pos, 3, 40000 * 3, 1, ['LockBorder'])
  const prim = doc.createPrimitive().setMaterial(srcPrim.getMaterial()).setMode(srcPrim.getMode())
  for (const semantic of srcPrim.listSemantics()) prim.setAttribute(semantic, srcPrim.getAttribute(semantic))
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(out))
  compactPrimitive(prim)
  const mesh = doc.createMesh('lod-near').addPrimitive(prim)
  scene.addChild(doc.createNode('lod-near').setMesh(mesh))
  const tris = prim.getIndices().getCount() / 3
  console.log('lod-near', tris, 'err', err.toFixed(5))
  return tris
}

function sampleColor(pixels, width, height, u, v) {
  const x = Math.min(width - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * (width - 1))))
  const y = Math.min(height - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * (height - 1))))
  const i = (y * width + x) * 4
  return [pixels[i], pixels[i + 1], pixels[i + 2]]
}

function isShell(rgb) {
  const [r, g, b] = rgb
  return r < 90 && g > 110 && b > 110 && Math.abs(g - b) < 40
}

function colorGap(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
}

function buildLocks(remap) {
  const tex = doc.getRoot().listTextures().find((item) => item.getName() === 'Image_0')
  return sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }).then(({ data, info }) => {
    const color = new Array(vertCount)
    const painted = new Uint8Array(vertCount)
    for (let i = 0; i < vertCount; i++) {
      const rgb = sampleColor(data, info.width, info.height, uv[i * 2], uv[i * 2 + 1])
      color[i] = rgb
      if (!isShell(rgb)) painted[i] = 1
    }
    const groups = new Map()
    for (let i = 0; i < vertCount; i++) {
      const key = `${Math.round(pos[i * 3] * 1e4)}:${Math.round(pos[i * 3 + 1] * 1e4)}:${Math.round(pos[i * 3 + 2] * 1e4)}`
      let list = groups.get(key)
      if (!list) {
        list = []
        groups.set(key, list)
      }
      list.push(i)
    }
    const lock = new Uint8Array(vertCount)
    let paintedCount = 0
    let seamCount = 0
    for (const list of groups.values()) {
      let hasPaint = false
      for (const i of list) if (painted[i]) hasPaint = true
      let gap = 0
      const base = color[list[0]]
      for (let k = 1; k < list.length; k++) gap = Math.max(gap, colorGap(base, color[list[k]]))
      for (const i of list) {
        const slot = remap[i]
        if (hasPaint) {
          lock[slot] = 1
          paintedCount++
        } else if (gap > 18 && lock[slot] === 0) {
          lock[slot] = 2
          seamCount++
        }
      }
    }
    console.log('locked painted', paintedCount, 'seam', seamCount)
    return lock
  })
}

function packFar(out) {
  const compactIdx = Uint32Array.from(out)
  const [, unique] = MeshoptSimplifier.compactMesh(compactIdx)
  const srcOf = new Uint32Array(unique)
  for (let i = 0; i < out.length; i++) srcOf[compactIdx[i]] = out[i]
  const outPos = new Float32Array(unique * 3)
  const outNrm = new Float32Array(unique * 3)
  const outUv = new Float32Array(unique * 2)
  let uMin = Infinity
  let uMax = -Infinity
  let vMin = Infinity
  let vMax = -Infinity
  for (let i = 0; i < unique; i++) {
    const s = srcOf[i]
    outPos[i * 3] = pos[s * 3]
    outPos[i * 3 + 1] = pos[s * 3 + 1]
    outPos[i * 3 + 2] = pos[s * 3 + 2]
    outNrm[i * 3] = nrm[s * 3]
    outNrm[i * 3 + 1] = nrm[s * 3 + 1]
    outNrm[i * 3 + 2] = nrm[s * 3 + 2]
    const u = uv[s * 2]
    const v = uv[s * 2 + 1]
    outUv[i * 2] = u
    outUv[i * 2 + 1] = v
    if (u < uMin) uMin = u
    if (u > uMax) uMax = u
    if (v < vMin) vMin = v
    if (v > vMax) vMax = v
  }
  console.log('far uv', uMin.toFixed(4), uMax.toFixed(4), vMin.toFixed(4), vMax.toFixed(4), 'verts', unique)
  const prim = doc.createPrimitive().setMaterial(srcPrim.getMaterial()).setMode(srcPrim.getMode())
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(outPos))
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(outNrm))
  prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(outUv))
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(compactIdx))
  const mesh = doc.createMesh('lod-far').addPrimitive(prim)
  scene.addChild(doc.createNode('lod-far').setMesh(mesh))
  return compactIdx.length / 3
}

const { indices, remap } = weldAttributes()
const near = addNear(srcIdx)
const lock = await buildLocks(remap)
const [farIdx, farErr] = MeshoptSimplifier.simplifyWithAttributes(
  indices,
  pos,
  3,
  new Float32Array(),
  0,
  [],
  lock,
  27000 * 3,
  0.05,
  ['LockBorder', 'Permissive', 'PreserveFolds'],
)
const far = packFar(farIdx)
console.log('lod-far', far, 'err', farErr.toFixed(5))
console.log('full', srcIdx.length / 3, 'near', near, 'far', far)

for (const tex of doc.getRoot().listTextures()) {
  const name = tex.getName() || ''
  if (name === 'Image_0') {
    console.log('keep', name, tex.getImage().byteLength)
    continue
  }
  const image = Buffer.from(tex.getImage())
  const isNormal = name === 'normal'
  const out = isNormal
    ? await sharp(image).resize(1024, 1024, { fit: 'fill' }).png({ compressionLevel: 9 }).toBuffer()
    : await sharp(image).resize(1024, 1024, { fit: 'fill' }).jpeg({ quality: 90 }).toBuffer()
  tex.setImage(out)
  tex.setMimeType(isNormal ? 'image/png' : 'image/jpeg')
  console.log('resize', name, image.byteLength, '->', out.byteLength)
}

await doc.transform(meshopt({
  encoder: MeshoptEncoder,
  level: 'high',
  quantizePosition: 16,
  quantizeNormal: 12,
  quantizeTexcoord: 14,
}))

await io.write(outPath, doc)
console.log('wrote', statSync(outPath).size)
