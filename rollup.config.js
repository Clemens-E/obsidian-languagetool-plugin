import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

export default {
    input: 'src/index.ts',
    output: {
        file: 'main.js',
        sourcemap: 'inline',
        format: 'cjs',
        exports: 'default',
    },
    external: ['obsidian'],
    plugins: [
        typescript(),
        nodeResolve({ browser: true }),
        commonjs(),
    ]
};