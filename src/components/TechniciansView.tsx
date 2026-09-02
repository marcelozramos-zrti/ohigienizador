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
  ReceiptText,
  Tag,
  Sparkles,
  Plus,
  ArrowRight,
  HelpCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { User, PixKeyType, TechnicianPriceTableItem } from '../types';
import { FELIPE_AUGUSTO_PRICE_TABLE, BRENO_JORGE_PRICE_TABLE } from '../data/standardPriceTables';

interface TechniciansViewProps {
  showCreateModal?: boolean;
  onOpenCreateChange?: (open: boolean) => void;
}

export const TechniciansView: React.FC<TechniciansViewProps> = ({
  showCreateModal: externalShowCreate,
  onOpenCreateChange,
}) => {
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
  const [internalShowCreateModal, setInternalShowCreateModal] = useState<boolean>(false);
  const showCreateModal = externalShowCreate !== undefined ? externalShowCreate : internalShowCreateModal;
  const setShowCreateModal = (open: boolean) => {
    setInternalShowCreateModal(open);
    if (onOpenCreateChange) onOpenCreateChange(open);
  };
  const [editingTech, setEditingTech] = useState<User | null>(null);
  const [resetModalTech, setResetModalTech] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [generatedNewPass, setGeneratedNewPass] = useState<string>('');
  const [customPassInput, setCustomPassInput] = useState<string>('');
  
  // Edit Modal Active Tab & Price Table State
  const [editActiveTab, setEditActiveTab] = useState<'DATA' | 'BANK' | 'TAX' | 'PRICES'>('DATA');
  const [priceTableState, setPriceTableState] = useState<TechnicianPriceTableItem[]>([]);
  const [priceFilterCategory, setPriceFilterCategory] = useState<string>('TODAS');
  const [priceSearchQuery, setPriceSearchQuery] = useState<string>('');
  const [copyFromTechId, setCopyFromTechId] = useState<string>('');
  
  // Add new service item state
  const [newServiceCategory, setNewServiceCategory] = useState<string>('Instalação');
  const [newServiceName, setNewServiceName] = useState<string>('');
  const [newServicePreposto, setNewServicePreposto] = useState<number>(36.00);

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
    costAllowanceFortnight: 1 as 1 | 2,
    hasSpecialTaxRule: false,
    specialTaxRate: 16,
    mfaEnabled: false,
    priceTemplate: 'FELIPE' as 'FELIPE' | 'BRENO' | 'EMPTY',
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
    costAllowanceFortnight: 1 | 2;
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
    costAllowanceFortnight: 1,
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

  // Open Edit Modal in standard data tab
  const handleOpenEdit = (tech: User) => {
    setEditingTech(tech);
    setEditActiveTab('DATA');
    setPriceTableState(
      tech.priceTable && tech.priceTable.length > 0
        ? [...tech.priceTable]
        : [...FELIPE_AUGUSTO_PRICE_TABLE]
    );
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
      costAllowanceFortnight: (tech.costAllowanceFortnight || 1) as 1 | 2,
      hasSpecialTaxRule: Boolean(tech.hasSpecialTaxRule),
      specialTaxRate: tech.specialTaxRate ?? 16,
      mfaEnabled: Boolean(tech.mfaEnabled),
    });
  };

  // Open directly into Price Table tab
  const handleOpenPriceTable = (tech: User) => {
    setEditingTech(tech);
    setEditActiveTab('PRICES');
    setPriceTableState(
      tech.priceTable && tech.priceTable.length > 0
        ? [...tech.priceTable]
        : [...FELIPE_AUGUSTO_PRICE_TABLE]
    );
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
      costAllowanceFortnight: (tech.costAllowanceFortnight || 1) as 1 | 2,
      hasSpecialTaxRule: Boolean(tech.hasSpecialTaxRule),
      specialTaxRate: tech.specialTaxRate ?? 16,
      mfaEnabled: Boolean(tech.mfaEnabled),
    });
  };

  // Price Table Handlers
  const handleUpdateItemPrice = (serviceType: string, newPrepostoPrice: number) => {
    setPriceTableState((prev) =>
      prev.map((item) =>
        item.serviceType === serviceType
          ? { ...item, prepostoPrice: Math.max(0, Number(newPrepostoPrice.toFixed(2))) }
          : item
      )
    );
  };

  const handleAdjustItemPriceStep = (serviceType: string, delta: number) => {
    setPriceTableState((prev) =>
      prev.map((item) =>
        item.serviceType === serviceType
          ? { ...item, prepostoPrice: Math.max(0, Number(((item.prepostoPrice || 0) + delta).toFixed(2))) }
          : item
      )
    );
  };

  const handleRemovePriceItem = (serviceType: string) => {
    setPriceTableState((prev) => prev.filter((item) => item.serviceType !== serviceType));
  };

  const handleAddNewPriceItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim()) {
      addToast('Nome Inválido', 'Informe o tipo de visita ou nome do serviço.', 'warning');
      return;
    }
    const cleanName = newServiceName.trim();
    if (priceTableState.some((item) => item.serviceType.toLowerCase() === cleanName.toLowerCase())) {
      addToast('Serviço Já Existe', 'Este tipo de visita já está cadastrado na tabela deste técnico.', 'warning');
      return;
    }
    setPriceTableState((prev) => [
      ...prev,
      {
        category: newServiceCategory,
        serviceType: cleanName,
        prepostoPrice: Number(newServicePreposto) || 0,
      },
    ]);
    setNewServiceName('');
    addToast('Serviço Adicionado', `"${cleanName}" adicionado com valor R$ ${Number(newServicePreposto).toFixed(2)}.`, 'success');
  };

  const handleApplyTemplate = (template: 'FELIPE' | 'BRENO') => {
    const templateData = template === 'FELIPE' ? FELIPE_AUGUSTO_PRICE_TABLE : BRENO_JORGE_PRICE_TABLE;
    setPriceTableState([...templateData]);
    addToast(
      'Tabela Aplicada',
      `Tabela padrão de ${template === 'FELIPE' ? 'Felipe Augusto' : 'Breno Jorge'} aplicada com sucesso (${templateData.length} itens).`,
      'info'
    );
  };

  const handleCopyFromTechnician = () => {
    if (!copyFromTechId) {
      addToast('Selecione um Técnico', 'Escolha o técnico de origem para copiar a tabela.', 'warning');
      return;
    }
    const sourceTech = safeUsers.find((u) => u.id === copyFromTechId);
    if (!sourceTech || !sourceTech.priceTable || sourceTech.priceTable.length === 0) {
      addToast('Tabela Vazia', 'O técnico selecionado não possui tabela de preços definida.', 'warning');
      return;
    }
    setPriceTableState([...sourceTech.priceTable]);
    addToast('Tabela Copiada', `Tabela de preços copiada de ${sourceTech.name} (${sourceTech.priceTable.length} itens).`, 'success');
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
      costAllowanceFortnight: editFormData.costAllowanceFortnight,
      hasSpecialTaxRule: editFormData.hasSpecialTaxRule,
      specialTaxRate: Number(editFormData.specialTaxRate),
      mfaEnabled: editFormData.mfaEnabled,
      priceTable: priceTableState,
    });

    addToast(
      'Cadastro e Tabela Atualizados',
      `Dados e tabela de preços de ${editFormData.name} foram salvos com sucesso.`,
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
      costAllowanceFortnight: newFormData.costAllowanceFortnight,
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
      costAllowanceFortnight: 1,
      hasSpecialTaxRule: false,
      specialTaxRate: 16,
      mfaEnabled: false,
      priceTemplate: 'FELIPE',
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
      {/* Executive Status Dashboard - 5 Standardized Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: Total Usuários */}
        <div
          onClick={() => { setFilterRole('ALL'); setFilterStatus('ALL'); }}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            filterRole === 'ALL' && filterStatus === 'ALL' ? 'border-cyan-500 ring-2 ring-cyan-400/30 bg-cyan-50/20' : 'border-slate-200'
          }`}
          title="Clique para ver Todos os Usuários"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Equipe</span>
            <div className="p-1.5 rounded-lg bg-cyan-50 text-[#003366]">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-slate-900">{safeUsers.length}</span>
            <span className="text-[10px] text-slate-500 font-medium">cadastros</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium truncate">
            {techniciansCount} técnicos • {adminsCount + opsCount} gestão
          </div>
        </div>

        {/* Card 2: Ativos em Campo */}
        <div
          onClick={() => setFilterStatus(filterStatus === 'ACTIVE' ? 'ALL' : 'ACTIVE')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            filterStatus === 'ACTIVE' ? 'border-emerald-500 ring-2 ring-emerald-400/30 bg-emerald-50/20' : 'border-slate-200'
          }`}
          title="Clique para ver Usuários Ativos"
        >
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Ativos em Campo</span>
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-emerald-700">{activeCount}</span>
            <span className="text-[10px] text-emerald-700 font-bold">ativos</span>
          </div>
          <div className="mt-1 text-[10px] text-emerald-700 font-medium truncate">
            Acesso Liberado no App
          </div>
        </div>

        {/* Card 3: Ajuda de Custo Fixa */}
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Ajuda Custo Padrão</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-[#003366]">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-black text-[#003366] font-mono">R$ 250,00</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium truncate">
            Por quinzena / técnico
          </div>
        </div>

        {/* Card 4: Regra Fiscal (16%) */}
        <div
          onClick={() => setFilterStatus(filterStatus === 'SPECIAL_TAX' ? 'ALL' : 'SPECIAL_TAX')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            filterStatus === 'SPECIAL_TAX' ? 'border-amber-500 ring-2 ring-amber-400/30 bg-amber-50/20' : 'border-slate-200'
          }`}
          title="Clique para filtrar Exceção Fiscal 16%"
        >
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Exceção Fiscal (16%)</span>
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-amber-700">{specialRuleCount}</span>
            <span className="text-[10px] text-amber-700 font-bold">técnicos</span>
          </div>
          <div className="mt-1 text-[10px] text-amber-700 font-medium truncate">
            Com Retenção de Imposto
          </div>
        </div>

        {/* Card 5: Segurança 2FA / MFA */}
        <div
          onClick={() => setFilterStatus(filterStatus === 'MFA' ? 'ALL' : 'MFA')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            filterStatus === 'MFA' ? 'border-purple-500 ring-2 ring-purple-400/30 bg-purple-50/20' : 'border-slate-200'
          }`}
          title="Clique para ver Segurança MFA"
        >
          <div className="flex items-center justify-between text-purple-700 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Segurança MFA</span>
            <div className="p-1.5 rounded-lg bg-purple-100 text-purple-800">
              <Fingerprint className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-purple-700">{mfaCount}</span>
            <span className="text-[10px] text-purple-700 font-bold">protegidos</span>
          </div>
          <div className="mt-1 text-[10px] text-purple-700 font-medium truncate">
            Autenticação 2 Etapas
          </div>
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
                    <div className="flex flex-col items-start gap-1">
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs">
                        R$ {(tech.baseCostAllowance ?? (tech.role === 'TECHNICIAN' ? 250.0 : 0.0)).toFixed(2)}
                      </span>
                      {tech.role === 'TECHNICIAN' && (
                        <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {tech.costAllowanceFortnight === 2 ? '2ª Quinzena' : '1ª Quinzena'}
                        </span>
                      )}
                    </div>
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

                      {/* Price Table Button (Preposto) */}
                      {tech.role === 'TECHNICIAN' && (
                        <button
                          onClick={() => handleOpenPriceTable(tech)}
                          className="p-1.5 rounded-lg text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border border-emerald-200 transition-colors cursor-pointer"
                          title="Tabela de Preços Negociados (Preposto) por Tipo de Visita"
                        >
                          <Tag className="h-3.5 w-3.5 text-emerald-600" />
                        </button>
                      )}

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
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-[#003366] uppercase tracking-wider block">
                  Ajuda de Custo Mensal & Parâmetros
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Ajuda de Custo Mensal (R$) *
                    </label>
                    <input
                      id="tech-create-cost-allowance"
                      type="number"
                      min="0"
                      step="10"
                      value={newFormData.baseCostAllowance}
                      onChange={(e) => setNewFormData({ ...newFormData, baseCostAllowance: Number(e.target.value) })}
                      placeholder="Ex: 250, 100 ou 0"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-[#003366] focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Valor mensal total lançado para o técnico.
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Quinzena de Pagamento *
                    </label>
                    <select
                      id="tech-create-cost-allowance-fortnight"
                      value={newFormData.costAllowanceFortnight}
                      onChange={(e) => setNewFormData({ ...newFormData, costAllowanceFortnight: Number(e.target.value) as 1 | 2 })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                    >
                      <option value={1}>1ª Quinzena (Dia 01 ao dia 15)</option>
                      <option value={2}>2ª Quinzena (Dia 16 ao final do mês)</option>
                    </select>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Creditada apenas no fechamento da quinzena escolhida.
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-200">
                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFormData.hasSpecialTaxRule}
                      onChange={(e) => setNewFormData({ ...newFormData, hasSpecialTaxRule: e.target.checked })}
                      className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Regra Fiscal Especial (16% Retenção)</span>
                  </label>

                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFormData.mfaEnabled}
                      onChange={(e) => setNewFormData({ ...newFormData, mfaEnabled: e.target.checked })}
                      className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Ativar Segurança MFA (2FA)</span>
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

      {/* Modal: Editar Técnico & Tabela de Preços */}
      {editingTech && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#003366] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  {editingTech.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-black text-[#003366]">
                    {editingTech.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Gestão cadastral, dados bancários, retenção fiscal e tabela de preços negociados (preposto).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingTech(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center space-x-1.5 border-b border-slate-200 pb-2 overflow-x-auto shrink-0">
              <button
                type="button"
                onClick={() => setEditActiveTab('DATA')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                  editActiveTab === 'DATA'
                    ? 'bg-[#003366] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Dados Cadastrais</span>
              </button>

              <button
                type="button"
                onClick={() => setEditActiveTab('BANK')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                  editActiveTab === 'BANK'
                    ? 'bg-[#003366] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Dados Bancários & PIX</span>
              </button>

              <button
                type="button"
                onClick={() => setEditActiveTab('TAX')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                  editActiveTab === 'TAX'
                    ? 'bg-[#003366] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Percent className="w-3.5 h-3.5" />
                <span>Fiscal & Ajuda Custo</span>
              </button>

              {editingTech.role === 'TECHNICIAN' && (
                <button
                  type="button"
                  onClick={() => setEditActiveTab('PRICES')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                    editActiveTab === 'PRICES'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Tabela de Preços (Preposto)</span>
                  <span className="ml-1 px-1.5 py-0.2 bg-white/20 rounded-full text-[10px]">
                    {priceTableState.length}
                  </span>
                </button>
              )}
            </div>

            {/* Tab Body */}
            <form onSubmit={handleSaveEdit} className="space-y-4 overflow-y-auto flex-1 pr-1">
              {/* TAB 1: DADOS CADASTRAIS */}
              {editActiveTab === 'DATA' && (
                <div className="space-y-3.5 animate-fadeIn">
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
                </div>
              )}

              {/* TAB 2: DADOS BANCÁRIOS & PIX */}
              {editActiveTab === 'BANK' && (
                <div className="space-y-3.5 animate-fadeIn">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <span className="text-xs font-bold text-[#003366] uppercase tracking-wider block">
                      Dados PIX e Bancários para Pagamento de Quinquilharia / Quinzena
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
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
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
                          Conta Corrente
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
                </div>
              )}

              {/* TAB 3: REGRAS FISCAIS & AJUDA DE CUSTO */}
              {editActiveTab === 'TAX' && (
                <div className="space-y-3.5 animate-fadeIn">
                  {/* Banner Explicativo de Ajuda de Custo Mensal */}
                  <div className="p-3.5 rounded-xl bg-cyan-50 border border-cyan-200 text-xs text-cyan-950 flex items-start space-x-2.5">
                    <Sliders className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold text-cyan-900 block">Regra da Ajuda de Custo Mensal</strong>
                      <span className="text-cyan-800 text-[11px] leading-relaxed">
                        A ajuda de custo é mensal (não é duplicada por quinzena). Escolha abaixo em qual quinzena (1ª ou 2ª) este técnico receberá o valor no fechamento financeiro.
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase">
                        Ajuda de Custo Mensal (R$)
                      </label>
                      <input
                        id="tech-edit-cost-allowance"
                        type="number"
                        min="0"
                        step="10"
                        value={editFormData.baseCostAllowance}
                        onChange={(e) => setEditFormData({ ...editFormData, baseCostAllowance: Number(e.target.value) })}
                        placeholder="Ex: 250, 100 ou 0"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-[#003366] focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                      />
                      <span className="text-[10px] text-slate-500 block">
                        Valor lançado a mão (ex: R$ 250,00, R$ 100,00 ou R$ 0,00).
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase">
                        Quinzena de Pagamento *
                      </label>
                      <select
                        id="tech-edit-cost-allowance-fortnight"
                        value={editFormData.costAllowanceFortnight}
                        onChange={(e) => setEditFormData({ ...editFormData, costAllowanceFortnight: Number(e.target.value) as 1 | 2 })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                      >
                        <option value={1}>1ª Quinzena (Dia 01 ao 15)</option>
                        <option value={2}>2ª Quinzena (Dia 16 ao final do mês)</option>
                      </select>
                      <span className="text-[10px] text-slate-500 block">
                        Creditada no fechamento da quinzena selecionada.
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase">
                        Alíquota Fiscal Especial (%)
                      </label>
                      <input
                        type="number"
                        value={editFormData.specialTaxRate}
                        onChange={(e) => setEditFormData({ ...editFormData, specialTaxRate: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-amber-700 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                      <span className="text-[10px] text-slate-500 block">
                        Alíquota para técnicos com retenção (ex: 16%).
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Retenção de Imposto Ativa</span>
                      <span className="text-[11px] text-slate-500">Deduz a alíquota fiscal especial (16%) sobre o total bruto do fechamento.</span>
                    </div>
                    <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editFormData.hasSpecialTaxRule}
                        onChange={(e) => setEditFormData({ ...editFormData, hasSpecialTaxRule: e.target.checked })}
                        className="rounded text-amber-600 focus:ring-amber-500 w-5 h-5 cursor-pointer"
                      />
                      <span className={editFormData.hasSpecialTaxRule ? 'text-amber-800 font-bold' : 'text-slate-500'}>
                        {editFormData.hasSpecialTaxRule ? 'Retenção 16% Habilitada' : 'Isento / Não Deduz'}
                      </span>
                    </label>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Segurança em 2 Etapas (MFA / 2FA)</span>
                      <span className="text-[11px] text-slate-500">Exige código de verificação enviado por e-mail/WhatsApp no login.</span>
                    </div>
                    <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editFormData.mfaEnabled}
                        onChange={(e) => setEditFormData({ ...editFormData, mfaEnabled: e.target.checked })}
                        className="rounded text-cyan-600 focus:ring-cyan-500 w-5 h-5 cursor-pointer"
                      />
                      <span className={editFormData.mfaEnabled ? 'text-cyan-800 font-bold' : 'text-slate-500'}>
                        {editFormData.mfaEnabled ? '2FA Ativo' : 'Desativado'}
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* TAB 4: TABELA DE PREÇOS (PREPOSTO) */}
              {editActiveTab === 'PRICES' && (
                <div className="space-y-4 animate-fadeIn">
                  {/* Top Notification Banner */}
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start space-x-3 shadow-xs">
                    <Tag className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <strong className="font-bold block text-emerald-900">
                        Tabela de Preços Negociados (Preposto) do Técnico
                      </strong>
                      <p className="text-emerald-800 leading-relaxed text-[11px] mt-0.5">
                        Os valores de <strong>Preposto (R$)</strong> definidos abaixo são a remuneração exata acordada com este profissional para cada tipo de visita e serviço. Eles são aplicados automaticamente na importação de planilhas e no fechamento quinzenal.
                      </p>
                    </div>
                  </div>

                  {/* Quick Action Templates & Copy */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Ações Rápidas & Modelos Prontos
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleApplyTemplate('FELIPE')}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold inline-flex items-center space-x-1.5 shadow-xs cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
                        <span>Modelo Felipe Augusto ({FELIPE_AUGUSTO_PRICE_TABLE.length} serviços)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApplyTemplate('BRENO')}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold inline-flex items-center space-x-1.5 shadow-xs cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Modelo Breno Jorge ({BRENO_JORGE_PRICE_TABLE.length} serviços)</span>
                      </button>

                      <div className="flex items-center space-x-1.5 ml-auto">
                        <select
                          value={copyFromTechId}
                          onChange={(e) => setCopyFromTechId(e.target.value)}
                          className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                        >
                          <option value="">Copiar de outro técnico...</option>
                          {safeUsers
                            .filter((u) => u.id !== editingTech.id && u.role === 'TECHNICIAN' && u.priceTable && u.priceTable.length > 0)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.priceTable?.length} itens)
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleCopyFromTechnician}
                          disabled={!copyFromTechId}
                          className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold cursor-pointer"
                        >
                          Copiar
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Add New Service Form */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                      Adicionar Novo Tipo de Visita / Escopo
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-4">
                        <select
                          value={newServiceCategory}
                          onChange={(e) => setNewServiceCategory(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        >
                          <option value="Instalação">Instalação</option>
                          <option value="Impermeabilização Assentos">Impermeabilização Assentos</option>
                          <option value="Cadeiras">Cadeiras</option>
                          <option value="Colchões">Colchões</option>
                          <option value="Higienização">Higienização</option>
                          <option value="Outros Serviços">Outros Serviços</option>
                        </select>
                      </div>
                      <div className="sm:col-span-5">
                        <input
                          type="text"
                          value={newServiceName}
                          onChange={(e) => setNewServiceName(e.target.value)}
                          placeholder="Ex: Instala TV de 32 a 48 + Suporte"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <div className="relative">
                          <span className="absolute left-2 top-1.5 text-xs text-slate-400">R$</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={newServicePreposto}
                            onChange={(e) => setNewServicePreposto(Number(e.target.value))}
                            className="w-full pl-7 pr-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                          />
                        </div>
                      </div>
                      <div className="sm:col-span-1">
                        <button
                          type="button"
                          onClick={handleAddNewPriceItem}
                          className="w-full h-full py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer shadow-xs"
                          title="Adicionar à Tabela"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Filter & Search Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        value={priceSearchQuery}
                        onChange={(e) => setPriceSearchQuery(e.target.value)}
                        placeholder="Filtrar serviços..."
                        className="w-full pl-8 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-800"
                      />
                    </div>

                    <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 text-[10px]">
                      {['TODAS', 'Instalação', 'Impermeabilização Assentos', 'Cadeiras', 'Colchões', 'Higienização'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setPriceFilterCategory(cat)}
                          className={`px-2 py-1 rounded-md font-bold transition-all cursor-pointer whitespace-nowrap ${
                            priceFilterCategory === cat
                              ? 'bg-slate-800 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {cat === 'Impermeabilização Assentos' ? 'Impermeab.' : cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Price Table Items List */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase font-bold text-[10px] sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Categoria</th>
                          <th className="py-2 px-3">Tipo de Visita / Escopo</th>
                          <th className="py-2 px-3 text-right">Valor Preposto (R$)</th>
                          <th className="py-2 px-3 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {priceTableState
                          .filter((item) => {
                            if (priceFilterCategory !== 'TODAS' && item.category !== priceFilterCategory) return false;
                            if (priceSearchQuery.trim()) {
                              const q = priceSearchQuery.toLowerCase();
                              return item.serviceType.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
                            }
                            return true;
                          })
                          .map((item, idx) => (
                            <tr key={item.serviceType + '-' + idx} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-2 px-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  item.category === 'Instalação'
                                    ? 'bg-blue-100 text-blue-800'
                                    : item.category.includes('Impermeabilização')
                                    ? 'bg-purple-100 text-purple-800'
                                    : item.category === 'Cadeiras'
                                    ? 'bg-amber-100 text-amber-800'
                                    : item.category === 'Colchões'
                                    ? 'bg-cyan-100 text-cyan-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {item.category}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-800">
                                {item.serviceType}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <div className="inline-flex items-center space-x-1">
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustItemPriceStep(item.serviceType, -5)}
                                    className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center cursor-pointer text-xs"
                                    title="Diminuir R$ 5,00"
                                  >
                                    -
                                  </button>
                                  <div className="relative w-24">
                                    <span className="absolute left-1.5 top-1 text-[11px] text-slate-400">R$</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={item.prepostoPrice}
                                      onChange={(e) => handleUpdateItemPrice(item.serviceType, Number(e.target.value))}
                                      className="w-full pl-6 pr-1 py-0.5 text-right font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded text-xs focus:ring-1 focus:ring-emerald-500"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustItemPriceStep(item.serviceType, 5)}
                                    className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center cursor-pointer text-xs"
                                    title="Aumentar R$ 5,00"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemovePriceItem(item.serviceType)}
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                  title="Remover serviço da tabela"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        {priceTableState.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-slate-400 text-xs">
                              Nenhum serviço cadastrado na tabela de preços deste técnico. Clique em um dos modelos acima para preencher.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
                <div className="text-[11px] text-slate-400">
                  {editingTech.role === 'TECHNICIAN' && (
                    <span>Tabela: <strong className="text-slate-700">{priceTableState.length} serviços</strong> configurados</span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditingTech(null)}
                    className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold shadow-md cursor-pointer flex items-center space-x-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Salvar Alterações</span>
                  </button>
                </div>
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
