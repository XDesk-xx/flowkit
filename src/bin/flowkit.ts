import { getVersion } from '../cli/version.js';

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  console.log(getVersion());
  process.exit(0);
}

// A1 default: output version (no other CLI commands yet)
console.log(getVersion());
