import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** In-app replacement for window.confirm (accessible, styled, works in an installed PWA). */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((next) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <Modal
          title={<><AlertTriangle className={`w-5 h-5 ${options.danger ? 'text-rose-400' : 'text-amber-400'}`} aria-hidden="true" />{options.title}</>}
          onClose={() => close(false)}
          initialFocusId="confirm-dialog-cancel"
        >
          <p className="text-sm text-slate-300 leading-relaxed">{options.message}</p>
          <div className="flex gap-3 pt-2">
            <button
              id="confirm-dialog-cancel"
              type="button"
              onClick={() => close(false)}
              className="flex-1 min-h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm"
            >
              {options.cancelLabel ?? 'Cancel'}
            </button>
            <button
              id="confirm-dialog-ok"
              type="button"
              onClick={() => close(true)}
              className={`flex-1 min-h-12 rounded-xl font-black text-sm ${
                options.danger ? 'bg-rose-500 hover:bg-rose-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {options.confirmLabel ?? 'OK'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
};

export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
