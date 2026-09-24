import { useEffect, useState } from "react";

/** Keep fast cache hits quiet without delaying interlocks or error handling. */
export function useDelayedActivity(active: boolean, delay = 180): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [active, delay]);
  return active && visible;
}
