import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useUiStore } from '../store/uiStore';

export default function Toast() {
  const toast = useUiStore((s) => s.toast);
  const clearToast = useUiStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(clearToast, 4000);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-medium shadow-2xl ${
            toast.kind === 'error'
              ? 'bg-bordo-600 text-cream-50'
              : 'bg-night-700 text-cream-100 border border-gold-500/30'
          }`}
        >
          {toast.message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
