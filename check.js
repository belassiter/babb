/**
 * check.js
 * Cross-platform static syntax and sanity verification for BABB.
 * Validates all JavaScript and JSON files without requiring external dependencies.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

console.log('Running static syntax and integrity checks...\n');

let errorCount = 0;

// 1. Check JavaScript / MJS files
const jsDirs = ['.', 'test'];
const jsFiles = [];

for (const dir of jsDirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
        if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
            jsFiles.push(path.join(dir, entry));
        }
    }
}

for (const file of jsFiles) {
    process.stdout.write(`  Checking syntax: ${file}... `);
    try {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
        console.log('OK');
    } catch (err) {
        console.log('FAILED');
        console.error(`\nSyntax error in ${file}:\n`, err.stderr ? err.stderr.toString() : err.message);
        errorCount++;
    }
}

// 2. Validate JSON files (excluding package-lock.json and credentials from verbose print)
const jsonFiles = fs.readdirSync('.').filter(f => f.endsWith('.json') && f !== 'package-lock.json');

for (const file of jsonFiles) {
    process.stdout.write(`  Validating JSON: ${file}... `);
    try {
        const content = fs.readFileSync(file, 'utf8');
        JSON.parse(content);
        console.log('OK');
    } catch (err) {
        console.log('FAILED');
        console.error(`\nInvalid JSON in ${file}:\n`, err.message);
        errorCount++;
    }
}

// 3. Validate HTML local script and stylesheet references
const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));

for (const htmlFile of htmlFiles) {
    process.stdout.write(`  Checking HTML assets: ${htmlFile}... `);
    try {
        const content = fs.readFileSync(htmlFile, 'utf8');
        let htmlErrors = 0;

        // Find <script src="...">
        const scriptRegex = /<script\b[^>]*?\bsrc=["']([^"']+)["']/gi;
        let match;
        while ((match = scriptRegex.exec(content)) !== null) {
            const src = match[1].trim();
            if (src.startsWith('http:') || src.startsWith('https:') || src.startsWith('//')) continue;
            const cleanPath = src.split('?')[0];
            if (!fs.existsSync(cleanPath)) {
                if (htmlErrors === 0) console.log('FAILED');
                console.error(`\n  Missing script reference in ${htmlFile}: ${cleanPath}`);
                htmlErrors++;
                errorCount++;
            }
        }

        // Find <link href="..."> for stylesheets
        const linkRegex = /<link\b[^>]*?\bhref=["']([^"']+)["']/gi;
        while ((match = linkRegex.exec(content)) !== null) {
            const href = match[1].trim();
            if (href.startsWith('http:') || href.startsWith('https:') || href.startsWith('//')) continue;
            const cleanPath = href.split('?')[0];
            if (!fs.existsSync(cleanPath)) {
                if (htmlErrors === 0) console.log('FAILED');
                console.error(`\n  Missing stylesheet reference in ${htmlFile}: ${cleanPath}`);
                htmlErrors++;
                errorCount++;
            }
        }

        if (htmlErrors === 0) {
            console.log('OK');
        }
    } catch (err) {
        console.log('FAILED');
        console.error(`\nError reading ${htmlFile}:`, err.message);
        errorCount++;
    }
}

// 4. Validate Repertoire Dataset Integrity
if (fs.existsSync('merged-data.json')) {
    process.stdout.write('  Verifying dataset integrity: merged-data.json... ');
    try {
        const data = JSON.parse(fs.readFileSync('merged-data.json', 'utf8'));
        if (!Array.isArray(data)) {
            throw new Error('merged-data.json root must be an Array');
        }
        let missingFields = 0;
        for (let i = 0; i < data.length; i++) {
            const song = data[i];
            if (!song || typeof song !== 'object') {
                missingFields++;
                continue;
            }
            if (!song.Title || String(song.Title).trim() === '') {
                missingFields++;
            }
            if (song.Number == null || String(song.Number).trim() === '') {
                missingFields++;
            }
        }
        if (missingFields > 0) {
            console.log('FAILED');
            console.error(`\n  merged-data.json has ${missingFields} record(s) missing required Title or Number.`);
            errorCount++;
        } else {
            console.log(`OK (${data.length} records verified)`);
        }
    } catch (err) {
        console.log('FAILED');
        console.error(`\nDataset integrity error in merged-data.json:`, err.message);
        errorCount++;
    }
}

console.log('');
if (errorCount > 0) {
    console.error(`Checks failed with ${errorCount} error(s).`);
    process.exit(1);
} else {
    console.log(`All ${jsFiles.length + jsonFiles.length + htmlFiles.length} files and datasets passed integrity checks.`);
    process.exit(0);
}
