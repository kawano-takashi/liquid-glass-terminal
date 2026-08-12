const expectedNode = 'v24.19.0';
const expectedNpm = '11.17.0';
const npmAgent = process.env.npm_config_user_agent ?? '';
const npmMatch = /(?:^|\s)npm\/([^\s]+)/.exec(npmAgent);

if (process.version !== expectedNode) {
  console.error(`Expected Node ${expectedNode}, received ${process.version}`);
  process.exitCode = 1;
}
if (npmMatch?.[1] !== expectedNpm) {
  console.error(`Expected npm ${expectedNpm}, received ${npmMatch?.[1] ?? 'unknown'}`);
  process.exitCode = 1;
}

if (!process.exitCode) console.log(`Toolchain verified: Node ${expectedNode}, npm ${expectedNpm}`);
