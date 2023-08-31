import { Engine } from "@babylonjs/core/Engines/engine"
import { Scene } from "@babylonjs/core/scene" 
import { Color4, Color3 } from "@babylonjs/core/Maths/math.color"
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { Light } from '@babylonjs/core/Lights/light'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { Axis } from "@babylonjs/core/Maths/math.axis"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial" 
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { PointLight } from "@babylonjs/core/Lights/pointLight"
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera"

export default class Viewer {

    scene: Scene | undefined  
    engine: Engine | null = null
    orbitCamera: ArcRotateCamera | null = null
    freeCamera: FreeCamera | null = null
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
    canvasHandlers = new Map<string, any>();
    worker: Worker;
       
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
            this.bindHandler('canvas', event, fn, opt)
        }

        this.offscreenCanvas.clientWidth = data.width;
        this.offscreenCanvas.clientHeight = data.height;
        this.offscreenCanvas.width = data.width;
        this.offscreenCanvas.height = data.height;

        this.rect.right = this.rect.width = data.width;
        this.rect.bottom = this.rect.height = data.height;


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

        //Free cam
        // this.freeCamera = new FreeCamera("FreeCamera", new Vector3(0, 0, -10), this.scene);
        // this.freeCamera.setTarget(new Vector3(0, 0, 50));
        // this.freeCamera.attachControl(this.offscreenCanvas, true);
        

        this.pointLight = new PointLight("pl", new Vector3(0,0,0) , this.scene)

        this.pointLight.radius = 200;
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
       

        this.engine.runRenderLoop(() => {
            // if(Date.now() - this.lastTimeStamp > 500){
            //     this.x = (Math.random() - 0.5) * 0.1
            //     this.y = (Math.random() - 0.5) * 0.1
            //     this.z = (Math.random() - 0.5) * 0.1
            //     this.lastTimeStamp = Date.now()
            // }
            // this.box.rotate(Axis.X,  this.x)
            // this.box.rotate(Axis.Y,  this.y)
            // this.box.rotate(Axis.Z,  this.z)

            this.scene?.render()            
        })

        
    }
    
    bindHandler(targetName, eventName, fn, opt) { 
        var id = `${targetName}${eventName}`
        this.canvasHandlers.set(id, fn);

        this.worker.postMessage({
		type: 'event',
		targetName: targetName,
		eventName: eventName,
		opt: opt,
	    })
    }

    handleEvent(eventType, event) { 
        const handlerId = `${event.targetName}${event.eventName}`;
        event.eventClone.preventDefault = this.noop;
        event.eventClone.target = this.offscreenCanvas;
        this.canvasHandlers.get(handlerId)(event.eventClone);
      
    }

    noop() { }

}