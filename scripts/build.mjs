import { build } from 'esbuild'
import { readFile, mkdir, copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const astryxCoreCss = require.resolve('@astryxdesign/core/astryx.css')
const astryxThemeCss = require.resolve('@astryxdesign/theme-neutral/theme.css')
// Bundle font files into CSS data URLs so the plugin never depends on a CDN or Host asset routes.
const cssPlugin = {
  name: 'inline-css-with-fonts',
  setup(builder) {
    builder.onLoad({ filter: /\.css$/ }, async ({ path }) => {
      const result = await build({ entryPoints: [path], bundle: true, write: false, minify: true, loader: { '.woff2': 'dataurl' }, logLevel: 'silent' })
      let css = result.outputFiles[0].text
      if (path === astryxCoreCss || path === astryxThemeCss) {
        // The notebook shares the document with Harness. Keep library defaults on its own surface.
        css = css.replaceAll(':root', ':where(.st-host)').replaceAll('html[data-theme=', '.st-host[data-theme=')
      }
      return { contents: `export default ${JSON.stringify(css)}`, loader: 'js' }
    })
  },
}
const common = { bundle: true, target: 'es2022', logLevel: 'info' }
const browserDefines = { 'process.env.NODE_ENV': '"production"', 'import.meta.url': '""' }
const notebookRuntimePlugin = {
  name: 'bundle-notebook-runtime',
  setup(builder) {
    builder.onLoad({ filter: /[\\/]notebook-runtime\.tsx$/ }, async ({ path }) => {
      // Harness owns the page slot. Astryx runs in a separate React 19 root.
      const result = await build({ ...common, entryPoints: [path], write: false, format: 'esm',
        platform: 'browser', minify: true, define: browserDefines, logLevel: 'silent' })
      return { contents: result.outputFiles[0].text, loader: 'js' }
    })
  },
}
await mkdir('lib', { recursive: true })
await build({ ...common, entryPoints: ['src/index.ts'], outfile: 'lib/index.js', format: 'esm', platform: 'node' })
await build({
  ...common, entryPoints: ['src/client/index.tsx'], outfile: 'lib/client.js', format: 'cjs', platform: 'browser',
  external: ['react', 'react/jsx-runtime'], plugins: [notebookRuntimePlugin, cssPlugin], minify: true,
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-socratic-tutor",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
  // MathLive's import.meta asset discovery is unused because all fonts are embedded and sounds are disabled.
  define: browserDefines,
})
await mkdir('preview-dist', { recursive: true })
await build({
  ...common, entryPoints: ['src/preview.tsx'], outfile: 'preview-dist/preview.js', format: 'esm', platform: 'browser',
  plugins: [cssPlugin], define: { 'process.env.NODE_ENV': '"production"' }, minify: true,
})
await copyFile('preview.html', 'preview-dist/index.html')
const manifest = JSON.parse(await readFile('package.json', 'utf8'))
console.log(`Built ${manifest.name}@${manifest.version}. Preview: npm run preview`)
// Ensure MathLive's attribution remains in the distributed package alongside the bundled code.
await copyFile(require.resolve('mathlive').replace(/[^\\/]+$/, 'LICENSE.txt'), 'lib/MATHLIVE-LICENSE.txt')
await copyFile(resolve(dirname(astryxThemeCss), '../LICENSE'), 'lib/ASTRYX-LICENSE.txt')
await copyFile(new URL('../licenses/stylex.txt', import.meta.url), 'lib/STYLEX-LICENSE.txt')
const stylexRequire = createRequire(require.resolve('@stylexjs/stylex'))
await copyFile(resolve(dirname(stylexRequire.resolve('styleq/package.json')), 'LICENSE'), 'lib/STYLEQ-LICENSE.txt')
await copyFile(resolve(dirname(require.resolve('react/package.json')), 'LICENSE'), 'lib/REACT-LICENSE.txt')
