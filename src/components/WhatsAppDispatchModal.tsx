import React, { useState } from 'react';
import {
  Send,
  X,
  FileText,
  Smartphone,
  CheckCircle,
  AlertCircle,
  Code,
  Download,
  Share2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TechnicianClosingSummary } from '../types';
import { WhatsAppService } from '../services/whatsappService';

interface WhatsAppDispatchModalProps {
  summary: TechnicianClosingSummary;
  onClose: () => void;
  onConfirmDispatch: () => Promise<void>;
}

export const WhatsAppDispatchModal: React.FC<WhatsAppDispatchModalProps> = ({
  summary,
  onClose,
  onConfirmDispatch,
}) => {
  const { currentClosing, settings, generatePdfForTechnician } = useApp();
  const [isSending, setIsSending] = useState(false);
  const [showPayload, setShowPayload] = useState(false);

  const formattedMessage = WhatsAppService.formatMessage(
    settings?.whatsappTemplateMessage || '',
    summary,
    currentClosing
  );

  let cleanPhone = (summary?.technicianPhone || '').replace(/\D/g, '');
  if (cleanPhone.length === 10 || cleanPhone.length === 11) {
    cleanPhone = `55${cleanPhone}`;
  }

  const payloadExample = {
    instance: settings?.whatsappInstanceName || 'higienizador-prod',
    number: cleanPhone,
    mediatype: 'document',
    mimetype: 'application/pdf',
    fileName: `Extrato_Quinzenal_${(summary?.technicianName || 'Tecnico').replace(/\s+/g, '_')}.pdf`,
    caption: formattedMessage,
  };

  const handleSend = async () => {
    setIsSending(true);
    try {
      await onConfirmDispatch();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-emerald-50/50 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Send className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Disparo de Extrato via WhatsApp
              </h2>
              <p className="text-xs text-slate-500">
                Integração com Evolution API / Z-API / Baileys
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          
          {/* Recipient Card */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Destinatário:</span>
              <strong className="text-slate-900 text-sm">{summary?.technicianName || 'Técnico'}</strong>
              <div className="text-slate-500 font-mono mt-0.5">
                +{cleanPhone} ({summary?.technicianPhone || ''})
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Valor Líquido:</span>
              <span className="text-base font-black text-emerald-600">
                R$ {(summary?.netTotal || 0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* WhatsApp Message Preview */}
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              Pré-visualização da Mensagem (com PDF anexo):
            </label>
            <div className="p-4 bg-[#EFEAE2] rounded-2xl border border-slate-300/80 shadow-inner font-sans space-y-2">
              <div className="bg-white p-3 rounded-xl shadow-xs max-w-sm rounded-tl-none text-slate-800 text-[11px] leading-relaxed">
                
                {/* PDF Attachment representation */}
                <div className="p-2.5 bg-slate-100 rounded-lg border border-slate-200 flex items-center space-x-2 mb-2">
                  <FileText className="h-5 w-5 text-red-500" />
                  <div className="overflow-hidden">
                    <span className="font-bold text-slate-900 truncate block">
                      Extrato_Quinzenal_{(summary?.technicianName || 'Tecnico').replace(/\s+/g, '_')}.pdf
                    </span>
                    <span className="text-[9px] text-slate-400">Documento Oficial • Não Editável</span>
                  </div>
                </div>

                <p className="whitespace-pre-line">{formattedMessage}</p>

                <div className="text-[9px] text-slate-400 text-right mt-1.5 flex items-center justify-end space-x-1">
                  <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-sky-500 font-bold">✓✓</span>
                </div>
              </div>
            </div>
          </div>

          {/* Toggle JSON REST Payload */}
          <div>
            <button
              onClick={() => setShowPayload(!showPayload)}
              className="text-[11px] text-sky-600 hover:underline font-semibold flex items-center space-x-1"
            >
              <Code className="h-3.5 w-3.5" />
              <span>{showPayload ? 'Ocultar JSON da API' : 'Ver Payload JSON da Evolution API'}</span>
            </button>

            {showPayload && (
              <pre className="mt-2 p-3 bg-slate-900 text-slate-200 rounded-xl text-[10px] font-mono overflow-x-auto border border-slate-800">
                {JSON.stringify(payloadExample, null, 2)}
              </pre>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => generatePdfForTechnician(summary)}
            className="flex items-center space-x-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Baixar PDF Manualmente</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl text-xs"
            >
              Cancelar
            </button>
            <button
              onClick={handleSend}
              disabled={isSending}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow flex items-center space-x-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{isSending ? 'Enviando...' : 'Confirmar e Disparar'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
