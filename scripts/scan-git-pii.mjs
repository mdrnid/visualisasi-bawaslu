import { execSync } from 'node:child_process';

const out = execSync('git log --all --name-only --format="commit:%H"').toString();
const lines = out.split(/\r?\n/);
const fileCommits = new Map();
let currentCommit = '';

for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('commit:')) {
        currentCommit = trimmed.slice(7);
    } else {
        const file = trimmed;
        if (!fileCommits.has(file)) {
            fileCommits.set(file, new Set());
        }
        fileCommits.get(file).add(currentCommit);
    }
}

const piiMatches = [];
for (const [file, commits] of fileCommits.entries()) {
    const isPii = 
        file.endsWith('.xlsx') || 
        file.includes('penghargaan.json') || 
        file.includes('.data-cache.json') || 
        file.startsWith('.env') || 
        file.includes('/.env') ||
        file.startsWith('assets/personel/') || 
        file.startsWith('assets/awards/');
    
    if (isPii) {
        piiMatches.push({ file, commitsCount: commits.size, commits: Array.from(commits) });
    }
}

console.log('=== PII FILES IN GIT HISTORY ===');
console.log('Total PII files:', piiMatches.length);
piiMatches.sort((a, b) => a.file.localeCompare(b.file));
console.log(JSON.stringify(piiMatches, null, 2));
