import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dirsToRemove = [
    'dist',
    'dist-ssr',
    'coverage',
    'playwright-report',
    '.cache',
];

const filesToRemove = [
    'tsconfig.tsbuildinfo',
];

const cwd = process.cwd();

let cleaned = false;

for (const dir of dirsToRemove) {
    const target = path.join(cwd, dir);
    if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        console.log(`Cleaned: ${dir}/`);
        cleaned = true;
    }
}

for (const file of filesToRemove) {
    const target = path.join(cwd, file);
    if (fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
        console.log(`Cleaned: ${file}`);
        cleaned = true;
    }
}

if (!cleaned) {
    console.log('Nothing to clean.');
} else {
    console.log('Cleanup completed.');
}