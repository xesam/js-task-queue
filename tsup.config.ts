import {defineConfig} from 'tsup'

export default defineConfig([
    {
        entry: ['src/**/*.ts'],
        format: ['cjs'],
        outDir: 'dist/cjs',
        splitting: false,
        sourcemap: true,
        clean: true,
        bundle: false,
        outExtension() {
            return {js: '.js'}
        },
        esbuildOptions(options) {
            options.outbase = 'src'
            options.platform = 'node'
        }
    },
    {
        entry: ['src/**/*.ts'],
        format: ['esm'],
        outDir: 'dist/esm',
        splitting: false,
        sourcemap: true,
        clean: false,
        bundle: false,
        outExtension() {
            return {js: '.js'}
        },
        esbuildOptions(options) {
            options.outbase = 'src'
            options.platform = 'neutral'
        }
    },
    {
        entry: ['src/index.ts'],
        format: ['cjs'],
        outDir: 'dist/miniprogram',
        splitting: false,
        sourcemap: true,
        clean: false,
        bundle: true,
        minify: false,
        outExtension() {
            return {js: '.js'}
        },
        esbuildOptions(options) {
            options.outbase = 'src'
            options.platform = 'neutral'
            // 确保使用 CommonJS 格式，微信小程序兼容性更好
            options.format = 'cjs'
        }
    },
    {
        entry: ['src/**/*.ts'],
        format: ['cjs'],
        dts: {
            only: true
        },
        outDir: 'dist/types',
        splitting: false,
        sourcemap: false,
        clean: false,
        bundle: false,
        outExtension() {
            return {js: '.d.ts'}
        },
        esbuildOptions(options) {
            options.outbase = 'src'
        }
    }
])