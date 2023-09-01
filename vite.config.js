const path = require('path')
const { defineConfig } = require('vite')
const dts = require('vite-plugin-dts')

module.exports = defineConfig({
  build: {
    commonjsOptions:{
      include:[/dist/, /node_modules/]
    },
    target: "esnext",
    lib: {
      formats: ["es", "cjs"],
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'test',
      fileName: (format) => `index.${format}.js`
    }
  },
  plugins: [
    dts(),
  ]
});