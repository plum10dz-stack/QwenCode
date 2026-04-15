import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import readline from 'readline';

interface FileEntry {
    path: string;
    size: number;
    content: string;
}

interface Manifest {
    dir: string;
    files: FileEntry[];
}

/**
 * Utility for terminal prompts
 */
function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans.trim()); }));
}

async function startRestoration() {
    const args = process.argv.slice(2);
    const isForce = args.includes('--force');

    // 1. Identify the manifest file from arguments or prompt
    let jsonPath = args.find(a => a.endsWith('.json'));
    if (!jsonPath) {
        jsonPath = await askQuestion('Path to the JSON manifest file: ');
    }

    if (!existsSync(jsonPath)) {
        console.error(`Error: Manifest "${jsonPath}" not found.`);
        process.exit(1);
    }

    // 2. Read and Validate JSON Structure
    let manifest: Manifest;
    try {
        const rawData = await fs.readFile(jsonPath, 'utf8');
        manifest = JSON.parse(rawData);

        if (!manifest.files || !Array.isArray(manifest.files)) {
            throw new Error('Invalid manifest format: "files" array missing.');
        }
    } catch (err) {
        console.error('Error parsing JSON manifest:', err instanceof Error ? err.message : err);
        process.exit(1);
    }

    // 3. Choose Destination Directory
    let destDir = await askQuestion('Enter destination directory to rebuild files: ');
    const absoluteDest = path.resolve(destDir);

    // 4. Pre-Check for existing files (Collision Detection)
    if (!isForce) {
        console.log('Checking for existing files...');
        const existingFiles: string[] = [];

        for (const file of manifest.files) {
            const targetPath = path.join(absoluteDest, file.path);
            if (existsSync(targetPath)) {
                existingFiles.push(file.path);
            }
        }

        if (existingFiles.length > 0) {
            console.error('\n[ABORTED] Restoration failed. Files already exist in destination:');
            existingFiles.slice(0, 5).forEach(f => console.error(` - ${f}`));
            if (existingFiles.length > 5) console.error(` ... and ${existingFiles.length - 5} more.`);
            console.error('\nUse --force to overwrite existing files.');
            process.exit(1);
        }
    }

    // 5. Execute Rebuild
    console.log(`\nRebuilding into: ${absoluteDest}...`);

    try {
        // Ensure root destination exists
        await fs.mkdir(absoluteDest, { recursive: true });

        for (const file of manifest.files) {
            const fullPath = path.join(absoluteDest, file.path);
            const parentDir = path.dirname(fullPath);

            // Ensure sub-directories exist
            await fs.mkdir(parentDir, { recursive: true });

            // Write file content
            await fs.writeFile(fullPath, file.content, 'utf8');
            console.log(`Restored: ${file.path}`);
        }

        console.log(`\nSuccess! ${manifest.files.length} files reconstructed.`);
    } catch (err) {
        console.error('An error occurred during restoration:', err);
        process.exit(1);
    }
}

startRestoration().catch(console.error);