/**
 * An AbortSignal that fires after `ms`. `AbortSignal.timeout` only exists in Safari 16+ (and other recent browsers);
 * calling it on an older iPhone or Mac throws, which stopped every request and left the site unusable.
 */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
