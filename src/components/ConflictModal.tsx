import React from 'react';
import { AlertTriangle, Clock, User, Check, X } from 'lucide-react';
import { ShiftSlot, ShiftType } from '../api/types';
import { formatDuration, shiftMinutes } from '../utils/hours';
import { Modal } from './Modal';

interface ConflictModalProps {
  isOpen: boolean;
  previousRecord: ShiftSlot | null;
  newSubmission: {
    employeeName: string;
    date: string;
    shift: ShiftType;
    inTime: string;
    outTime: string;
  };
  /** Staff may only replace their own shift; the server enforces this too. */
  canOverwrite: boolean;
  onCancel: () => void;
  onConfirmOverwrite: () => void;
  isSubmitting?: boolean;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({
  isOpen,
  previousRecord,
  newSubmission,
  canOverwrite,
  onCancel,
  onConfirmOverwrite,
  isSubmitting = false,
}) => {
  if (!isOpen || !previousRecord) return null;

  return (
    <Modal title="Shift Record Conflict" onClose={onCancel}>
      <div id="conflict-modal-card" className="space-y-5">
        <div className="flex items-center gap-3 text-amber-400 border-b border-slate-800 pb-4">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400" aria-hidden="true" />
          </div>
          <p className="text-xs text-slate-300">
            Already logged for {newSubmission.date} ({newSubmission.shift} Shift)
          </p>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          {canOverwrite
            ? 'This shift is already logged with different details. Review both and confirm before replacing it:'
            : "This shift is already logged under someone else's name. Only a manager can replace it."}
        </p>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-950/90 border border-amber-500/30 p-3.5 rounded-2xl space-y-2">
            <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              In the sheet
            </span>
            <div className="space-y-1">
              <p className="font-bold text-white flex items-center gap-1.5 text-sm break-words">
                <User className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                {previousRecord.name || '(no name)'}
              </p>
              <p className="text-slate-300 flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                {previousRecord.inTime || '--:--'} - {previousRecord.outTime || '--:--'}
              </p>
              <p className="text-[11px] text-amber-400/90 font-bold">
                {formatDuration(shiftMinutes(previousRecord.inTime, previousRecord.outTime))} worked
              </p>
            </div>
          </div>

          <div className="bg-emerald-950/40 border border-emerald-500/40 p-3.5 rounded-2xl space-y-2">
            <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              New Submission
            </span>
            <div className="space-y-1">
              <p className="font-bold text-white flex items-center gap-1.5 text-sm break-words">
                <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                {newSubmission.employeeName}
              </p>
              <p className="text-slate-200 flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                {newSubmission.inTime} - {newSubmission.outTime}
              </p>
              <p className="text-[11px] text-emerald-400 font-bold">
                {formatDuration(shiftMinutes(newSubmission.inTime, newSubmission.outTime))} worked
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            id="cancel-overwrite-btn"
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 min-h-12 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-300 font-bold text-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
          >
            <X className="w-4 h-4" aria-hidden="true" /> {canOverwrite ? 'Cancel' : 'Close'}
          </button>
          {canOverwrite && (
            <button
              id="confirm-overwrite-btn"
              type="button"
              onClick={onConfirmOverwrite}
              disabled={isSubmitting}
              className="flex-1 min-h-12 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-amber-950/50 transition-all active:scale-95 disabled:opacity-50"
            >
              <Check className="w-4 h-4" aria-hidden="true" /> Overwrite
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
