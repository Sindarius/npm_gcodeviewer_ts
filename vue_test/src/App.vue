<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue'
import TheWelcome from './components/TheWelcome.vue'
import Viewer_Proxy from 'test'
import { ref, onMounted, onUnmounted, reactive} from 'vue'

let viewer: Viewer|null = null;
const viewercanvas = ref(null);
const gcodeLine = ref({line: ''});



onMounted(() => { 
  if(viewercanvas.value != null){
    viewer = new Viewer_Proxy(viewercanvas.value);
    viewer.init();
    viewer.passThru = (e) => {
      if (e.type == 'currentline') {
        gcodeLine.value.line = e.line;
      }
    }
  }
}) 

onUnmounted(() => { 
  
})

  async function openLocalFile(file: File): Promise<void> {
        if (!file) return
        const reader = new FileReader()
        reader.addEventListener('load', async (event) => {
            const blob = event?.target?.result
            viewer.loadFile(blob)
        })
        reader.readAsText(file)
  }

   function dragOver(event: DragEvent): void {
        if ((event.dataTransfer?.files.length ?? -1) > 0) {
            //const  file = event.dataTransfer?.files[0]
        }
    }

    function dragLeave(event: DragEvent): void {
        //Do nothing at the moment
    }

    async function drop(event: DragEvent): Promise<void> {
        if ((event.dataTransfer?.files.length ?? -1) > 0) {
            const file = event.dataTransfer?.files[0]
            if (file) {
                await openLocalFile(file)
            }
        }
    }

function reset(){
  viewer.reset();
  viewer.updateColorTest();
    }

function colortest(){
  viewer.updateColorTest();
   }
</script>

<template>
  <header>
    <div class="gcodeline">{{ gcodeLine.line }}</div>
     <canvas class="canvasFull" tabindex="1" ref="viewercanvas" @dragover.prevent="dragOver" @dragleave="dragLeave" @drop.prevent="drop" />
    <input class="reset" type="button" value="Reset" @click="reset" />
    <input class="colortest" type="button" value="Color Test" @click="colortest" />
    </header>

  <main>

  </main>
</template>

<style scoped>
header {
  line-height: 1.5;
}


.logo {
  display: block;
  margin: 0 auto 2rem;
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  .logo {
    margin: 0 2rem 0 0;
  }

  header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }
}

.canvasFull {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
}
.gcodeline { 
  position: absolute;
  top:5px;
  left:5px;
  font-size:20px;
  font-family:'Courier New', Courier, monospace;
  z-index: 11;
}

.reset {
  position: absolute;
  top:5px;
  right:5px;
  font-size:20px;
  font-family:'Courier New', Courier, monospace;
  z-index: 11;

}

.colortest {
  position: absolute;
  top:30px;
  right:5px;
  font-size:20px;
  font-family:'Courier New', Courier, monospace;
  z-index: 11;

}
</style>
