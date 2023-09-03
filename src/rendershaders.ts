export const vertexShader = `
// Vertex shader
#if defined(WEBGL2) || defines(WEBGPU)
precision highp sampler2DArray;
#endif
precision highp float;

        // Attributes
        attribute vec3 position;
         attribute float filePosition;
       
         //Inputs
         uniform float currentPosition;
         

        // Uniforms
        uniform mat4 viewProjection;
        uniform mat4 finalWorld;

        //outputs
         varying float vShow;

#include<instancesDeclaration>


void main(void) {
   #include<instancesVertex>
   gl_Position = viewProjection * finalWorld * vec4(position, 1.0);
   vShow = currentPosition - filePosition;
}
`

export const fragmentShader = `
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

varying float vShow;

#include<helperFunctions>



void main(void) {

gl_FragColor = u_color;
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
