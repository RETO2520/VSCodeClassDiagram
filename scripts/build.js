const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const watch = process.argv.includes('--watch');

async function run() {
    const context = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        outfile: 'out/extension.js',
        external: ['vscode'],
        format: 'cjs',
        platform: 'node',
        sourcemap: true,
        minify: !watch,
        target: 'node16', // Match with VS Code's node version
        alias: {
            'web-tree-sitter': path.resolve(__dirname, '../node_modules/web-tree-sitter/web-tree-sitter.cjs')
        },
    });

    if (watch) {
        await context.watch();
        console.log('Watching for changes...');
    } else {
        await context.rebuild();
        await context.dispose();
        console.log('Build completed.');
    }

    // WASM files to copy
    const wasmFiles = [
        {
            src: 'web-tree-sitter/web-tree-sitter.wasm',
            dest: 'web-tree-sitter.wasm'
        },
        {
            src: 'tree-sitter-c-sharp/tree-sitter-c_sharp.wasm',
            dest: 'tree-sitter-c_sharp.wasm'
        },
        {
            src: 'tree-sitter-cpp/tree-sitter-cpp.wasm',
            dest: 'tree-sitter-cpp.wasm'
        },
        {
            src: 'tree-sitter-java/tree-sitter-java.wasm',
            dest: 'tree-sitter-java.wasm'
        },
        {
            src: 'tree-sitter-rust/tree-sitter-rust.wasm',
            dest: 'tree-sitter-rust.wasm'
        },
        {
            src: 'tree-sitter-javascript/tree-sitter-javascript.wasm',
            dest: 'tree-sitter-javascript.wasm'
        },
        {
            src: 'tree-sitter-typescript/tree-sitter-typescript.wasm',
            dest: 'tree-sitter-typescript.wasm'
        }

    ];

    const outDir = path.join(__dirname, '..', 'out');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir);
    }

    for (const file of wasmFiles) {
        try {
            const srcPath = require.resolve(file.src);
            const destPath = path.join(outDir, file.dest);
            fs.copyFileSync(srcPath, destPath);
            console.log(`Copied ${file.dest} to out/`);
        } catch (e) {
            console.error(`Failed to copy ${file.dest}: ${e.message}`);
        }
    }
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
