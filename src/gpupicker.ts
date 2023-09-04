import { Engine } from '@babylonjs/core/Engines/engine'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { Scene } from '@babylonjs/core/scene'
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import '@babylonjs/core/Engines/thinEngine'
import { colorToNumUint8 } from './util'

export default class GPUPicker {
   scene: Scene
   engine: Engine
   renderTarget: RenderTargetTexture
   width: number
   height: number
   colorTestCallBack: any
   currentPosition: number = 0

   //  shaderMaterial: CustomMaterial
   shaderMaterial: ShaderMaterial
   constructor(scene: Scene, engine: Engine, width: number, height: number) {
      this.scene = scene
      this.engine = engine
      this.width = width
      this.height = height
      this.renderTarget = new RenderTargetTexture('rt', { width, height }, this.scene, true)
      this.scene.customRenderTargets.push(this.renderTarget)
      this.shaderMaterial = new ShaderMaterial(
         'vs_mat',
         this.scene,
         {
            vertexSource: vertexShader,
            fragmentSource: fragmentShader,
         },
         {
            attributes: ['position', 'pickColor', 'filePosition'],
            uniforms: [
               'world',
               'worldView',
               'worldViewProjection',
               'view',
               'projection',
               'viewProjection',
               'currentPosition',
            ],
         },
      )

      // this.shaderMaterial.onBindObservable.add(() => {
      //    if (this.shaderMaterial && this.shaderMaterial.getEffect && this.shaderMaterial.getEffect()) {
      //       this.shaderMaterial.getEffect().setFloat('currentPosition', this.currentPosition)
      //    }
      // })

      this.renderTarget.onAfterRenderObservable.add(() => {
         const x = Math.round(this.scene.pointerX)
         const y = this.height - Math.round(this.scene.pointerY)
         const pixels = this.readTexturePixels(
            this.engine._gl,
            this.renderTarget._texture._hardwareTexture.underlyingResource,
            x,
            y,
            1,
            1,
         )
         //const colorId = colorToNumUint8(pixels) // `${pixels[0]}_${pixels[1]}_${pixels[2]}`
         //  if (pixels[0] < 100 && pixels[0] != 0)
         //console.log(colorId)
         if (this.colorTestCallBack) {
            this.colorTestCallBack(pixels)
         }
      })
   }

   readTexturePixels(gl, texture, x, y, w, h) {
      const frameBuffer = gl.createFramebuffer()
      const pixels = new Uint8Array(w * h * 4)

      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

      return pixels
   }

   updateRenderTargetSize(width, height) {
      this.width = width
      this.height = height
      this.renderTarget.resize({ width, height })
   }

   addToRenderList(mesh: Mesh) {
      this.renderTarget.setMaterialForRendering(mesh, this.shaderMaterial)
      this.renderTarget.renderList.push(mesh)
   }

   updateCurrentPosition(currentPosition: number) {
      this.currentPosition = currentPosition
      this.shaderMaterial.setFloat('currentPosition', this.currentPosition)
   }
}

const vertexShader = `
// Vertex shader
#if defined(WEBGL2) || defines(WEBGPU)
precision highp sampler2DArray;
#endif
precision highp float;

        // Attributes
        attribute vec3 position;
         attribute vec3 pickColor;
         attribute float filePosition;

        // Uniforms
        uniform mat4 viewProjection;
        uniform float currentPosition;


        //to fragment
        varying vec4 vPickColor;
        varying float vShow;

#include<instancesDeclaration>


void main(void) {
   #include<instancesVertex>
   gl_Position = viewProjection * finalWorld * vec4(position, 1.0);
   vPickColor = vec4(pickColor, 1.0);
   vShow = currentPosition - filePosition;
}
`

const fragmentShader = `
// Fragment shader
#if defined(PREPASS)
#extension GL_EXT_draw_buffers : require
layout(location = 0) out highp vec4 glFragData[SCENE_MRT_COUNT];
highp vec4 gl_FragColor;
#endif
#if defined(WEBGL2) || defines(WEBGPU)
precision highp sampler2DArray;
#endif
precision highp float;

uniform mat4 u_World;
uniform mat4 u_ViewProjection;
uniform vec4 u_color;
varying vec4 vPickColor;
varying float vShow;

#include<helperFunctions>



void main(void) {
if(vShow < 0.0f){
  discard;
}  
gl_FragColor = vPickColor;
#ifdef CONVERTTOLINEAR0
gl_FragColor = toLinearSpace(gl_FragColor);
#endif
#ifdef CONVERTTOGAMMA0
gl_FragColor = toGammaSpace(gl_FragColor);
#endif
#if defined(PREPASS)
gl_FragData[0] = gl_FragColor;
#endif

}
`
