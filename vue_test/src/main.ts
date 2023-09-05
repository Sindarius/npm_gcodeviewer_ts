import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'

// Vuetify
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css' // Ensure you are using css-loader
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'

const vuetify = createVuetify({
   components,
   directives,
   icons: {
      defaultSet: 'mdi',
      aliases,
      sets: {
         mdi,
      },
   },
   theme: {
      defaultTheme: 'dark',
   },
})

createApp(App).use(vuetify).mount('#app')
