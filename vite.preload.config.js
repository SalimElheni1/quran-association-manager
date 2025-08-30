const { defineConfig } = require('vite');

// https://vitejs.dev/config
module.exports = defineConfig({
  build: {
    rollupOptions: {
      output: {
        format: 'cjs',
      },
    },
  },
});
