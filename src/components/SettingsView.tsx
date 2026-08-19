import React, { useState } from 'react';
import {
  Settings,
  DollarSign,
  Car,
  MessageSquare,
  Shield,
  Layers,
  Save,
  CheckCircle2,
  Code,
  Key,
  Globe,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, addToast, currentUser } = useApp();

  const rates = settings?.serviceCategoriesRates || {};

  const [kmRate, setKmRate] = useState(settings?.kmReimbursementRate ?? settings?.kmRateDefault ?? 1.2);
  const [fixedAllowance, setFixedAllowance] = useState(settings?.fixedCostAllowance ?? 250.0);
  const [defaultTaxRate, setDefaultTaxRate] = useState(settings?.defaultTaxDeductionRate ?? settings?.defaultSpecialTaxRate ?? 6.0);

  // WhatsApp
  const [waProvider, setWaProvider] = useState(settings?.whatsappProvider || 'EVOLUTION_API');
  const [waEndpoint, setWaEndpoint] = useState(settings?.whatsappApiEndpoint || settings?.whatsappApiUrl || '');
  const [waKey, setWaKey] = useState(settings?.whatsappApiKey || '');
  const [waInstance, setWaInstance] = useState(settings?.whatsappInstanceName || '');
  const [waTemplate, setWaTemplate] = useState(settings?.whatsappTemplateMessage || '');

  // Porto Service Category Rates
  const [sofaRate, setSofaRate] = useState(rates['Higienização de Sofá 3 Lugares'] || 140.0);
  const [impermeabRate, setImpermeabRate] = useState(rates['Impermeabilização de Estofado'] || 190.0);
  const [autoRate, setAutoRate] = useState(rates['Higienização Automotiva Completa'] || 160.0);
  const [colchaoRate, setColchaoRate] = useState(rates['Higienização de Colchão Queen'] || 150.0);
  const [tapeteRate, setTapeteRate] = useState(rates['Higienização de Tapetes e Carpetes'] || 175.0);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    updateSettings({
      kmReimbursementRate: Number(kmRate),
      fixedCostAllowance: Number(fixedAllowance),
      defaultTaxDeductionRate: Number(defaultTaxRate),
      whatsappProvider: waProvider,
      whatsappApiEndpoint: waEndpoint,
      whatsappApiKey: waKey,
      whatsappInstanceName: waInstance,
      whatsappTemplateMessage: waTemplate,
      serviceCategoriesRates: {
        'Higienização de Sofá 3 Lugares': Number(sofaRate),
        'Impermeabilização de Estofado': Number(impermeabRate),
        'Higienização Automotiva Completa': Number(autoRate),
        'Higienização de Colchão Queen': Number(colchaoRate),
        'Higienização de Tapetes e Carpetes': Number(tapeteRate),
      },
    });

    addToast('Configurações Salvas', 'Os parâmetros do motor financeiro e WhatsApp foram atualizados com sucesso.', 'success');
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#003366] tracking-tight">
            Configurações do Sistema & Parâmetros do Motor Financeiro
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Defina taxas de repasse Porto Seguro, valores por KM, regras fiscais e credenciais da API do WhatsApp.
          </p>
        </div>

        {currentUser.role === 'ADMIN' && (
          <button
            type="submit"
            className="flex items-center space-x-1.5 px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold rounded-lg shadow-sm transition-all"
          >
            <Save className="h-4 w-4 text-cyan-400" />
            <span>Salvar Alterações</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Financial & Rates */}
        <div className="space-y-6">
          
          {/* Parametros de KM e Ajuda */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4 text-xs">
            <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
              <Car className="h-4 w-4 text-[#003366]" />
              <h2 className="text-sm font-bold text-slate-800">
                Parâmetros de Deslocamento & Taxas Gerais
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">
                  Reembolso de KM Rodado (R$/KM):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                  <input
                    type="number"
                    step="0.05"
                    value={kmRate}
                    onChange={(e) => setKmRate(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">
                  Ajuda de Custo Fixa por Quinzena (R$):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                  <input
                    type="number"
                    step="5"
                    value={fixedAllowance}
                    onChange={(e) => setFixedAllowance(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Special Tax Exemption Default */}
            <div className="p-3 bg-amber-50/80 rounded-lg border border-amber-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-900 flex items-center space-x-1">
                  <Layers className="h-3.5 w-3.5 text-amber-600" />
                  <span>Alíquota de Dedução Fiscal da Regra de Exceção (%)</span>
                </span>
                <input
                  type="number"
                  step="0.5"
                  value={defaultTaxRate}
                  onChange={(e) => setDefaultTaxRate(Number(e.target.value))}
                  className="w-20 p-1 bg-white border border-amber-300 rounded text-xs font-bold text-center"
                />
              </div>
              <p className="text-[10px] text-amber-800">
                Aplicável apenas aos 2 técnicos selecionados na base de dados com a flag ativa.
              </p>
            </div>
          </div>

          {/* Taxas Fixas por Categoria de Serviço Porto Seguro */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4 text-xs">
            <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
              <Shield className="h-4 w-4 text-[#003366]" />
              <h2 className="text-sm font-bold text-slate-800">
                Taxas Fixas de Repasse por Categoria (Porto Seguro)
              </h2>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">Higienização de Sofá 3 Lugares:</span>
                <div className="w-28 relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                  <input
                    type="number"
                    value={sofaRate}
                    onChange={(e) => setSofaRate(Number(e.target.value))}
                    className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">Impermeabilização de Estofado:</span>
                <div className="w-28 relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                  <input
                    type="number"
                    value={impermeabRate}
                    onChange={(e) => setImpermeabRate(Number(e.target.value))}
                    className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">Higienização Automotiva Completa:</span>
                <div className="w-28 relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                  <input
                    type="number"
                    value={autoRate}
                    onChange={(e) => setAutoRate(Number(e.target.value))}
                    className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">Higienização de Colchão Queen:</span>
                <div className="w-28 relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                  <input
                    type="number"
                    value={colchaoRate}
                    onChange={(e) => setColchaoRate(Number(e.target.value))}
                    className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">Higienização de Tapetes e Carpetes:</span>
                <div className="w-28 relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                  <input
                    type="number"
                    value={tapeteRate}
                    onChange={(e) => setTapeteRate(Number(e.target.value))}
                    className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: WhatsApp Integration */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4 text-xs">
            <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-800">
                Integração API WhatsApp (Evolution / Z-API / Baileys)
              </h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Provedor de API WhatsApp:</label>
                <select
                  value={waProvider}
                  onChange={(e) => setWaProvider(e.target.value as any)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                >
                  <option value="EVOLUTION_API">Evolution API (Recomendado)</option>
                  <option value="Z_API">Z-API Gateway</option>
                  <option value="BAILEYS">Baileys Node Library</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">API Endpoint URL:</label>
                <input
                  type="text"
                  value={waEndpoint}
                  onChange={(e) => setWaEndpoint(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Nome da Instância:</label>
                  <input
                    type="text"
                    value={waInstance}
                    onChange={(e) => setWaInstance(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">API Key / Token:</label>
                  <input
                    type="password"
                    value={waKey}
                    onChange={(e) => setWaKey(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">
                  Template da Mensagem com Variáveis Dinâmicas:
                </label>
                <textarea
                  rows={6}
                  value={waTemplate}
                  onChange={(e) => setWaTemplate(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono leading-relaxed"
                />
                <div className="text-[10px] text-slate-400 mt-1">
                  Tags: <code className="bg-slate-100 px-1 rounded">&#123;NOME_TECNICO&#125;</code>, <code className="bg-slate-100 px-1 rounded">&#123;PERIODO&#125;</code>, <code className="bg-slate-100 px-1 rounded">&#123;VALOR_LIQUIDO&#125;</code>, <code className="bg-slate-100 px-1 rounded">&#123;CHAVE_PIX&#125;</code>, <code className="bg-slate-100 px-1 rounded">&#123;QTD_OS&#125;</code>.
                </div>
              </div>
            </div>
          </div>

          {/* Company Brand identity */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 space-y-2">
            <div className="flex items-center space-x-2 text-[#003366] font-bold">
              <Globe className="h-4 w-4" />
              <span>Identidade Visual: O Higienizador (ohigienizador.com.br)</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Paleta High Density aplicada: Deep Navy (#003366), Cyan (#00A3E0), Emerald (#10B981) e Neutros Cristalinos (Slate-50).
            </p>
          </div>

        </div>

      </div>

    </form>
  );
};
