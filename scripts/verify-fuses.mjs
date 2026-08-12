import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { findPackagedExecutable } from './packaged-executable.mjs';

const executable = await findPackagedExecutable();
const wire = await getCurrentFuseWire(executable);
const expected = new Map([
  [FuseV1Options.RunAsNode, FuseState.ENABLE],
  [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
  [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
  [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FuseState.DISABLE],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.DISABLE],
  [FuseV1Options.WasmTrapHandlers, FuseState.ENABLE],
]);

for (const [option, state] of expected) {
  if (wire[option] !== state) {
    throw new Error(`Fuse ${FuseV1Options[option]} expected ${state}, received ${wire[option]}`);
  }
}
console.log(`Verified hardened fuse wire in ${executable}`);
