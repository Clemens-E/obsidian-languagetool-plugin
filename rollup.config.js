import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import nodePolyfills from 'rollup-plugin-polyfill-node';

const isProd = process.env.BUILD === "production";

export default {
    input: 'src/index.ts',
    output: {
        file: 'main.js',
        sourcemap: isProd ? false : "inline",
        format: 'cjs',
        exports: 'default',
    },
    external: [
        'obsidian',
        '@codemirror/autocomplete',
        '@codemirror/commands',
        '@codemirror/language',
        '@codemirror/search',
        '@codemirror/state',
        '@codemirror/view',
        '@lezer/common'
    ],
    plugins: [
        json(),
        typescript(),
        nodeResolve({ browser: true }),
        commonjs(),
        nodePolyfills(),
        terser()
    ]
};
