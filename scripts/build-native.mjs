import { configurationFromArguments, msbuildPath, run, solution } from './lib/native-toolchain.mjs';

const configuration = configurationFromArguments();
const msbuildArguments = [
  solution,
  '/t:Build',
  `/p:Configuration=${configuration}`,
  '/p:Platform=x64',
  '/m',
  '/verbosity:minimal',
];
if (process.argv.includes('--e2e')) msbuildArguments.push('/p:LgtE2E=true');
run(msbuildPath(), msbuildArguments);
