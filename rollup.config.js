import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';

export default {
    input: 'src/index.ts',
    output: {
        file: 'main.js',
        sourcemap: 'inline',
        format: 'cjs',
        exports: 'default',
    },
    external: [
        'obsidian',
        '@codemirror/autocomplete',
        '@codemirror/closebrackets',
        '@codemirror/commands',
        '@codemirror/fold',
        '@codemirror/gutter',
        '@codemirror/history',
        '@codemirror/language',
        '@codemirror/rangeset',
        '@codemirror/rectangular-selection',
        '@codemirror/search',
        '@codemirror/state',
        '@codemirror/stream-parser',
        '@codemirror/text',
        '@codemirror/view',
    ],
    plugins: [
        json(),
        typescript(),
        nodeResolve({ browser: true }),
        commonjs(),
        terser()
    ]
};
