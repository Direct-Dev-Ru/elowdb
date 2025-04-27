import fs from 'fs';
import path from 'path';

// Function to recursively traverse directories
function getFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getFiles(filePath, fileList); // Recursive call for subdirectories
        } else if (file.endsWith('.ts') && !(file.endsWith('.spec.ts') || file.endsWith('.test.ts'))) {
            fileList.push(filePath);
        }
    }

    return fileList;
}

// Fix path resolution for Windows
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename.replace(/^\/([A-Za-z]:)/, '$1')); // Convert POSIX-style path to Windows path

// Resolve the src directory relative to the script's location
const srcDir = path.resolve(__dirname, 'src');

// Validate that the src directory exists
if (!fs.existsSync(srcDir)) {
    throw new Error(`Source directory not found: ${srcDir}`);
}

// Get all .ts files (excluding test files)
const files = getFiles(srcDir);

// Generate content for index.ts
let indexContent = `// Auto-generated index file\n`;
for (const file of files) {
    const relativePath = path.relative(srcDir, file).replace(/\.ts$/, '');
    indexContent += `export * from './${relativePath.replace(/\\/g, '/')}.js';\n`;
}

// Write the result to src/index.ts
const indexPath = path.join(srcDir, 'index.ts');
fs.writeFileSync(indexPath, indexContent);

console.log(`Generated ${indexPath} with exports for all .ts files.`);