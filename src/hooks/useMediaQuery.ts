import { useEffect, useState } from 'react';

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    // Safari before 14 only has the older addListener API.
    if (media.addEventListener) media.addEventListener('change', update);
    else media.addListener(update);
    return () =>
      media.removeEventListener ? media.removeEventListener('change', update) : media.removeListener(update);
  }, [query]);
  return matches;
}
