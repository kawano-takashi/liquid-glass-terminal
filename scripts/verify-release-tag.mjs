import { readFileSync } from 'node:fs';

const tag = process.env.GITHUB_REF_NAME;
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (tag !== `v${version}`) {
  console.error(`Release tag ${tag ?? '<missing>'} does not match package version v${version}`);
  process.exit(1);
}
console.log(`Release tag v${version} matches package.json`);
