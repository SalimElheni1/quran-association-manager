import { defineConfig } from 'vite';
import path from 'path';
import string from 'vite-plugin-string';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@main': path.resolve(__dirname, './src/main'),
      '@db': path.resolve(__dirname, './src/db'),
    },
  },
  plugins: [
    string({
      include: '**/@mapbox/node-pre-gyp/**/*.js',
      transform(code) {
        return code.replace(/require\('mock-aws-s3'\)/g, '' )
                   .replace(/require\('aws-sdk'\)/g, '' )
                   .replace(/require\('nock'\)/g, '' );
      },
    }),
  ],
});
