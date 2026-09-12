export const EXIT = {
  OK: 0,
  GENERAL: 1,
  USAGE: 2,
  NETWORK: 3,
  NOT_FOUND: 4,
  CONFLICT: 5,
  PERMISSION: 6,
  INTEGRITY: 7,
  CONFIG: 8,
  VERSION: 9,
  PARTIAL: 10,
  UNSUPPORTED: 11
};

export const EXIT_NAME = new Map(Object.entries(EXIT).map(([k, v]) => [v, k]));

export function exit(code, msg) {
  if (msg) {
    if (code === EXIT.OK) process.stdout.write(msg + '\n');
    else process.stderr.write(msg + '\n');
  }
  process.exit(code);
}
