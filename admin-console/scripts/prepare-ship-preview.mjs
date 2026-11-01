import fs from 'node:fs'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
// Geometry and base material colors are already in the local model; skip external texture references.
T.TextureLoader.prototype.load = () => new T.Texture()
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(v => { this.result=v; this.onloadend?.() }) }
  readAsDataURL(blob) { blob.arrayBuffer().then(v=>{this.result='data:application/octet-stream;base64,'+Buffer.from(v).toString('base64');this.onloadend?.()}) }
}
const input=fs.readFileSync('../../k_ship/k_ship/Assets/Meshes/NEREUS_ContainerCarrier.fbx')
const source=new FBXLoader().parse(input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength),'')
source.updateMatrixWorld(true)
const bounds=new T.Box3().setFromObject(source), center=bounds.getCenter(new T.Vector3()), factor=160/bounds.getSize(new T.Vector3()).x
const result=new T.Group();result.name='ship_block_preview'
const ids=['B-04','B-03','B-01','B-02'];const cuts=[-80,-40,0,40,80]
const sections=ids.map(id=>{const g=new T.Group();g.name=id;g.userData.blockId=id;result.add(g);return g})
const materials=new Map()
function mat(src) { if(!materials.has(src.uuid)) materials.set(src.uuid,new T.MeshStandardMaterial({name:src.name,color:src.color?.clone()??new T.Color('#758690'),roughness:.7,metalness:/steel|bronze/.test(src.name)?.5:.12,side:T.DoubleSide}));return materials.get(src.uuid) }
function clip(poly,x,sign) { const out=[]; for(let i=0;i<poly.length;i++) {const a=poly[i],b=poly[(i+1)%poly.length], da=(a.p.x-x)*sign,db=(b.p.x-x)*sign; if(da>=-1e-6)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize()})}}return out }
source.traverse(mesh=>{
 if(!mesh.isMesh || mesh.name.startsWith('Identity') || mesh.name.startsWith('Cargo'))return
 const geo=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry
 const p=geo.attributes.position,n=geo.attributes.normal, nm=new T.Matrix3().getNormalMatrix(mesh.matrixWorld)
 const groups=geo.groups.length?geo.groups:[{start:0,count:p.count,materialIndex:0}]
 for(const gr of groups){const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material],material=mat(mats[gr.materialIndex]??mats[0]);const buckets=ids.map(()=>({p:[],n:[]}))
  for(let i=gr.start;i<gr.start+gr.count;i+=3){const triangle=[0,1,2].map(j=>({p:new T.Vector3().fromBufferAttribute(p,i+j).applyMatrix4(mesh.matrixWorld).sub(new T.Vector3(center.x,bounds.min.y,center.z)).multiplyScalar(factor),n:n?new T.Vector3().fromBufferAttribute(n,i+j).applyMatrix3(nm).normalize():new T.Vector3(0,1,0)}))
   for(let s=0;s<4;s++){if(triangle.every(v=>v.p.x<cuts[s]-1e-5)||triangle.every(v=>v.p.x>cuts[s+1]+1e-5))continue;const poly=clip(clip(triangle,cuts[s],1),cuts[s+1],-1);for(let k=1;k<poly.length-1;k++)for(const v of [poly[0],poly[k],poly[k+1]]){buckets[s].p.push(v.p.x,v.p.y,v.p.z);buckets[s].n.push(v.n.x,v.n.y,v.n.z)}}
  }
  buckets.forEach((b,s)=>{if(!b.p.length)return;const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));const m=new T.Mesh(g,material);m.name=mesh.name;m.userData.blockId=ids[s];m.userData.cargo=mesh.name.startsWith('Cargo');sections[s].add(m)})
 }
})
for(const section of sections){
 const grouped=new Map()
 for(const mesh of section.children){const key=mesh.material.uuid+':'+!!mesh.userData.cargo;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(mesh)}
 section.clear()
 for(const list of grouped.values()){const combined=mergeGeometries(list.map(m=>m.geometry));const m=new T.Mesh(combined,list[0].material);m.name=list[0].userData.cargo?'Cargo':'Ship';m.userData={...list[0].userData};section.add(m);for(const item of list)item.geometry.dispose()}
}
const glb=await new GLTFExporter().parseAsync(result,{binary:true})
fs.writeFileSync('public/models/ship-blocks.glb',Buffer.from(glb))
console.log(JSON.stringify({bytes:glb.byteLength,blocks:sections.map(g=>({id:g.name,meshes:g.children.length})),size:new T.Box3().setFromObject(result).getSize(new T.Vector3())}))
