import { Engine } from "@babylonjs/core/Engines/engine"
import { Scene } from "@babylonjs/core/scene" 
import { Color4, Color3 } from "@babylonjs/core/Maths/math.color"
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { Light } from '@babylonjs/core/Lights/light'
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { Axis } from "@babylonjs/core/Maths/math.axis"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial" 
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { PointLight } from "@babylonjs/core/Lights/pointLight"
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera"
import { FlyCamera } from "@babylonjs/core/Cameras/flyCamera"
import { Ray } from "@babylonjs/core/Culling/ray"


export default class Viewer {

    scene: Scene | undefined  
    engine: Engine | null = null
    orbitCamera: ArcRotateCamera | null = null
    flyCamera: FlyCamera | null = null
    offscreenCanvas: OffscreenCanvas    
    box : Mesh
    boxRotation: number
    light: Light
    pointLight: PointLight
    lastTimeStamp: number
    x: number = 1
    y: number = 1
    z: number = 1
    pause: boolean = false
    registeredEventHandlers = new Map<string, any>(); //These are event handlers we want to bind to. Currently Canvas, Window, Document that we fake in the worker.
    worker: Worker;
    raySideEffect: Ray = new Ray(new Vector3(0,0,0), new Vector3(0,0,0), 0)
       
    // getBoundingInfo()
     rect = {
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        height: 0,
        width: 0,
    };

    constructor(data : any, worker: Worker) {
        this.offscreenCanvas = data.offscreencanvas;

        this.offscreenCanvas.addEventListener = (event, fn, opt) => {
            this.bindHandler('canvas', event, fn, opt) //we do this to capture eventtargets
        }

        this.setSizes(data.width, data.height)

        this.offscreenCanvas.getBoundingClientRect = () => {
            return this.rect;
        };  
        
    	this.offscreenCanvas.focus = () => {
            this.worker.postMessage({
                type: 'canvasMethod',
                method: 'focus',
                args: [],
            })
        };
        
        this.worker = worker;
    }
    
    setSizes(width, height) {
        this.offscreenCanvas.clientWidth = width;
        this.offscreenCanvas.clientHeight = height;
        this.offscreenCanvas.width = width;
        this.offscreenCanvas.height = height;

        this.rect.right = this.rect.width = width;
        this.rect.bottom = this.rect.height = height;
        if (this.engine) {
            this.engine.resize();
        }
    }

    async initEngine(useWebGPU = true) {
        if (useWebGPU === undefined) useWebGPU = false;
        console.info(`G-Code Viewer- Sindarius - 1 `);

        //this will use the offscreen rendering and web worker threads
        this.engine = new Engine(this.offscreenCanvas, true, { 
            doNotHandleContextLost: true,
        });  //WebGPU does not currently have a constructor that takes offscreen canvas

        this.scene = new Scene(this.engine);
        this.scene.clearColor = new Color4(0,0,0,1)
        this.scene.doNotHandleCursors = true;

        //Orbit Cam
        this.orbitCamera = new ArcRotateCamera('Camera', Math.PI / 2, 2.356194, 15, new Vector3(0, 0, 0), this.scene);
        this.orbitCamera.invertRotation = false;
        this.orbitCamera.attachControl(this.offscreenCanvas, true);
        this.orbitCamera.maxZ = 100000;
        this.orbitCamera.lowerRadiusLimit = 5;
        this.orbitCamera.setPosition(new Vector3(0,0,0))
        this.orbitCamera.setTarget(new Vector3(0,0,50))

        //Fly cam
        // this.flyCamera = new FlyCamera("FreeCamera", new Vector3(0, 0, -10), this.scene);
        // this.flyCamera.setTarget(new Vector3(0, 0, 50));
        // this.flyCamera.attachControl(this.offscreenCanvas, false);
        

        this.pointLight = new PointLight("pl", new Vector3(0,0,0) , this.scene)

        this.pointLight.radius = 50;
        this.pointLight.diffuse = new Color3(1, 1, 1);
        this.pointLight.specular = new Color3(1, 1, 1);
  

        this.box = CreateBox("Box", {width:10, height:10, depth:10}, this.scene)        
        this.box.position = new Vector3(0,0,50)
        let material = new StandardMaterial("SM", this.scene);
        material.diffuseColor = new Color3(0.5,0.5,0.5);
        material.emissiveColor = new Color3(1,0,0)
        this.box.material = material;

        

        this.scene.render();
        this.lastTimeStamp = Date.now();
       
        this.scene.onPointerDown = () => { 
            var ray = this.scene?.createPickingRay(this.scene.pointerX, this.scene.pointerY,
                Matrix.Identity(), this.orbitCamera);
            
            var hit = this.scene?.pickWithRay(ray);
            if (hit?.pickedMesh) {
                console.info(hit.pickedMesh.name)
            }
        }

        this.engine.runRenderLoop(() => {
            if(Date.now() - this.lastTimeStamp > 200){
                this.x = (Math.random() - 0.5) * 0.1
                this.y = (Math.random() - 0.5) * 0.1
                this.z = (Math.random() - 0.5) * 0.1
                this.lastTimeStamp = Date.now()
            }
            // this.box.rotate(Axis.X,  this.x)
            // this.box.rotate(Axis.Y,  this.y)
            // this.box.rotate(Axis.Z,  this.z)
            this.pointLight.position = this.orbitCamera?.position ?? new Vector3(0,0,0)

            this.scene?.render()            
        })
    }

    //Send message to the main thread for events we want to bind to.
    bindHandler(targetName, eventName, fn, opt) { 
        var id = `${targetName}${eventName}`
        this.registeredEventHandlers.set(id, fn);

        this.worker.postMessage({
            type: 'event',
            targetName: targetName,
            eventName: eventName,
            opt: opt,
	    })
    }

    //We get back events from the main thread and need to handle them here to trigger babylonjs events.
    handleEvent(eventType, event) { 
        const handlerId = `${event.targetName}${event.eventName}`;
        event.eventClone.preventDefault = this.noop;
        event.eventClone.target = this.offscreenCanvas;
        this.registeredEventHandlers.get(handlerId)(event.eventClone);
    }

    noop() { }

}