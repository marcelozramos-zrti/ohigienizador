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
  Lock,
  RefreshCw,
  UserX,
  UserCheck,
  Fingerprint,
  Send,
  Copy,
  Smartphone,
  Search,
  Building,
  KeyRound,
  ShieldAlert,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { User, PixKeyType } from '../types';

export const TechniciansView: React.FC = () => {
  const {
    users = [],
    toggleSpecialTaxRule,
    updateTechnician,
    createUserAccount,
    resetUserPassword,
    revokeUserAccess,
    restoreUserAccess,
    deleteUserAccount,
    toggleUserMfa,
    addToast,
    currentUser,
  } = useApp();

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterRole, setFilterRole] = useState<'ALL' | 'TECHNICIAN' | 'ADMIN' | 'OPERATIONAL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'REVOKED' | 'SPECIAL_TAX' | 'MFA'>('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingTech, setEditingTech] = useState<User | null>(null);
  const [resetModalTech, setResetModalTech] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [generatedNewPass, setGeneratedNewPass] = useState<string>('');
  const [customPassInput, setCustomPassInput] = useState<string>('');

  // Form State for New User/Technician
  const [newFormData, setNewFormData] = useState({
    name: '',
    email: '',
    password: 'Porto@' + Math.floor(100 + Math.random() * 900),
    documentCpf: '',
    phone: '',
    role: 'TECHNICIAN' as User['role'],
    pixKeyType: 'CPF' as PixKeyType,
    pixKey: '',
    bankName: 'Banco Itaú',
    bankAgency: '0450',
    bankAccount: '',
    baseCostAllowance: 250,
    hasSpecialTaxRule: false,
    specialTaxRate: 16,
    mfaEnabled: false,
  });

  // Edit Form State
  const [editFormData, setEditFormData] = useState<{
    name: string;
    email: string;
    phone: string;
    documentCpf: string;
    role: User['role'];
    pixKeyType: PixKeyType;
    pixKey: string;
    bankName: string;
    bankAgency: string;
    bankAccount: string;
    baseCostAllowance: number;
    hasSpecialTaxRule: boolean;
    specialTaxRate: number;
    mfaEnabled: boolean;
  }>({
    name: '',
    email: '',
    phone: '',
    documentCpf: '',
    role: 'TECHNICIAN',
    pixKeyType: 'CPF',
    pixKey: '',
    bankName: '',
    bankAgency: '',
    bankAccount: '',
    baseCostAllowance: 250,
    hasSpecialTaxRule: false,
    specialTaxRate: 16,
    mfaEnabled: false,
  });

  const safeUsers = users || [];
  const techniciansCount = safeUsers.filter((u) => u && u.role === 'TECHNICIAN').length;
  const adminsCount = safeUsers.filter((u) => u && u.role === 'ADMIN').length;
  const opsCount = safeUsers.filter((u) => u && u.role === 'OPERATIONAL').length;
  const specialRuleCount = safeUsers.filter((t) => t && t.hasSpecialTaxRule).length;
  const activeCount = safeUsers.filter((t) => t && t.isActive).length;
  const mfaCount = safeUsers.filter((t) => t && t.mfaEnabled).length;

  // Filtered List
  const filteredUsers = safeUsers.filter((user) => {
    if (!user) return false;
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      user.name.toLowerCase().includes(term) ||
      user.email.toLowerCase().includes(term) ||
      (user.documentCpf && user.documentCpf.toLowerCase().includes(term)) ||
      (user.pixKey && user.pixKey.toLowerCase().includes(term)) ||
      (user.phone && user.phone.includes(term));

    if (!matchesSearch) return false;

    if (filterRole !== 'ALL' && user.role !== filterRole) return false;

    if (filterStatus === 'ACTIVE') return user.isActive;
    if (filterStatus === 'REVOKED') return !user.isActive;
    if (filterStatus === 'SPECIAL_TAX') return user.hasSpecialTaxRule;
    if (filterStatus === 'MFA') return user.mfaEnabled;

    return true;
  });

  // Open Edit Modal
  const handleOpenEdit = (tech: User) => {
    setEditingTech(tech);
    setEditFormData({
      name: tech.name || '',
      email: tech.email || '',
      phone: tech.phone || '',
      documentCpf: tech.documentCpf || '',
      role: tech.role || 'TECHNICIAN',
      pixKeyType: tech.pixKeyType || 'CPF',
      pixKey: tech.pixKey || '',
      bankName: tech.bankName || 'Banco Itaú',
      bankAgency: tech.bankAgency || '',
      bankAccount: tech.bankAccount || '',
      baseCostAllowance: tech.baseCostAllowance ?? (tech.role === 'TECHNICIAN' ? 250 : 0),
      hasSpecialTaxRule: Boolean(tech.hasSpecialTaxRule),
      specialTaxRate: tech.specialTaxRate ?? 16,
      mfaEnabled: Boolean(tech.mfaEnabled),
    });
  };

  // Save Edit
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTech) return;

    updateTechnician(editingTech.id, {
      name: editFormData.name,
      email: editFormData.email,
      phone: editFormData.phone,
      documentCpf: editFormData.documentCpf,
      role: editFormData.role,
      pixKeyType: editFormData.pixKeyType,
      pixKey: editFormData.pixKey,
      bankName: editFormData.bankName,
      bankAgency: editFormData.bankAgency,
      bankAccount: editFormData.bankAccount,
      baseCostAllowance: Number(editFormData.baseCostAllowance),
      hasSpecialTaxRule: editFormData.hasSpecialTaxRule,
      specialTaxRate: Number(editFormData.specialTaxRate),
      mfaEnabled: editFormData.mfaEnabled,
    });

    addToast(
      'Cadastro Atualizado',
      `Dados de ${editFormData.name} foram salvos com sucesso.`,
      'success'
    );
    setEditingTech(null);
  };

  // Create New User/Technician
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFormData.name || !newFormData.email) {
      addToast('Campos Obrigatórios', 'Preencha nome e e-mail do usuário.', 'error');
      return;
    }

    createUserAccount({
      name: newFormData.name,
      email: newFormData.email,
      password: newFormData.password,
      documentCpf: newFormData.documentCpf || '000.000.000-00',
      phone: newFormData.phone || '11999990000',
      role: newFormData.role,
      isSuperAdmin: newFormData.role === 'ADMIN',
      pixKeyType: newFormData.pixKeyType,
      pixKey: newFormData.pixKey || newFormData.documentCpf,
      bankName: newFormData.bankName,
      bankAgency: newFormData.bankAgency,
      bankAccount: newFormData.bankAccount,
      baseCostAllowance: Number(newFormData.baseCostAllowance),
      hasSpecialTaxRule: newFormData.hasSpecialTaxRule,
      specialTaxRate: Number(newFormData.specialTaxRate),
      mfaEnabled: newFormData.mfaEnabled,
    });

    setShowCreateModal(false);
    // Reset form
    setNewFormData({
      name: '',
      email: '',
      password: 'Porto@' + Math.floor(100 + Math.random() * 900),
      documentCpf: '',
      phone: '',
      role: 'TECHNICIAN',
      pixKeyType: 'CPF',
      pixKey: '',
      bankName: 'Banco Itaú',
      bankAgency: '0450',
      bankAccount: '',
      baseCostAllowance: 250,
      hasSpecialTaxRule: false,
      specialTaxRate: 16,
      mfaEnabled: false,
    });
  };

  // Open Password Reset Modal
  const handleOpenResetModal = (tech: User) => {
    setResetModalTech(tech);
    const result = resetUserPassword(tech.id);
    setGeneratedNewPass(result.temporaryPassword);
    setCustomPassInput(result.temporaryPassword);
  };

  // Dispatch Password via WhatsApp
  const handleSendPasswordWhatsApp = (tech: User, pass: string) => {
    const cleanPhone = tech.phone.replace(/\D/g, '');
    const phoneWithDDI = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const text = encodeURIComponent(
      `Olá ${tech.name}! Sua senha de acesso ao portal do *O Higienizador (Porto Seguro)* foi redefinida.\n\n*E-mail:* ${tech.email}\n*Nova Senha:* ${pass}\n*Link de Acesso:* https://ohigienizador.zrti.tech\n\nPor favor, efetue login e altere sua senha no primeiro acesso.`
    );
    window.open(`https://wa.me/${phoneWithDDI}?text=${text}`, '_blank');
  };

  const handleCopyPassword = (pass: string) => {
    navigator.clipboard.writeText(pass);
    addToast('Senha Copiada', 'Senha provisória copiada para a área de transferência.', 'info');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#003366] tracking-tight">
            Gestão de Técnicos & Contas de Acesso
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastro de profissionais parceiros, credenciais de login, MFA, dados PIX e regras financeiras quinzenais.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#003366] hover:bg-[#00264d] text-white font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 text-cyan-300" />
            <span>Cadastrar Novo Técnico</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Usuários</span>
          <div className="text-xl font-black text-slate-900 mt-0.5">{safeUsers.length}</div>
          <span className="text-[10px] text-emerald-600 font-semibold">{techniciansCount} técnicos • {adminsCount} admins</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Ajuda de Custo Fixa</span>
          <div className="text-xl font-black text-[#003366] mt-0.5">R$ 250,00</div>
          <span className="text-[10px] text-slate-500">Padrão por quinzena</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Exceção Fiscal (16%)</span>
          <div className="text-xl font-black text-amber-600 mt-0.5">{specialRuleCount}</div>
          <span className="text-[10px] text-amber-700 font-semibold">Técnico(s) com retenção</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Segurança 2FA / MFA</span>
          <div className="text-xl font-black text-cyan-700 mt-0.5">{mfaCount}</div>
          <span className="text-[10px] text-cyan-600 font-semibold">Autenticação em 2 etapas</span>
        </div>
      </div>

      {/* Special Rule Notice Banner */}
      <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 flex items-start space-x-3 shadow-xs">
        <Layers className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <strong className="font-bold block text-sm">
            Regra de Exceção Fiscal das Planilhas ({specialRuleCount} Técnico com Retenção Ativa)
          </strong>
          <p className="mt-0.5 text-amber-800 leading-relaxed">
            Conforme a parametrização das planilhas Porto Seguro, técnicos com exceção fiscal (como <strong>Robertinho</strong>) possuem retenção de <strong>16%</strong> sobre a comissão bruta. Os demais técnicos operam sem retenção fiscal. Todos recebem a <strong>Ajuda de Custo de R$ 250,00</strong> somada ao final.
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, e-mail, CPF, PIX..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => { setFilterRole('ALL'); setFilterStatus('ALL'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterRole === 'ALL' && filterStatus === 'ALL'
                ? 'bg-[#003366] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({safeUsers.length})
          </button>
          <button
            onClick={() => setFilterRole('TECHNICIAN')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterRole === 'TECHNICIAN'
                ? 'bg-cyan-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Técnicos ({techniciansCount})
          </button>
          <button
            onClick={() => setFilterRole('ADMIN')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterRole === 'ADMIN'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Diretoria & Admins ({adminsCount})
          </button>
          <button
            onClick={() => setFilterRole('OPERATIONAL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterRole === 'OPERATIONAL'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Operacional ({opsCount})
          </button>
          <button
            onClick={() => setFilterStatus('SPECIAL_TAX')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterStatus === 'SPECIAL_TAX'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            16% Fiscal ({specialRuleCount})
          </button>
        </div>
      </div>

      {/* Users & Technicians High Density Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Profissional / Acesso</th>
                <th className="py-3 px-4 text-center">Perfil / Cargo</th>
                <th className="py-3 px-4">Contato / WhatsApp</th>
                <th className="py-3 px-4">Chave PIX & Banco</th>
                <th className="py-3 px-4">Ajuda Custo</th>
                <th className="py-3 px-4 text-center">Regra Fiscal</th>
                <th className="py-3 px-4 text-center">Segurança & MFA</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((tech) => (
                <tr
                  key={tech.id}
                  className={`hover:bg-slate-50/70 transition-colors ${
                    !tech.isActive ? 'bg-red-50/30 opacity-75' : ''
                  }`}
                >
                  {/* Name and email */}
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900 flex items-center space-x-2">
                      <div className={`w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs ${
                        tech.role === 'ADMIN' ? 'bg-indigo-700' : tech.role === 'OPERATIONAL' ? 'bg-purple-700' : 'bg-[#003366]'
                      }`}>
                        {tech.name.charAt(0)}
                      </div>
                      <div>
                        <span className="font-bold">{tech.name}</span>
                        {tech.temporaryPassword && (
                          <span className="ml-1.5 px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] rounded font-bold">
                            Senha Provisória
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {tech.email} • CPF: {tech.documentCpf}
                    </div>
                  </td>

                  {/* Role Badge */}
                  <td className="py-3.5 px-4 text-center">
                    {tech.role === 'ADMIN' && (
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full font-bold text-[9px] uppercase tracking-wider">
                        ADMIN MASTER
                      </span>
                    )}
                    {tech.role === 'OPERATIONAL' && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full font-bold text-[9px] uppercase tracking-wider">
                        OPERACIONAL
                      </span>
                    )}
                    {tech.role === 'TECHNICIAN' && (
                      <span className="px-2 py-0.5 bg-cyan-100 text-cyan-800 rounded-full font-bold text-[9px] uppercase tracking-wider">
                        TÉCNICO CAMPO
                      </span>
                    )}
                  </td>

                  {/* Phone */}
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-700 flex items-center space-x-1">
                      <Phone className="h-3 w-3 text-emerald-500" />
                      <span>{tech.phone}</span>
                    </div>
                  </td>

                  {/* PIX Key */}
                  <td className="py-3.5 px-4">
                    <div className="font-mono text-slate-800 font-bold bg-slate-100 px-2 py-0.5 rounded inline-block text-[11px]">
                      {tech.pixKey || 'Não informada'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {tech.pixKeyType || 'CPF'} {tech.bankName ? `• ${tech.bankName}` : ''}
                    </div>
                  </td>

                  {/* Ajuda de Custo */}
                  <td className="py-3.5 px-4">
                    <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      R$ {(tech.baseCostAllowance ?? (tech.role === 'TECHNICIAN' ? 250.0 : 0.0)).toFixed(2)}
                    </span>
                  </td>

                  {/* Special Tax Exemption Toggle */}
                  <td className="py-3.5 px-4 text-center">
                    {tech.role === 'TECHNICIAN' ? (
                      <button
                        onClick={() => toggleSpecialTaxRule(tech.id)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                          tech.hasSpecialTaxRule
                            ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 shadow-xs'
                            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                        }`}
                        title="Alternar retenção fiscal de 16%"
                      >
                        {tech.hasSpecialTaxRule
                          ? `Ativa (${tech.specialTaxRate || 16}%)`
                          : 'Isento'}
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">N/A</span>
                    )}
                  </td>

                  {/* MFA Status & Toggle */}
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={() => toggleUserMfa(tech.id)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all inline-flex items-center space-x-1 cursor-pointer ${
                        tech.mfaEnabled
                          ? 'bg-cyan-100 text-cyan-900 border border-cyan-300 hover:bg-cyan-200'
                          : 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200'
                      }`}
                      title="Clique para ativar/desativar MFA para este usuário"
                    >
                      <Fingerprint className="w-3 h-3" />
                      <span>{tech.mfaEnabled ? 'MFA Ativo' : 'Desativado'}</span>
                    </button>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4 text-center">
                    {tech.isActive ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[9px] uppercase tracking-wider">
                        ATIVO
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full font-bold text-[9px] uppercase tracking-wider">
                        REVOGADO
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end space-x-1">
                      {/* Reset Password Button */}
                      <button
                        onClick={() => handleOpenResetModal(tech)}
                        className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-50 border border-amber-200 transition-colors cursor-pointer"
                        title="Resetar Senha de Acesso"
                      >
                        <Key className="h-3.5 w-3.5" />
                      </button>

                      {/* Edit Details */}
                      <button
                        onClick={() => handleOpenEdit(tech)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-cyan-700 hover:bg-cyan-50 border border-slate-200 transition-colors cursor-pointer"
                        title="Editar Dados, PIX e Parâmetros"
                      >
                        <Sliders className="h-3.5 w-3.5 text-[#003366]" />
                      </button>

                      {/* Revoke / Restore Access */}
                      {tech.isActive ? (
                        <button
                          onClick={() => revokeUserAccess(tech.id)}
                          className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 border border-amber-200 transition-colors cursor-pointer"
                          title="Revogar Acesso / Desativar Temporariamente"
                        >
                          <UserX className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => restoreUserAccess(tech.id)}
                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 border border-emerald-200 transition-colors cursor-pointer"
                          title="Reativar Acesso"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Delete User Account Permanently */}
                      <button
                        onClick={() => setUserToDelete(tech)}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 border border-red-200 transition-colors cursor-pointer"
                        title="Excluir Permanentemente do Sistema e MariaDB"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Cadastrar Novo Técnico */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-[#003366] text-white flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#003366]">Cadastrar Novo Técnico</h3>
                  <p className="text-xs text-slate-500">Criação de credenciais de login, PIX e parâmetros</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Role / Profile Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Perfil de Acesso / Função *
                </label>
                <select
                  value={newFormData.role}
                  onChange={(e) => {
                    const r = e.target.value as User['role'];
                    setNewFormData({
                      ...newFormData,
                      role: r,
                      baseCostAllowance: r === 'TECHNICIAN' ? 250 : 0,
                    });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                >
                  <option value="TECHNICIAN">Técnico de Campo (Acesso App, OS e Repasses Quinzenais)</option>
                  <option value="ADMIN">Administrador Master (Gestão Total, Diretoria e Configurações)</option>
                  <option value="OPERATIONAL">Gestão Operacional (Acompanhamento e Atribuição)</option>
                </select>
              </div>

              {/* Row 1: Name & CPF */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={newFormData.name}
                    onChange={(e) => setNewFormData({ ...newFormData, name: e.target.value })}
                    placeholder="Ex: Lucas Ferreira"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    CPF *
                  </label>
                  <input
                    type="text"
                    required
                    value={newFormData.documentCpf}
                    onChange={(e) => setNewFormData({ ...newFormData, documentCpf: e.target.value })}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 2: Email, Phone & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    E-mail de Login *
                  </label>
                  <input
                    type="email"
                    required
                    value={newFormData.email}
                    onChange={(e) => setNewFormData({ ...newFormData, email: e.target.value })}
                    placeholder="lucas@ohigienizador.com.br"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    WhatsApp / Celular *
                  </label>
                  <input
                    type="tel"
                    required
                    value={newFormData.phone}
                    onChange={(e) => setNewFormData({ ...newFormData, phone: e.target.value })}
                    placeholder="11988887777"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Senha Provisória *
                  </label>
                  <input
                    type="text"
                    required
                    value={newFormData.password}
                    onChange={(e) => setNewFormData({ ...newFormData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 3: PIX & Banking */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-[#003366] uppercase tracking-wider block">
                  Dados Financeiros & Chave PIX
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Tipo de Chave PIX
                    </label>
                    <select
                      value={newFormData.pixKeyType}
                      onChange={(e) => setNewFormData({ ...newFormData, pixKeyType: e.target.value as PixKeyType })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                    >
                      <option value="CPF">CPF</option>
                      <option value="PHONE">Telefone</option>
                      <option value="EMAIL">E-mail</option>
                      <option value="CNPJ">CNPJ</option>
                      <option value="RANDOM">Chave Aleatória</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Chave PIX
                    </label>
                    <input
                      type="text"
                      value={newFormData.pixKey}
                      onChange={(e) => setNewFormData({ ...newFormData, pixKey: e.target.value })}
                      placeholder="Chave PIX para transferência"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Banco
                    </label>
                    <input
                      type="text"
                      value={newFormData.bankName}
                      onChange={(e) => setNewFormData({ ...newFormData, bankName: e.target.value })}
                      placeholder="Ex: Itaú, Nubank..."
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Agência
                    </label>
                    <input
                      type="text"
                      value={newFormData.bankAgency}
                      onChange={(e) => setNewFormData({ ...newFormData, bankAgency: e.target.value })}
                      placeholder="0001"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Conta
                    </label>
                    <input
                      type="text"
                      value={newFormData.bankAccount}
                      onChange={(e) => setNewFormData({ ...newFormData, bankAccount: e.target.value })}
                      placeholder="12345-6"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Row 4: Remuneration & Rules */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Ajuda de Custo / Fixo (R$)
                  </label>
                  <input
                    id="tech-create-cost-allowance"
                    type="number"
                    min="0"
                    step="10"
                    value={newFormData.baseCostAllowance}
                    onChange={(e) => setNewFormData({ ...newFormData, baseCostAllowance: Number(e.target.value) })}
                    placeholder="Ex: 250, 100 ou 0"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400">Padrão: R$ 250,00 (customizável: R$ 100, R$ 0)</span>
                </div>

                <div className="sm:col-span-2 flex items-center space-x-4 pt-4">
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFormData.hasSpecialTaxRule}
                      onChange={(e) => setNewFormData({ ...newFormData, hasSpecialTaxRule: e.target.checked })}
                      className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4"
                    />
                    <span>Regra de Exceção Fiscal (16% Retenção)</span>
                  </label>

                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFormData.mfaEnabled}
                      onChange={(e) => setNewFormData({ ...newFormData, mfaEnabled: e.target.checked })}
                      className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4"
                    />
                    <span>Ativar MFA (2FA)</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold shadow-md cursor-pointer"
                >
                  Salvar e Criar Conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Técnico Completo */}
      {editingTech && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-[#003366]">
                  Editar Cadastro: {editingTech.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Atualização cadastral, PIX, ajuda de custo e alíquota fiscal.
                </p>
              </div>
              <button
                onClick={() => setEditingTech(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Role / Profile */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Perfil de Acesso / Função *
                </label>
                <select
                  value={editFormData.role}
                  onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as User['role'] })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                >
                  <option value="TECHNICIAN">Técnico de Campo (Acesso App, OS e Repasses Quinzenais)</option>
                  <option value="ADMIN">Administrador Master (Gestão Total, Diretoria e Configurações)</option>
                  <option value="OPERATIONAL">Gestão Operacional (Acompanhamento e Atribuição)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    CPF
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.documentCpf}
                    onChange={(e) => setEditFormData({ ...editFormData, documentCpf: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    required
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    WhatsApp / Telefone
                  </label>
                  <input
                    type="tel"
                    required
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900"
                  />
                </div>
              </div>

              {/* PIX Details */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-[#003366] uppercase tracking-wider block">
                  Dados PIX e Bancários
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Tipo de Chave
                    </label>
                    <select
                      value={editFormData.pixKeyType}
                      onChange={(e) => setEditFormData({ ...editFormData, pixKeyType: e.target.value as PixKeyType })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="CPF">CPF</option>
                      <option value="PHONE">Telefone</option>
                      <option value="EMAIL">E-mail</option>
                      <option value="CNPJ">CNPJ</option>
                      <option value="RANDOM">Chave Aleatória</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Chave PIX
                    </label>
                    <input
                      type="text"
                      value={editFormData.pixKey}
                      onChange={(e) => setEditFormData({ ...editFormData, pixKey: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Banco
                    </label>
                    <input
                      type="text"
                      value={editFormData.bankName}
                      onChange={(e) => setEditFormData({ ...editFormData, bankName: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Agência
                    </label>
                    <input
                      type="text"
                      value={editFormData.bankAgency}
                      onChange={(e) => setEditFormData({ ...editFormData, bankAgency: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Conta
                    </label>
                    <input
                      type="text"
                      value={editFormData.bankAccount}
                      onChange={(e) => setEditFormData({ ...editFormData, bankAccount: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Financial Params */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Ajuda de Custo / Fixo (R$)
                  </label>
                  <input
                    id="tech-edit-cost-allowance"
                    type="number"
                    min="0"
                    step="10"
                    value={editFormData.baseCostAllowance}
                    onChange={(e) => setEditFormData({ ...editFormData, baseCostAllowance: Number(e.target.value) })}
                    placeholder="Ex: 250, 100 ou 0"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400">Defina R$ 250, R$ 100 ou R$ 0</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Alíquota Fiscal Especial (%)
                  </label>
                  <input
                    type="number"
                    value={editFormData.specialTaxRate}
                    onChange={(e) => setEditFormData({ ...editFormData, specialTaxRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>
                <div className="flex flex-col justify-end space-y-1">
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editFormData.hasSpecialTaxRule}
                      onChange={(e) => setEditFormData({ ...editFormData, hasSpecialTaxRule: e.target.checked })}
                      className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4"
                    />
                    <span>Retenção 16% Ativa</span>
                  </label>
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editFormData.mfaEnabled}
                      onChange={(e) => setEditFormData({ ...editFormData, mfaEnabled: e.target.checked })}
                      className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4"
                    />
                    <span>MFA (2FA) Ativo</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTech(null)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold shadow-md cursor-pointer"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Resetar Senha & Disparar WhatsApp */}
      {resetModalTech && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Reset de Senha</h3>
                  <p className="text-xs text-slate-500">Técnico: {resetModalTech.name}</p>
                </div>
              </div>
              <button
                onClick={() => setResetModalTech(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <span className="font-bold block">Nova Senha Provisória Gerada:</span>
                <div className="mt-2 flex items-center justify-between bg-white p-2.5 rounded-lg border border-amber-300 font-mono font-black text-base text-amber-900">
                  <span>{customPassInput}</span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => handleCopyPassword(customPassInput)}
                      className="p-1 rounded hover:bg-slate-100 text-slate-600"
                      title="Copiar Senha"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Ou digite uma senha personalizada:
                </label>
                <input
                  type="text"
                  value={customPassInput}
                  onChange={(e) => setCustomPassInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  resetUserPassword(resetModalTech.id, customPassInput);
                  handleSendPasswordWhatsApp(resetModalTech, customPassInput);
                  setResetModalTech(null);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-md cursor-pointer transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Salvar e Enviar no WhatsApp ({resetModalTech.phone})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  resetUserPassword(resetModalTech.id, customPassInput);
                  setResetModalTech(null);
                }}
                className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-all"
              >
                Apenas Salvar Senha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Exclusão Definitiva */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Excluir Usuário</h3>
                <p className="text-xs text-red-600 font-medium">Exclusão permanente do MariaDB</p>
              </div>
            </div>

            <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-900 space-y-2">
              <p>
                Tem certeza que deseja excluir permanentemente o cadastro de <strong className="font-bold text-red-950">{userToDelete.name}</strong> (<span className="font-mono">{userToDelete.email}</span>)?
              </p>
              <p className="text-[11px] text-red-700">
                Esta ação executará o comando SQL <code className="bg-white/80 px-1 py-0.5 rounded font-mono text-[10px]">DELETE FROM users WHERE id = '{userToDelete.id}'</code> no banco de dados MariaDB da produção.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteUserAccount(userToDelete.id);
                  setUserToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md cursor-pointer transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sim, Excluir do Banco</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
