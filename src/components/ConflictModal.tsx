import React from 'react';
import { AlertTriangle, Clock, User, Check, X } from 'lucide-react';
import { ShiftRecord } from '../types';

interface ConflictModalProps {
  isOpen: boolean;
  previousRecord: ShiftRecord | null;
  newSubmission: {
    employeeName: string;
    date: string;
    shift: 'Morning' | 'Evening';
    inTime: string;
    outTime: string;
    totalHours: number;
  } | null;
  onCancel: () => void;
  onConfirmOverwrite: () => void;
  isSubmitting?: boolean;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({
  isOpen,
  previousRecord,
  newSubmission,
  onCancel,
  onConfirmOverwrite,
  isSubmitting = false,
}) => {
  if (!isOpen || !previousRecord || !newSubmission) return null;

  return (
    <div id="conflict-modal-overlay" className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div id="conflict-modal-card" className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl shadow-slate-950">
        
        {/* Header */}
        <div className="flex items-center gap-3 text-amber-400 border-b border-slate-800 pb-4">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="font-extrabold text-lg text-white leading-tight">Shift Record Conflict</h3>
            <p className="text-xs text-slate-400">Existing data detected for {newSubmission.date} ({newSubmission.shift} Shift)</p>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          A shift record is already logged for this date and shift with different details. Please review and confirm if you want to overwrite:
        </p>

        {/* Side-by-Side Comparison */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* Previous Data */}
          <div className="bg-slate-950/90 border border-amber-500/30 p-3.5 rounded-2xl space-y-2">
            <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Previous Data
            </span>
            <div className="space-y-1">
              <p className="font-bold text-white flex items-center gap-1.5 text-sm">
                <User className="w-3.5 h-3.5 text-amber-400" />
                {previousRecord.employeeName}
              </p>
              <p className="text-slate-300 flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {previousRecord.inTime} - {previousRecord.outTime}
              </p>
              <p className="text-[11px] text-amber-400/90 font-bold">
                {previousRecord.totalHours} hrs worked
              </p>
            </div>
          </div>

          {/* New Submission */}
          <div className="bg-emerald-950/40 border border-emerald-500/40 p-3.5 rounded-2xl space-y-2">
            <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              New Submission
            </span>
            <div className="space-y-1">
              <p className="font-bold text-white flex items-center gap-1.5 text-sm">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                {newSubmission.employeeName}
              </p>
              <p className="text-slate-200 flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {newSubmission.inTime} - {newSubmission.outTime}
              </p>
              <p className="text-[11px] text-emerald-400 font-bold">
                {newSubmission.totalHours} hrs worked
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            id="cancel-overwrite-btn"
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-300 font-bold text-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
          <button
            id="confirm-overwrite-btn"
            type="button"
            onClick={onConfirmOverwrite}
            disabled={isSubmitting}
            className="flex-1 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-amber-950/50 transition-all active:scale-95 disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> Overwrite
          </button>
        </div>

      </div>
    </div>
  );
};
