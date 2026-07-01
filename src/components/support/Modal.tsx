import React from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'success' | 'error' | 'info' | 'confirm';
  title: string;
  message: React.ReactNode;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  type,
  title,
  message,
  onConfirm,
  confirmText = 'OK',
  cancelText = 'Anuluj'
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-12 h-12 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-12 h-12 text-red-400" />;
      case 'info':
        return <Info className="w-12 h-12 text-blue-400" />;
      case 'confirm':
        return <AlertCircle className="w-12 h-12 text-orange-400" />;
      default:
        return <Info className="w-12 h-12 text-blue-400" />;
    }
  };

  const getColors = () => {
    switch (type) {
      case 'success':
        return 'border-green-500 bg-green-900/20';
      case 'error':
        return 'border-red-500 bg-red-900/20';
      case 'info':
        return 'border-blue-500 bg-blue-900/20';
      case 'confirm':
        return 'border-orange-500 bg-orange-900/20';
      default:
        return 'border-blue-500 bg-blue-900/20';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-2xl w-full max-w-md border border-slate-700 shadow-2xl">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center space-x-3">
              {getIcon()}
              <h3 className="text-xl font-bold text-white">{title}</h3>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors duration-200"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className={`rounded-lg p-4 mb-6 border ${getColors()}`}>
            <p className="text-white text-sm leading-relaxed">{message}</p>
          </div>

          <div className="flex space-x-3">
            {type === 'confirm' && onConfirm ? (
              <>
                <button
                  onClick={async () => {
                    onClose();
                    await onConfirm();
                  }}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg transition-colors duration-200"
                >
                  {confirmText}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 bg-slate-600 hover:bg-slate-700 text-white font-medium py-3 rounded-lg transition-colors duration-200"
                >
                  {cancelText}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors duration-200"
              >
                {confirmText}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;