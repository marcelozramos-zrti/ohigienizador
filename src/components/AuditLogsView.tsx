import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { AuditLog, AppModule, AuditAction, AuditResult } from '../types';
import { ApiService } from '../services/apiService';
import {
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  User,
  Calendar,
  Layers,
  Activity,
  FileText,
  Clock,
  ArrowUpDown,
  Eye,
} from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const { currentUser, isMasterAdmin, isOperational } = useApp();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [selectedResult, setSelectedResult] = useState<string>('ALL');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const data = await ApiService.fetchAuditLogs({
        module: selectedModule !== 'ALL' ? selectedModule : undefined,
        result: selectedResult !== 'ALL' ? selectedResult : undefined,
        search: searchTerm ? searchTerm : undefined,
      });
      setLogs(data);
    } catch (err) {
      console.error('Erro ao carregar logs de auditoria:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, [selectedModule, selectedResult]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const matchesName = (log.userName || '').toLowerCase().includes(s);
        const matchesAction = (log.action || '').toLowerCase().includes(s);
        const matchesDetails = (log.details || '').toLowerCase().includes(s);
        const matchesId = (log.affectedRecordId || '').toLowerCase().includes(s);
        if (!matchesName && !matchesAction && !matchesDetails && !matchesId) return false;
      }
      return true;
    });
  }, [logs, searchTerm]);

  // Métricas rápidas
  const metrics = useMemo(() => {
    const total = logs.length;
    const blocked = logs.filter((l) => l.result === 'BLOCKED').length;
    const critical = logs.filter((l) =>
      ['PIX_CHANGE', 'SPECIAL_TAX_CHANGE', 'USER_ROLE_CHANGE', 'OS_DELETE', 'SETTINGS_UPDATE'].includes(l.action)
    ).length;
    const logins = logs.filter((l) => l.action === 'LOGIN').length;
    return { total, blocked, critical, logins };
  }, [logs]);

  const getModuleBadge = (mod: AppModule) => {
    switch (mod) {
      case 'AUTH':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">Autenticação</span>;
      case 'SERVICE_ORDERS':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Ordens de Serviço</span>;
      case 'USERS':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">Usuários / Perfis</span>;
      case 'STOCK':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Estoque</span>;
      case 'FINANCE':
      case 'CASHFLOW':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Financeiro</span>;
      case 'DATABASE':
      case 'SETTINGS':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">Sistema / DB</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">{mod}</span>;
    }
  };

  const getResultIcon = (result: AuditResult) => {
    switch (result) {
      case 'SUCCESS':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'BLOCKED':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-rose-500" />;
      default:
        return null;
    }
  };

  const exportAuditCsv = () => {
    const headers = ['ID', 'Data/Hora', 'Usuário', 'Perfil', 'Módulo', 'Ação', 'Resultado', 'Registro Afetado', 'Detalhes'];
    const rows = filteredLogs.map((l) => [
      l.id,
      new Date(l.timestamp).toLocaleString('pt-BR'),
      l.userName,
      l.userRole,
      l.module,
      l.action,
      l.result,
      l.affectedRecordId || '',
      `"${(l.details || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `auditoria_higienizador_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isMasterAdmin && !isOperational) {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-rose-900/50 shadow-sm max-w-xl mx-auto my-12">
        <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Acesso Restrito à Auditoria</h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          Conforme a política de segurança e controle de acesso, o módulo de trilha de auditoria é restrito aos perfis Master e Gestão Operacional.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Trilha de Auditoria & Conformidade
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
              RBAC v1.0
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Registro imutável de todas as operações sensíveis, autenticações e tentativas de violação de acesso no Backend.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            id="btn-refresh-audit"
            onClick={loadAuditLogs}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            id="btn-export-audit-csv"
            onClick={exportAuditCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total de Registros</span>
            <Activity className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">{metrics.total}</p>
          <p className="text-xs text-slate-500 mt-1">Eventos auditados</p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tentativas Bloqueadas</span>
            <ShieldAlert className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">{metrics.blocked}</p>
          <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">Acessos negados pelo RBAC</p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Operações Críticas</span>
            <Lock className="w-5 h-5 text-rose-500" />
          </div>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-2">{metrics.critical}</p>
          <p className="text-xs text-rose-500/80 mt-1">PIX, Fiscal, Exclusões</p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Logins no Sistema</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{metrics.logins}</p>
          <p className="text-xs text-emerald-500/80 mt-1">Sessões autenticadas</p>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="input-search-audit"
            type="text"
            placeholder="Buscar por usuário, ação, ID ou detalhe..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-100 placeholder-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-400" />
            <select
              id="select-audit-module"
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Todos os Módulos</option>
              <option value="AUTH">Autenticação (Login/MFA)</option>
              <option value="SERVICE_ORDERS">Ordens de Serviço</option>
              <option value="USERS">Usuários e Permissões</option>
              <option value="STOCK">Estoque e Insumos</option>
              <option value="CASHFLOW">Fluxo de Caixa / Financeiro</option>
              {isMasterAdmin && <option value="DATABASE">Banco de Dados (MariaDB)</option>}
              {isMasterAdmin && <option value="SETTINGS">Configurações Globais</option>}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              id="select-audit-result"
              value={selectedResult}
              onChange={(e) => setSelectedResult(e.target.value)}
              className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Todos os Resultados</option>
              <option value="SUCCESS">Sucesso (Autorizado)</option>
              <option value="BLOCKED">Bloqueado (Negado por RBAC)</option>
              <option value="FAILED">Falha (Erro de credencial)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabela de Logs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Data / Hora</th>
                <th className="py-3 px-4">Usuário</th>
                <th className="py-3 px-4">Perfil</th>
                <th className="py-3 px-4">Módulo</th>
                <th className="py-3 px-4">Ação</th>
                <th className="py-3 px-4">Resultado</th>
                <th className="py-3 px-4">Detalhes</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Carregando trilha de auditoria do MariaDB...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Nenhum registro de auditoria encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5 font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap font-medium text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <span>{log.userName}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        log.userRole === 'ADMIN'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                          : log.userRole === 'OPERATIONAL'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}>
                        {log.userRole === 'ADMIN' ? 'Master' : log.userRole === 'OPERATIONAL' ? 'Gestor' : 'Técnico'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">{getModuleBadge(log.module)}</td>
                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs text-slate-700 dark:text-slate-300">
                      {log.action}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        {getResultIcon(log.result)}
                        <span className={
                          log.result === 'SUCCESS'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : log.result === 'BLOCKED'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }>
                          {log.result === 'SUCCESS' ? 'Permitido' : log.result === 'BLOCKED' ? 'Bloqueado' : 'Falha'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate" title={log.details}>
                      {log.details || '-'}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                        title="Ver Detalhes do Evento"
                      >
                        <Eye className="w-4 h-4" />
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalhes do Log */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Detalhe do Evento de Auditoria
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">ID: {selectedLog.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-sm">
              <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-xs text-slate-400 block">Data e Hora</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {new Date(selectedLog.timestamp).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">IP de Origem</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {selectedLog.ipAddress || '127.0.0.1'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Usuário Requisitante</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedLog.userName} ({selectedLog.userRole})
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Resultado do RBAC</span>
                  <span className="font-semibold flex items-center gap-1 mt-0.5">
                    {getResultIcon(selectedLog.result)}
                    {selectedLog.result}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs text-slate-400 block mb-1">Módulo e Ação</span>
                <div className="flex items-center gap-2">
                  {getModuleBadge(selectedLog.module)}
                  <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">
                    {selectedLog.action}
                  </span>
                </div>
              </div>

              {selectedLog.affectedRecordId && (
                <div>
                  <span className="text-xs text-slate-400 block">Registro Afetado</span>
                  <p className="font-mono text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded text-slate-800 dark:text-slate-200 mt-1">
                    Tipo: {selectedLog.affectedRecordType || 'Registro'} | ID: {selectedLog.affectedRecordId}
                  </p>
                </div>
              )}

              <div>
                <span className="text-xs text-slate-400 block">Descrição Detalhada</span>
                <p className="text-slate-700 dark:text-slate-300 mt-1 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  {selectedLog.details || 'Sem detalhes adicionais.'}
                </p>
              </div>

              {selectedLog.oldValue && (
                <div>
                  <span className="text-xs text-rose-500 font-semibold block">Valor Anterior</span>
                  <pre className="text-xs font-mono bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-300 p-2.5 rounded-lg overflow-x-auto mt-1">
                    {selectedLog.oldValue}
                  </pre>
                </div>
              )}

              {selectedLog.newValue && (
                <div>
                  <span className="text-xs text-emerald-500 font-semibold block">Novo Valor</span>
                  <pre className="text-xs font-mono bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-300 p-2.5 rounded-lg overflow-x-auto mt-1">
                    {selectedLog.newValue}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
