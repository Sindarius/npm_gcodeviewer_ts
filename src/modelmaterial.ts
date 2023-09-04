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
      this.material.AddUniform('renderMode', 'int', 1)
      this.material.AddUniform('toolColors', 'vec4 [20]', new Float32Array(80))

      this.material.Vertex_Definitions(`
      attribute float filePosition;
      attribute vec3 pickColor;
      attribute float tool;

      flat out float fShow;
      flat out vec3 vPickColor;
      flat out float fTool;
      
      `)
      this.material.Vertex_MainBegin(`
      fShow = currentPosition - filePosition;
      vPickColor = pickColor;
      fTool = floor(tool);
      `)
      this.material.Fragment_Definitions(`
      flat in float fShow;
      flat in vec3 vPickColor;
      flat in float fTool;
      `)
      this.material.Fragment_Custom_Alpha(`
         if(fShow < 0.0f) {
            discard;
         }
      `)

      this.material.Fragment_Custom_Diffuse(`
         if(showPickColor)
         {
            diffuseColor.rgb = vPickColor;
         }
         else
         switch(renderMode)
         {
            //default
            case 0: 
                  if (fShow > 0.0f && fShow < 5000.0f) 
                  { 
                     diffuseColor.rgb = mix(vec3(0,1,0), diffuseColor.rgb, fShow / 5000.0f);
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
               diffuseColor.rgb = toolColors[int(fTool)].rgb;
            break;
         }
         //diffuseColor.rgb = vec3(0,1,1);
      `)

      // this.material.Fragment_Before_FragColor(`

      //    if(showPickColor)
      //    {
      //       color.rgb = vPickColor;
      //    }
      //    else
      //    switch(renderMode)
      //    {
      //       //default
      //       case 0:
      //             if (fShow > 0.0f && fShow < 5000.0f)
      //             {
      //                color.rgb *= mix(vec3(0,1,0), color.rgb, fShow / 5000.0f);
      //             }
      //             else if(fShow > 5000.0f)
      //             {
      //             }
      //             else
      //             {
      //                discard;
      //             }
      //       break;
      //       //tool
      //       case 1:
      //          color.rgb *= toolColors[int(fTool)].rgb;
      //       break;
      //    }
      // `)

      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setInt('renderMode', 1)
      })
   }

   get getEffect(): Effect | null {
      if (this.material && this.material.getEffect && this.material.getEffect()) {
         return this.material.getEffect()
      }
      return null
   }

   updateRenderMode(mode: number) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setInt('renderMode', mode)
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
   async updateToolColors(toolColors: number[]) {
      this.material.onBindObservable.addOnce(() => {
         this.material.getEffect()?.setFloatArray4('toolColors', toolColors)
      })
   }

   dispose() {
      if (this.material != null) {
         this.material.dispose()
         this.material = null
      }
   }
}
