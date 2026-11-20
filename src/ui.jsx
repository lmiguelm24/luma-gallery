import React, { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

const overlays = [];
let originalOverflow = '';

export function dismissTopOverlay() {
  overlays.at(-1)?.close.current();
}

export function IconButton({ icon, label, active, ...props }) {
  return <button className={`icon-button ${active ? 'is-active' : ''}`} title={label} aria-label={label} {...props}><Icon name={icon}/></button>;
}

export function useFocusTrap(ref, onClose) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overlay = { ref, close };
    if (!overlays.length) originalOverflow = document.body.style.overflow;
    overlays.push(overlay);
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    function onKey(event) {
      if (overlays.at(-1) !== overlay) return;
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab' || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], video[controls], [tabindex="0"]')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const index = overlays.indexOf(overlay);
      if (index !== -1) overlays.splice(index, 1);
      if (!overlays.length) document.body.style.overflow = originalOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [ref]);
}
