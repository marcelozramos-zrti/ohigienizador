import React, { useState } from 'react';
import {
  Users,
  Shield,
  Percent,
  CheckCircle2,
  Phone,
  Mail,
  Edit2,
  DollarSign,
  PlusCircle,
  AlertCircle,
  Layers,
  Key,
  CreditCard,
  Sliders,
  Check,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { User } from '../types';

export const TechniciansView: React.FC = () => {
  const { users = [], toggleSpecialTaxRule, updateUser, addToast } = useApp();

  const [editingTech, setEditingTech] = useState<User | null>(null);
  const [editAllowance, setEditAllowance] = useState<number>(250);
  const [editTaxRate, setEditTaxRate] = useState<number>(16);

  const safeUsers = users || [];
  const technicians = safeUsers.filter((u) => u && u.role === 'TECHNICIAN');
  const specialRuleCount = technicians.filter((t) => t && t.hasSpecialTaxRule).length;

  const handleOpenEdit = (tech: User) => {
    setEditingTech(tech);
    setEditAllowance(tech.baseCostAllowance ?? 250);
    setEditTaxRate(tech.specialTaxRate ?? 16);
  };

  const handleSaveEdit = () => {
    if (!editingTech) return;
    updateUser(editingTech.id, {
      baseCostAllowance: Number(editAllowance),
      specialTaxRate: Number(editTaxRate),
    });
    addToast(
      'Parâmetros Atualizados',
      `Configurações financeiras de ${editingTech.name} salvas com sucesso (Ajuda de Custo: R$ ${editAllowance.toFixed(2)}, Taxa: ${editTaxRate}%).`,
      'success'
    );
    setEditingTech(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#003366] tracking-tight">
            Gestão de Técnicos & Parâmetros Financeiros
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastro de profissionais parceiros, dados PIX, ajuda de custo fixa (R$ 250,00) e parametrização de exceção fiscal (16%).
          </p>
        </div>
      </div>

      {/* Special Rule Notice Banner */}
      <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 flex items-start space-x-3 shadow-xs">
        <Layers className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <strong className="font-bold block text-sm">
            Regra de Exceção Fiscal das Planilhas ({specialRuleCount} Técnico(s) com Retenção Ativa)
          </strong>
          <p className="mt-0.5 text-amber-800 leading-relaxed">
            Conforme a engenharia reversa das planilhas, técnicos como <strong>Robertinho</strong> possuem a flag de exceção fiscal com retenção de <strong>16%</strong> sobre o valor bruto (Ex: R$ 3.940,00 bruto - 16% [R$ 630,40] = R$ 3.309,60 líquido). Demais técnicos operam sem retenção fiscal. Todos recebem a <strong>Ajuda de Custo de R$ 250,00</strong> somada ao final.
          </p>
        </div>
      </div>

      {/* Technicians High Density Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Técnico / Parceiro</th>
                <th className="py-3 px-4">Contato / WhatsApp</th>
                <th className="py-3 px-4">Chave PIX Cadastrada</th>
                <th className="py-3 px-4">Ajuda de Custo Fixa</th>
                <th className="py-3 px-4 text-center">Regra Fiscal Especial</th>
                <th className="py-3 px-4">Status de Campo</th>
                <th className="py-3 px-4 text-right">Parâmetros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {technicians.map((tech) => (
                <tr key={tech.id} className="hover:bg-slate-50/70 transition-colors">
                  
                  {/* Name and email */}
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900 flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-full bg-[#003366] text-white flex items-center justify-center font-bold text-xs">
                        {tech.name.charAt(0)}
                      </div>
                      <span className="font-bold">{tech.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{tech.email}</div>
                  </td>

                  {/* Phone */}
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-700 flex items-center space-x-1">
                      <Phone className="h-3 w-3 text-slate-400" />
                      <span>{tech.phone}</span>
                    </div>
                  </td>

                  {/* PIX Key */}
                  <td className="py-3.5 px-4">
                    <div className="font-mono text-slate-800 font-bold bg-slate-100 px-2 py-0.5 rounded inline-block text-[11px]">
                      {tech.pixKey || 'Não informada'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Tipo: {tech.pixKeyType || 'CPF'} {tech.bankName ? `(${tech.bankName})` : ''}
                    </div>
                  </td>

                  {/* Ajuda de Custo */}
                  <td className="py-3.5 px-4">
                    <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      R$ {(tech.baseCostAllowance ?? 250.0).toFixed(2)}
                    </span>
                  </td>

                  {/* Special Tax Exemption Toggle */}
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={() => toggleSpecialTaxRule(tech.id)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                        tech.hasSpecialTaxRule
                          ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 shadow-xs'
                          : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                      }`}
                      title="Clique para alternar a flag de exceção fiscal"
                    >
                      {tech.hasSpecialTaxRule
                        ? `Ativa (${tech.specialTaxRate || 16}% Retenção)`
                        : 'Padrão (Isento)'}
                    </button>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[9px] uppercase tracking-wider">
                      ATIVO EM CAMPO
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => handleOpenEdit(tech)}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-cyan-700 hover:bg-cyan-50 border border-slate-200 transition-colors inline-flex items-center space-x-1 cursor-pointer"
                      title="Editar parâmetros individuais do técnico"
                    >
                      <Sliders className="h-3.5 w-3.5 text-[#003366]" />
                      <span className="text-[11px] font-bold">Editar</span>
                    </button>
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Edição de Parâmetros do Técnico */}
      {editingTech && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-[#003366]">
                  Parâmetros de {editingTech.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Ajuste a ajuda de custo quinzenal e a alíquota fiscal.
                </p>
              </div>
              <button
                onClick={() => setEditingTech(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Ajuda de Custo Fixa Quinzenal (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                  <input
                    type="number"
                    step="10"
                    value={editAllowance}
                    onChange={(e) => setEditAllowance(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>
                <span className="text-[10px] text-slate-400">Padrão das planilhas: R$ 250,00</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Alíquota da Regra Fiscal Especial (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    value={editTaxRate}
                    onChange={(e) => setEditTaxRate(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">%</span>
                </div>
                <span className="text-[10px] text-slate-400">Padrão da exceção: 16,0% (ex: Robertinho)</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setEditingTech(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-lg bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold shadow-xs"
              >
                Salvar Parâmetros
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
