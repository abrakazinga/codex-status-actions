import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const isWatching = Boolean(process.env.ROLLUP_WATCH);
const pluginDirectory = "com.abrakazinga.codex-status-actions.sdPlugin";
const legalFiles = ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"];
const watchedPluginFiles = [
  "manifest.json",
  "ui/property-inspector.css",
  "ui/shared-property-inspector.js",
  "ui/property-inspector.html",
  "ui/property-inspector.js",
  "ui/usage-property-inspector.html",
  "ui/usage-property-inspector.js",
  "ui/dictation-property-inspector.html",
  "ui/dictation-property-inspector.js"
];

/** @type {import("rollup").RollupOptions} */
export default {
  input: "src/plugin.ts",
  output: {
    file: `${pluginDirectory}/bin/plugin.js`,
    format: "es",
    sourcemap: isWatching,
    sourcemapPathTransform(relativeSourcePath, sourcemapPath) {
      return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
    }
  },
  plugins: [
    {
      name: "watch-plugin-files",
      buildStart() {
        for (const file of watchedPluginFiles) this.addWatchFile(`${pluginDirectory}/${file}`);
        for (const file of legalFiles) this.addWatchFile(file);
      }
    },
    typescript({ mapRoot: isWatching ? "./" : undefined }),
    nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
    commonjs(),
    !isWatching && terser(),
    {
      name: "emit-module-package-file",
      generateBundle() {
        this.emitFile({ fileName: "package.json", source: '{ "type": "module" }', type: "asset" });
      }
    },
    {
      name: "copy-legal-files",
      async writeBundle() {
        await Promise.all(legalFiles.map((file) => copyFile(file, path.join(pluginDirectory, file))));
      }
    }
  ]
};
