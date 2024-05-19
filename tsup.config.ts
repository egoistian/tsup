import { defineConfig } from 'tsup'

export default defineConfig({
  name: 'tsup',
  target: 'node18',
  format: 'esm',
  dts: {
    resolve: true,
    // build types for `src/index.ts` only
    // otherwise `Options` will not be exported by `tsup`, not sure how this happens, probably a bug in rollup-plugin-dts
    entry: './src/index.ts',
  },

  banner: {
    js: "import {createRequire} from 'module';const require=createRequire(import.meta.url);",
  },
})
