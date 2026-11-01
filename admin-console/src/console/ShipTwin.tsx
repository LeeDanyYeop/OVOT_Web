import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import './shipTwin.css'

const ids = ['B-04','B-03','B-01','B-02']
type Runtime = { sections: THREE.Object3D[]; controls: OrbitControls; camera: THREE.OrthographicCamera; exploded: boolean; selected: string | null }

export function ShipTwin({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const runtime = useRef<Runtime | null>(null)
  const callback = useRef(onSelect)
  const [loaded,setLoaded] = useState(false)
  const [error,setError] = useState('')
  const [exploded,setExploded] = useState(false)
  useEffect(()=>{callback.current=onSelect},[onSelect])
  useEffect(()=>{if(runtime.current)runtime.current.selected=selected},[selected])
  useEffect(()=>{if(runtime.current)runtime.current.exploded=exploded},[exploded])

  useEffect(()=>{
    const el=host.current
    if(!el)return
    let renderer:THREE.WebGLRenderer
    try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:false}) }
    catch { setError('이 브라우저에서 3D 화면을 시작하지 못했습니다. WebGL을 지원하는 브라우저에서 열어주세요.');return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
    renderer.setClearColor('#dce6ee')
    renderer.shadowMap.enabled=true
    renderer.shadowMap.type=THREE.PCFSoftShadowMap
    renderer.toneMapping=THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure=1.25
    el.appendChild(renderer.domElement)
    renderer.domElement.setAttribute('aria-label','회전·확대할 수 있는 선박 3D 모델. 블록을 누르면 상세 내용을 표시합니다.')
    const scene=new THREE.Scene()
    const camera=new THREE.OrthographicCamera(-110,110,90,-90,.1,1500)
    camera.position.set(150,110,190)
    const controls=new OrbitControls(camera,renderer.domElement)
    controls.target.set(0,10,0)
    controls.enableDamping=true;controls.dampingFactor=.09
    controls.minZoom=.65;controls.maxZoom=4
    controls.maxPolarAngle=Math.PI*.48
    controls.minPolarAngle=.08
    controls.update()
    scene.add(new THREE.HemisphereLight('#d9edff','#243548',2.8))
    const light=new THREE.DirectionalLight('#edf7ff',3.7)
    light.position.set(-60,145,75);light.castShadow=true
    light.shadow.mapSize.set(2048,2048)
    Object.assign(light.shadow.camera,{left:-150,right:150,top:110,bottom:-110,near:1,far:450})
    light.shadow.camera.updateProjectionMatrix()
    light.shadow.bias=-.0004;light.shadow.normalBias=.15
    scene.add(light)
    const fill=new THREE.DirectionalLight('#57bfcf',1.8);fill.position.set(60,40,-110);scene.add(fill)
    const sceneMeshes:THREE.Mesh[]=[]
    function box(x:number,y:number,z:number,w:number,h:number,d:number,color:string){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.92}));m.position.set(x,y,z);m.receiveShadow=true;scene.add(m);sceneMeshes.push(m);return m}
    box(0,-5,0,212,3,49,'#8eabbc')
    box(0,-3,23,212,3,5,'#b2c6d2');box(0,-3,-23,212,3,5,'#b2c6d2')
    for(let x=-72;x<80;x+=12)box(x,-1.5,0,3,3,7,'#627e90')
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshStandardMaterial({color:'#dce6ee',roughness:1}))
    floor.rotation.x=-Math.PI/2;floor.position.y=-7;floor.receiveShadow=true;scene.add(floor);sceneMeshes.push(floor)
    const grid=new THREE.GridHelper(800,80,0xa4bccd,0xbdcedb)
    grid.position.y=-6.95
    const gridMaterial=grid.material as THREE.LineBasicMaterial
    gridMaterial.transparent=true;gridMaterial.opacity=.36
    scene.add(grid)
    for(const z of [-20,20]){
      const strip=new THREE.Mesh(new THREE.BoxGeometry(208,.08,.12),new THREE.MeshBasicMaterial({color:'#43adc0',transparent:true,opacity:.55}))
      strip.position.set(0,-1.42,z);scene.add(strip)
    }
    const rt:Runtime={sections:[],controls,camera,exploded:false,selected}
    runtime.current=rt
    let disposed=false,model:THREE.Object3D|undefined,frame=0
    const shipMeshes:THREE.Mesh[]=[]
    const ownMaterials:THREE.MeshStandardMaterial[]=[]
    const loader=new GLTFLoader()
    loader.load(`${import.meta.env.BASE_URL}models/ship-blocks.glb`,gltf=>{
      if(disposed){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){o.geometry.dispose();const a=Array.isArray(o.material)?o.material:[o.material];a.forEach(m=>m.dispose())}});return}
      model=gltf.scene;scene.add(model)
      for(const id of ids){const group=model.getObjectByName(id);if(group)rt.sections.push(group)}
      model.traverse(o=>{if(o instanceof THREE.Mesh){if(o.userData.cargo){o.visible=false;return}o.castShadow=true;o.receiveShadow=true;const base=o.material as THREE.MeshStandardMaterial;const material=base.clone();material.color.lerp(new THREE.Color('#b5c5d2'),.13);material.emissive.set('#39b9d1');material.emissiveIntensity=0;o.material=material;ownMaterials.push(material);shipMeshes.push(o);
        if(!o.userData.cargo){
          const outline=new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry,35),new THREE.LineBasicMaterial({color:'#77e7f6',transparent:true,opacity:.38,depthWrite:false}))
          outline.name='selection-outline';outline.visible=false;o.add(outline)
        }}})
      el.dataset.meshes=String(shipMeshes.length)
      el.dataset.model='ship-blocks'
      setLoaded(true)
    },undefined,()=>{if(!disposed)setError('선박 모델을 불러오지 못했습니다. 미리보기 서버 연결을 확인해주세요.')})
    const resize=()=>{const {width,height}=el.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);const half=100;camera.left=-half;camera.right=half;camera.top=half*height/width;camera.bottom=-camera.top;camera.updateProjectionMatrix()}
    const observer=new ResizeObserver(resize);observer.observe(el);resize()
    const pointer=new THREE.Vector2(),ray=new THREE.Raycaster()
    let start={x:0,y:0}, hover:string|null=null, pointerDown=false
    function hitBlock(e:PointerEvent):string|null {
      const rect=el!.getBoundingClientRect()
      pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1)
      ray.setFromCamera(pointer,camera)
      const hit=ray.intersectObjects(shipMeshes.filter(m=>m.visible),false)[0]
      if(!hit)return null
      let object:THREE.Object3D|null=hit.object
      while(object&&!ids.includes(object.name))object=object.parent
      return object?.name??null
    }
    const down=(e:PointerEvent)=>{start={x:e.clientX,y:e.clientY};pointerDown=true}
    const up=(e:PointerEvent)=>{
      pointerDown=false
      if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return
      const id=hitBlock(e)
      if(id){el!.dataset.lastPick=id;callback.current(id)}
    }
    const move=(e:PointerEvent)=>{
      if(pointerDown){renderer.domElement.style.cursor='grabbing';return}
      const id=hitBlock(e)
      renderer.domElement.style.cursor=id?'pointer':'grab'
      if(id!==hover)hover=id
    }
    const leave=()=>{hover=null;pointerDown=false}
    renderer.domElement.addEventListener('pointerdown',down)
    renderer.domElement.addEventListener('pointerup',up)
    renderer.domElement.addEventListener('pointermove',move)
    renderer.domElement.addEventListener('pointerleave',leave)
    const draw=()=>{
      frame=requestAnimationFrame(draw)
      controls.update()
      rt.sections.forEach((g,i)=>{
        const target=rt.exploded?(i-1.5)*15:(i-1.5)*.65
        g.position.x=THREE.MathUtils.lerp(g.position.x,target,.12)
        g.traverse(o=>{if(o instanceof THREE.Mesh){o.visible=!o.userData.cargo;const mat=o.material as THREE.MeshStandardMaterial;mat.emissiveIntensity=g.name===rt.selected ? .32 : g.name===hover ? .13 : 0;for(const child of o.children)if(child.name==='selection-outline')child.visible=g.name===rt.selected||g.name===hover}})

      })
      renderer.render(scene,camera)
    }
    draw()
    return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerleave',leave);scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){o.geometry.dispose();const a=Array.isArray(o.material)?o.material:[o.material];a.forEach(m=>m.dispose())}});renderer.dispose();renderer.domElement.remove();runtime.current=null}
  },[])

  function resetView(){
    const rt=runtime.current
    if(!rt)return
    rt.controls.target.set(0,10,0)
    rt.camera.position.set(150,110,190)
    rt.camera.zoom=1
    rt.camera.updateProjectionMatrix()
    rt.controls.update()
  }
  return <div className="st-viewer">
    <div className="st-stage" ref={host} data-ready={loaded}>
      {!loaded&&!error&&<div className="st-loading" role="status">선박 3D 모델을 불러오는 중…</div>}
      {error&&<div className="st-loading" role="alert">{error}</div>}
    </div>
    <div className="st-bottom"><div><button aria-pressed={exploded} onClick={()=>setExploded(v=>!v)}>{exploded?'블록 합치기':'블록 분리 보기'}</button><button onClick={resetView}>시점 초기화</button></div></div>
  </div>
}
