import { msbuildPath, run, solution } from './lib/native-toolchain.mjs';

run(msbuildPath(), [
  solution,
  '/t:Restore',
  '/p:RestorePackagesConfig=true',
  '/p:Platform=x64',
  '/m',
  '/verbosity:minimal',
]);
run(msbuildPath(), [
  solution,
  '/t:Build',
  '/p:Configuration=Debug',
  '/p:Platform=x64',
  '/m',
  '/verbosity:minimal',
]);
