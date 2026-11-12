'use client';

import { useEffect } from 'react';

/** Opens the FAQ answer named by the URL hash (#q1 to #q5), on load and on every hash change.
 * The accordion itself is native `<details name="faq">`, so this is the only client code. */
export function FaqDeepLink() {
  useEffect(() => {
    const openFromHash = () => {
      const id = window.location.hash.slice(1);
      if (id === '') return;
      const target = document.getElementById(id);
      if (
        target instanceof HTMLDetailsElement &&
        target.getAttribute('name') === 'faq'
      ) {
        target.open = true;
      }
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => {
      window.removeEventListener('hashchange', openFromHash);
    };
  }, []);
  return null;
}
