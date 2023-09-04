import { Scene } from '@babylonjs/core/scene'
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial'
import { Effect } from '@babylonjs/core/Materials/effect'
import { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer'
import { ShaderMaterial } from '@babylonjs/core'

export default class ModelMaterial {
   material: CustomMaterial
   showPick: boolean = false
   toolBuffer: UniformBuffer

   constructor(public scene: Scene) {
      this.buildMaterial()
   }

   buildMaterial() {
      this.material = new CustomMaterial('processor_mat', this.scene)
      //this.material.alpha = 0.9

      this.material.AddAttribute('filePosition')
      this.material.AddAttribute('pickColor')
      this.material.AddAttribute('tool')

      this.material.AddUniform('currentPosition', 'float', 0)
      this.material.AddUniform('showPickColor', 'bool', false)
      this.material.AddUniform('renderMode', 'int', 0)

      this.material.Vertex_Definitions(`
      attribute float filePosition;
      attribute vec3 pickColor;
      attribute float tool;

      varying float fShow;
      varying vec3 vPickColor;
      varying float fTool;
      
      `)
      this.material.Vertex_MainBegin(`
      fShow = currentPosition - filePosition;
      vPickColor = pickColor;
      fTool = tool;
      `)
      this.material.Fragment_Definitions(`
      varying float fShow;
      varying vec3 vPickColor;
      `)
      this.material.Fragment_Custom_Alpha(`
         vPickColor = pickColor;
         if(fShow < 0.0f) {
            discard;
         }
      `)
      this.material.Fragment_Before_FragColor(`

         if(showPickColor)
         {
            color.rgb = vPickColor;
         }
         else
         switch(renderMode)
         {
            //default
            case 0: 
                  if (fShow > 0.0f && fShow < 5000.0f) 
                  { 
                     color.rgb *= mix(vec3(0,1,0), color.rgb, fShow / 5000.0f);
                  }
                  else if(fShow > 5000.0f)
                  {
                     
                  }
                  else
                  {
                     discard;
                  }
            break;
            //tool
            case 1: 

            break;
         }
      `)

      // StorageBuffer
      // this.toolBuffer = new UniformBuffer(this.scene.getEngine())
      // this.toolBuffer.addUniform('toolColors', 4, 20) //Add enough for 20 tools for now
      // this.toolBuffer.update()
      // this.material.onBindObservable.addOnce(() => {
      //    this.material.getEffect()?.setStorageBuffer
      // })
   }

   get getEffect(): Effect | null {
      if (this.material && this.material.getEffect && this.material.getEffect()) {
         return this.material.getEffect()
      }
      return null
   }

   updateRenderMode(mode: number) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setFloat('renderMode', mode)
      })
   }

   updateCurrentFilePosition(position: number) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setFloat('currentPosition', position)
      })
   }

   showPickColor(show: boolean) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setBool('showPickColor', show)
      })
   }

   getMaterial() {
      if (this.material == null) {
         this.buildMaterial()
      }
      return this.material
   }

   //https://playground.babylonjs.com/#MQG92I#29 UniformBuffer sample
   updateToolColors(toolColors: Float32Array) {
      this.material.onBindObservable.addOnce(() => {})
   }

   dispose() {
      if (this.material != null) {
         this.material.dispose()
         this.material = null
      }
   }
}
