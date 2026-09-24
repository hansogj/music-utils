#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const EXPECTED_CODES = [
  'WRONG_LETTER_DIR',
  'MISSING_YEAR_PREFIX',
  'WRONG_DISC_SEPARATOR',
  'WRONG_AUX_BRACKETS',
  'NO_TAGS',
  'MISSING_TAGS',
  'TAG_READ_ERROR',
  'NAME_TAG_MISMATCH',
  'DUPLICATE_TRACKS',
];

let report;
try {
  const raw = readFileSync('/tmp/audit-result.json', 'utf-8');
  report = JSON.parse(raw);
} catch (err) {
  console.error('FATAL: Could not read /tmp/audit-result.json:', err.message);
  process.exit(1);
}

// Collect all issue codes across all audits
const foundCodes = new Set();
for (const audit of report.audits) {
  for (const issue of audit.issues) {
    foundCodes.add(issue.code);
  }
}

console.log('\nFound issue codes:', [...foundCodes].sort().join(', '));
console.log('\nIncident verification:');

let allPassed = true;
for (const code of EXPECTED_CODES) {
  const found = foundCodes.has(code);
  const status = found ? 'PASS' : 'FAIL';
  console.log(`  ${status}  ${code}`);
  if (!found) allPassed = false;
}

console.log('');
if (allPassed) {
  console.log('All 9 incident codes detected — integration test PASSED.');
  process.exit(0);
} else {
  console.log('Some incident codes were NOT detected — integration test FAILED.');
  process.exit(1);
}
