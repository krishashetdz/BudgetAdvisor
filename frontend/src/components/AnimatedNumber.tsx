import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { money, number } from '../types';
export const AnimatedNumber = ({ value, currency = false, testId, className = '' }: { value?: number; currency?: boolean; testId: string; className?: string }) => {
  const [shown, setShown] = useState(value ?? 0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (value === undefined || reduced) { setShown(value ?? 0); return; }
    let frame = 0; const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / 650);
      setShown(t === 1 ? value : Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  return <span className={className} data-testid={testId} aria-label={value === undefined ? 'Not calculated' : currency ? money(value) : number(value)}>{value === undefined ? '—' : currency ? money(shown) : number(shown)}</span>;
};