import React, { useEffect, useId, useRef } from 'react';

interface ModalProps {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra classes for the card (width etc.). */
  className?: string;
  /** Element id to focus first; defaults to the first focusable element. */
  initialFocusId?: string;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible dialog: labelled, Escape closes, focus is trapped inside and restored on close. */
export const Modal: React.FC<ModalProps> = ({ title, onClose, children, className = '', initialFocusId }) => {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    const first = (initialFocusId && document.getElementById(initialFocusId)) || card?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !card) return;
      const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [initialFocusId]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl shadow-slate-950 max-h-[90vh] overflow-y-auto ${className}`}
      >
        <h3 id={titleId} className="font-extrabold text-lg text-white leading-tight flex items-center gap-2">{title}</h3>
        {children}
      </div>
    </div>
  );
};
