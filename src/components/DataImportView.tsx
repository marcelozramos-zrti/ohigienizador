import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Users,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
  Download,
  DollarSign,
  ShieldCheck,
  Info,
  Check,
  FileText,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { ApiService } from '../services/apiService';

export const DataImportView: React.FC = () => {
  const { addToast, reloadAllData, setActiveTab } = useApp();

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>('');

  const [importResult, setImportResult] = useState<{
    success: boolean;
    message?: string;
    importedCount?: number;
    techniciansCreated?: number;
    ignoredRowsCount?: number;
    createdTechnicians?: Array<{ id: string; name: string; email: string }>;
    sampleOrders?: any[];
    error?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = (file: File) => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValid) {
      addToast(
        'Arquivo Inválido',
        'Por favor, selecione um arquivo de planilha no formato .xlsx, .xls ou .csv.',
        'error'
      );
      return;
    }

    setSelectedFile(file);
    setImportResult(null);
  };

  const handleExecuteImport = async () => {
    if (!selectedFile) {
      addToast('Nenhum arquivo', 'Selecione uma planilha antes de iniciar a importação.', 'warning');
      return;
    }

    setIsProcessing(true);
    setProgressStatus('Lendo planilha e sanitizando dados...');
    setImportResult(null);

    try {
      setTimeout(() => {
        if (isProcessing) {
          setProgressStatus('Identificando técnicos e calculando taxas financeiras...');
        }
      }, 700);

      const res = await ApiService.importOrdersSpreadsheet(selectedFile);

      if (res.success) {
        setImportResult(res);
        addToast(
          'Importação Concluída com Sucesso!',
          `${res.importedCount || 0} ordens importadas e ${res.techniciansCreated || 0} técnicos criados no MariaDB.`,
          'success'
        );
        // Recarrega todos os dados do banco de dados na aplicação
        await reloadAllData();
      } else {
        setImportResult(res);
        addToast('Falha na Importação', res.error || 'Erro ao processar planilha.', 'error');
      }
    } catch (err: any) {
      setImportResult({
        success: false,
        error: err.message || 'Ocorreu um erro inesperado durante a importação.',
      });
      addToast('Erro na Importação', err.message || 'Falha de comunicação.', 'error');
    } finally {
      setIsProcessing(false);
      setProgressStatus('');
    }
  };

  const handleDownloadTemplate = () => {
    try {
      const sampleData = [
        {
          Origem: 'Porto Seguro',
          IdChamado: 'PS-2026-8001',
          'Dt.Visita': '20/08/2026',
          'Tipo Visita': 'Higienização de Sofá 3 Lugares',
          Status: 'Concluído',
          Tecnico: 'Carlos Eduardo Oliveira',
          KM: 24,
          PEDAGIO: 'R$ 16,80',
          'VALOR DA VISTA': 'R$ 180,00',
        },
        {
          Origem: 'Porto Seguro',
          IdChamado: 'PS-2026-8002',
          'Dt.Visita': '21/08/2026',
          'Tipo Visita': 'Impermeabilização de Poltronas',
          Status: 'Concluído',
          Tecnico: 'Marcos Vinicius Santos',
          KM: 45,
          PEDAGIO: 'R$ 28,40',
          'VALOR DA VISTA': 'R$ 220,00',
        },
        {
          Origem: 'Porto Seguro',
          IdChamado: 'PS-2026-8003',
          'Dt.Visita': '22/08/2026',
          'Tipo Visita': 'Higienização de Colchão Casal',
          Status: 'Concluído',
          Tecnico: 'Roberto Silveira Lima',
          KM: 12,
          PEDAGIO: 'R$ 0,00',
          'VALOR DA VISTA': 'R$ 150,00',
        },
        {
          Origem: 'Totais',
          IdChamado: '',
          'Dt.Visita': '',
          'Tipo Visita': '',
          Status: '',
          Tecnico: 'Total Geral',
          KM: 81,
          PEDAGIO: 'R$ 45,20',
          'VALOR DA VISTA': 'R$ 550,00',
        },
      ];

      const ws = XLSX.utils.json_to_sheet(sampleData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Fechamento Porto Seguro');

      XLSX.writeFile(wb, 'Modelo_Importacao_Porto_Seguro.xlsx');
      addToast('Modelo Baixado', 'Arquivo Modelo_Importacao_Porto_Seguro.xlsx gerado com sucesso.', 'success');
    } catch (err: any) {
      addToast('Erro ao Baixar Modelo', err.message, 'error');
    }
  };

  return (
    <div id="data-import-view" className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Principal */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-blue-50 text-blue-700">
              <FileSpreadsheet className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Importação Massiva de Ordens de Serviço
            </h1>
          </div>
          <p className="text-sm text-slate-600">
            Importe o histórico financeiro e operacional de atendimentos através das planilhas de fechamento da Porto Seguro (.xlsx).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="btn-download-template"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Baixar Modelo Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Regras e Especificações da Importação */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
          <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Sanitização Inteligente</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Linhas de "Totais", "Vale", "Líquido" ou "Bruto" e linhas vazias são filtradas automaticamente. Formatações de moeda (R$) são convertidas com precisão.
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg shrink-0 mt-0.5">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Auto-Cadastro de Técnicos</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Técnicos identificados na planilha que ainda não estejam cadastrados no MariaDB são criados dinamicamente com perfil e e-mail único.
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
          <div className="p-2 bg-amber-50 text-amber-700 rounded-lg shrink-0 mt-0.5">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Cálculo Financeiro Automatizado</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Calcula R$ 0,50 por KM rodado, soma os pedágios e a taxa base da visita, integrando diretamente ao fechamento quinzenal.
            </p>
          </div>
        </div>
      </div>

      {/* Área de Upload Drag & Drop */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-blue-600" />
          Selecione ou Arraste a Planilha da Porto Seguro
        </h2>

        <div
          id="dropzone-import-orders"
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-blue-500 bg-blue-50/50 scale-[1.005]'
              : selectedFile
              ? 'border-emerald-400 bg-emerald-50/30'
              : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center space-y-3">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center ${
                selectedFile
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {selectedFile ? (
                <FileText className="w-7 h-7" />
              ) : (
                <UploadCloud className="w-7 h-7" />
              )}
            </div>

            {selectedFile ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB &bull; Pronto para importar
                </p>
                <span className="inline-block mt-2 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-medium rounded-full">
                  Arquivo Carregado
                </span>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-700">
                  <span className="font-semibold text-blue-600 hover:underline">
                    Clique para escolher um arquivo
                  </span>{' '}
                  ou arraste e solte aqui
                </p>
                <p className="text-xs text-slate-500">
                  Formatos aceitos: Microsoft Excel (.xlsx, .xls) ou CSV
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Botão de Ação */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-slate-400 shrink-0" />
            <span>O processo realiza validação de integridade e gravação direta no MariaDB.</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {selectedFile && (
              <button
                id="btn-clear-file"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                  setImportResult(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isProcessing}
                className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Limpar
              </button>
            )}

            <button
              id="btn-start-import"
              type="button"
              onClick={handleExecuteImport}
              disabled={!selectedFile || isProcessing}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white shadow-sm transition-all ${
                !selectedFile || isProcessing
                  ? 'bg-slate-400 cursor-not-allowed opacity-70'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-blue-500/20'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{progressStatus || 'Processando Planilha...'}</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>Processar e Importar Planilha</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Feedback / Resultado da Importação */}
      <AnimatePresence>
        {importResult && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`p-6 rounded-xl border shadow-sm space-y-6 ${
              importResult.success
                ? 'bg-emerald-50/60 border-emerald-200'
                : 'bg-red-50/60 border-red-200'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`p-3 rounded-xl shrink-0 ${
                  importResult.success
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                    : 'bg-red-500 text-white shadow-md shadow-red-500/20'
                }`}
              >
                {importResult.success ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <AlertTriangle className="w-6 h-6" />
                )}
              </div>

              <div className="space-y-1 flex-1">
                <h3
                  className={`text-lg font-bold ${
                    importResult.success ? 'text-emerald-950' : 'text-red-950'
                  }`}
                >
                  {importResult.success
                    ? 'Importação Concluída com Sucesso!'
                    : 'Falha no Processamento da Planilha'}
                </h3>
                <p
                  className={`text-sm ${
                    importResult.success ? 'text-emerald-800' : 'text-red-800'
                  }`}
                >
                  {importResult.message || importResult.error}
                </p>
              </div>
            </div>

            {importResult.success && (
              <>
                {/* Resumo em Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="bg-white p-4 rounded-lg border border-emerald-200/80 shadow-xs">
                    <p className="text-xs font-medium text-slate-500">Ordens de Serviço Importadas</p>
                    <p className="text-2xl font-bold text-emerald-700 mt-1">
                      {importResult.importedCount || 0}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Gravadas/atualizadas no MariaDB</p>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-emerald-200/80 shadow-xs">
                    <p className="text-xs font-medium text-slate-500">Novos Técnicos Criados</p>
                    <p className="text-2xl font-bold text-indigo-700 mt-1">
                      {importResult.techniciansCreated || 0}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Cadastrados automaticamente</p>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-emerald-200/80 shadow-xs">
                    <p className="text-xs font-medium text-slate-500">Linhas de Totais Ignoradas</p>
                    <p className="text-2xl font-bold text-slate-700 mt-1">
                      {importResult.ignoredRowsCount || 0}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Sanitizadas com sucesso</p>
                  </div>
                </div>

                {/* Novos Técnicos Cadastrados */}
                {importResult.createdTechnicians && importResult.createdTechnicians.length > 0 && (
                  <div className="bg-white p-4 rounded-lg border border-emerald-200/80 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-600" />
                      Novos Técnicos Adicionados ao Sistema ({importResult.createdTechnicians.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {importResult.createdTechnicians.map((tech) => (
                        <div
                          key={tech.id}
                          className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-0.5"
                        >
                          <p className="font-semibold text-slate-900">{tech.name}</p>
                          <p className="text-slate-500">{tech.email}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Amostra das Ordens Importadas */}
                {importResult.sampleOrders && importResult.sampleOrders.length > 0 && (
                  <div className="bg-white p-4 rounded-lg border border-emerald-200/80 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-600" />
                      Amostra das Ordens Processadas
                    </h4>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">Chamado</th>
                            <th className="py-2 px-3">Técnico</th>
                            <th className="py-2 px-3">Taxa Base</th>
                            <th className="py-2 px-3">KM Rodado</th>
                            <th className="py-2 px-3">Custo KM</th>
                            <th className="py-2 px-3">Pedágio</th>
                            <th className="py-2 px-3">Total Bruto</th>
                            <th className="py-2 px-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {importResult.sampleOrders.map((ord, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/80">
                              <td className="py-2 px-3 font-semibold text-slate-900">{ord.callNumber}</td>
                              <td className="py-2 px-3 text-slate-700">{ord.technicianName}</td>
                              <td className="py-2 px-3 text-slate-700">R$ {Number(ord.baseServiceFee || 0).toFixed(2)}</td>
                              <td className="py-2 px-3 text-slate-700">{ord.kmTraveled} km</td>
                              <td className="py-2 px-3 text-slate-700">R$ {Number(ord.kmTotalCost || 0).toFixed(2)}</td>
                              <td className="py-2 px-3 text-slate-700">R$ {Number(ord.tollCost || 0).toFixed(2)}</td>
                              <td className="py-2 px-3 font-semibold text-emerald-700">R$ {Number(ord.totalGross || 0).toFixed(2)}</td>
                              <td className="py-2 px-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800">
                                  {ord.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Botões de Ação Pós-Importação */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    id="btn-go-to-orders"
                    type="button"
                    onClick={() => setActiveTab('orders')}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
                  >
                    <span>Ver Ordens de Serviço</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    id="btn-go-to-technicians"
                    type="button"
                    onClick={() => setActiveTab('technicians')}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <Users className="w-4 h-4 text-slate-500" />
                    <span>Ver Técnicos Cadastrados</span>
                  </button>

                  <button
                    id="btn-go-to-finance"
                    type="button"
                    onClick={() => setActiveTab('finance')}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <DollarSign className="w-4 h-4 text-slate-500" />
                    <span>Ver Fechamento Quinzenal</span>
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Guia de Mapeamento de Colunas */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <Info className="w-5 h-5 text-slate-500" />
          Mapeamento das Colunas da Planilha Porto Seguro
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { col: 'Origem', desc: 'Identificação da origem (ex: Porto Seguro)', req: true },
            { col: 'IdChamado', desc: 'Identificador único do atendimento (callNumber)', req: true },
            { col: 'Dt.Visita', desc: 'Data da realização do serviço', req: true },
            { col: 'Tipo Visita', desc: 'Categoria/Tipo do serviço executado', req: true },
            { col: 'Status', desc: 'Situação (Concluído, Cancelado, etc.)', req: false },
            { col: 'Tecnico', desc: 'Nome do prestador (criação automática se novo)', req: true },
            { col: 'KM', desc: 'Quilometragem percorrida (R$ 0,50/km)', req: false },
            { col: 'PEDAGIO', desc: 'Custos com pedágio comprovados', req: false },
            { col: 'VALOR DA VISTA', desc: 'Taxa base acordada para a visita', req: true },
          ].map((item, i) => (
            <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-blue-700">{item.col}</span>
                {item.req ? (
                  <span className="text-[10px] text-amber-600 font-semibold">Obrigatório</span>
                ) : (
                  <span className="text-[10px] text-slate-400">Opcional</span>
                )}
              </div>
              <p className="text-xs text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
