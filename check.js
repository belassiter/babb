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

console.log('');
if (errorCount > 0) {
    console.error(`Checks failed with ${errorCount} error(s).`);
    process.exit(1);
} else {
    console.log(`All ${jsFiles.length + jsonFiles.length} files passed syntax & format checks.`);
    process.exit(0);
}
