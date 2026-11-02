/**
 * Which login system the server uses. The old username/password login (`legacy`) is the default on purpose:
 * Better Auth (`neon`) changes how EVERY member signs in, so it must only start when someone sets
 * AUTH_PROVIDER=neon, never as a side effect of deploying new code with settings already present.
 */
export function resolveAuthProvider(value: string | undefined): 'legacy' | 'neon' {
  if (!value) return 'legacy';
  if (value !== 'legacy' && value !== 'neon') throw new Error('AUTH_PROVIDER must be legacy or neon.');
  return value;
}
