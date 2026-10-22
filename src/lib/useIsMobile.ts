import { useState, useEffect } from 'react';

export function useIsMobile(breakpoint = 640): boolean {
  const mq = typeof window !== 'undefined'
    ? window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    : null;

  const [mobile, setMobile] = useState(() => mq?.matches ?? false);

  useEffect(() => {
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  // mq is stable for a given breakpoint — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakpoint]);

  return mobile;
}
