import React, { useState, useRef, useEffect } from 'react';
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
  Sliders,
  Sparkles,
  Terminal,
  Search,
  CheckSquare,
  Square,
  UserCheck,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { ApiService } from '../services/apiService';
import { User } from '../types';

interface PreviewOrderRow {
  rowKey: string;
  idChamado: string;
  dtVisita: string;
  tipoVisita: string;
  prestadorPlanilha: string;
  technicianId: string;
  technicianName: string;
  statusOS: string;
  cidade: string;
  uf: string;
  cep: string;
  bairro: string;
  km: number;
  pedagio: number;
  valorVisita: number;
  totalCalculado: number;
  selected: boolean;
}

export const DataImportView: React.FC = () => {
  const {
    addToast,
    reloadAllData,
    setActiveTab,
    users = [],
    setSelectedMonth,
    setSelectedYear,
    setSelectedPeriod,
  } = useApp();

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>('');

  // Preview & Fine-tuning State
  const [previewRows, setPreviewRows] = useState<PreviewOrderRow[]>([]);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [detectedFileTechName, setDetectedFileTechName] = useState<string | null>(null);
  const [detectedPeriodInfo, setDetectedPeriodInfo] = useState<{
    year: number;
    month: number;
    period: 1 | 2;
    monthName: string;
  } | null>(null);
  const [bulkTechId, setBulkTechId] = useState<string>('');
  const [previewSearch, setPreviewSearch] = useState<string>('');
  const [previewFilterStatus, setPreviewFilterStatus] = useState<string>('ALL');

  // Logs & Diagnostics State
  const [showLogs, setShowLogs] = useState<boolean>(true);
  const [importLogs, setImportLogs] = useState<Array<{ timestamp: string; level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR'; message: string }>>([]);

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

  const [activeSubTab, setActiveSubTab] = useState<'operacional' | 'tabela_precos' | 'estoque'>('operacional');
  const [portoPrices, setPortoPrices] = useState<any[]>([]);
  const [portoPricesLoading, setPortoPricesLoading] = useState<boolean>(false);
  const [portoPricesEffectiveDate, setPortoPricesEffectiveDate] = useState<string>('2026-07-29');
  const [portoPriceUploading, setPortoPriceUploading] = useState<boolean>(false);
  const [portoPricePreviewRows, setPortoPricePreviewRows] = useState<any[]>([]);
  const [isPortoPreviewing, setIsPortoPreviewing] = useState<boolean>(false);
  const [portoPriceEffectiveDatePreview, setPortoPriceEffectiveDatePreview] = useState<string>('2026-07-29');
  const [portoPriceSelectedFile, setPortoPriceSelectedFile] = useState<File | null>(null);

  const formatIsoDateToBr = (isoStr: string) => {
    if (!isoStr) return '';
    const dateOnly = isoStr.split('T')[0];
    const parts = dateOnly.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`; // "2026-07-29" -> "29/07/2026"
    }
    const slashParts = dateOnly.split('/');
    if (slashParts.length === 3) {
      return dateOnly; // Já está formatado
    }
    return isoStr;
  };

  const fetchPortoPrices = async () => {
    setPortoPricesLoading(true);
    try {
      const response = await fetch('/api/admin/porto-prices');
      const data = await response.json();
      if (data.success) {
        setPortoPrices(data.data || []);
        if (data.data && data.data.length > 0) {
          setPortoPricesEffectiveDate(data.data[0].effective_date || '2026-07-29');
        }
      }
    } catch (err) {
      console.error("[Porto Prices Fetch Error]", err);
    } finally {
      setPortoPricesLoading(false);
    }
  };

  const handlePreviewPortoPrices = async (file: File) => {
    setPortoPriceUploading(true);
    setPortoPriceSelectedFile(file);
    addLog('INFO', `Lendo planilha de preços Porto Seguro: ${file.name}`);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      const sheetName = workbook.SheetNames.find(name => 
        name.toLowerCase().includes('tabela de precos') || 
        name.toLowerCase().includes('precos') || 
        name.toLowerCase().includes('porto')
      ) || workbook.SheetNames[0];
      
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        addToast('Aba Não Encontrada', 'Aba "Tabela de Preços" não foi encontrada no arquivo.', 'error');
        addLog('ERROR', 'Aba "Tabela de Preços" não foi encontrada no arquivo.');
        return;
      }

      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (rows.length < 5) {
        addToast('Arquivo Muito Curto', 'A planilha de preços está vazia ou mal estruturada (menos de 5 linhas).', 'error');
        addLog('ERROR', 'A planilha de preços está vazia ou mal estruturada.');
        return;
      }

      // Extrair a data de vigência preservando a string original (ex: regex /(\d{2}\/\d{2}\/\d{4})/ na célula A1 -> "29/07/2026")
      let effectiveDateStr = '29/07/2026'; 
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const rowText = rows[i].map((cell: any) => String(cell || '')).join(' ');
        const match = rowText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (match) {
          effectiveDateStr = match[0]; // e.g. "29/07/2026"
          break;
        }
      }

      setPortoPriceEffectiveDatePreview(effectiveDateStr);

      const parsedPrices: any[] = [];
      for (let i = 4; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;

        const category = String(row[0] || '').trim();
        const serviceName = String(row[1] || '').trim();
        if (!category || !serviceName || serviceName.toLowerCase().includes('serviço') || category.toLowerCase().includes('categoria')) {
          continue; 
        }

        const completedPrice = Number(row[2]) || 0;
        const additionalPrice = Number(row[3]) || 0;

        // Coluna E (índice 4): additional_item_price. Converter vazios ou hífens para 0.00.
        const rawAdditionalItem = row[4];
        let additionalItemPrice = 0;
        if (rawAdditionalItem !== undefined && rawAdditionalItem !== null) {
          const cleanStr = String(rawAdditionalItem).replace(/[\s\-R$]/g, '').replace(',', '.').trim();
          additionalItemPrice = cleanStr === '' || cleanStr === '-' ? 0 : (Number(cleanStr) || 0);
        }

        parsedPrices.push({
          category,
          service_name: serviceName,
          completed_price: completedPrice,
          additional_price: additionalPrice,
          additional_item_price: additionalItemPrice
        });
      }

      setPortoPricePreviewRows(parsedPrices);
      setIsPortoPreviewing(true);
      addLog('SUCCESS', `Planilha de preços Porto Seguro processada! ${parsedPrices.length} serviços encontrados para vigência ${effectiveDateStr}.`);
      addToast(
        'Planilha Processada',
        `Carregados ${parsedPrices.length} itens para a pré-visualização.`,
        'success'
      );
    } catch (err: any) {
      addLog('ERROR', `Erro ao analisar planilha de preços Porto Seguro: ${err.message}`);
      addToast('Erro ao Analisar', `Não foi possível interpretar a planilha Excel: ${err.message}`, 'error');
    } finally {
      setPortoPriceUploading(false);
    }
  };

  const handleConfirmPortoPrices = async () => {
    setPortoPriceUploading(true);
    addLog('INFO', `Gravando ${portoPricePreviewRows.length} itens de preço no servidor...`);
    try {
      const response = await fetch('/api/admin/import/porto-prices/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prices: portoPricePreviewRows,
          effectiveDate: portoPriceEffectiveDatePreview,
        }),
      });
      const data = await response.json();
      if (data.success) {
        addLog('SUCCESS', `Tabela de Preços gravada com sucesso! Novas: ${data.data?.importedCount || 0}, Atualizadas: ${data.data?.updatedCount || 0}.`);
        addToast(
          'Tabela Gravada',
          `Tabela de Preços gravada com sucesso! Novas: ${data.data?.importedCount || 0}, Atualizadas: ${data.data?.updatedCount || 0}.`,
          'success'
        );
        setIsPortoPreviewing(false);
        setPortoPricePreviewRows([]);
        setPortoPriceSelectedFile(null);
        fetchPortoPrices();
      } else {
        addLog('ERROR', `Erro ao gravar tabela: ${data.error || data.message || 'Erro desconhecido'}`);
        addToast('Erro ao Gravar', data.error || data.message || 'Ocorreu um erro ao salvar a tabela de preços.', 'error');
      }
    } catch (err: any) {
      addLog('ERROR', `Erro de rede ao salvar tabela de preços: ${err.message}`);
      addToast('Erro de Rede', `Não foi possível comunicar com o servidor: ${err.message}`, 'error');
    } finally {
      setPortoPriceUploading(false);
    }
  };

  useEffect(() => {
    fetchPortoPrices();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR', message: string) => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setImportLogs((prev) => [...prev, { timestamp: time, level, message }]);
  };

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
      validateAndParseFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      validateAndParseFile(file);
    }
  };

  // Parse Currency helper
  const parseMoney = (val: any): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    let s = String(val).trim().replace('R$', '').replace(/\s/g, '');
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
  };

  // Parse KM helper
  const parseKm = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const clean = String(val).replace(/[^\d.,]/g, '').replace(',', '.');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : Math.round(num);
  };

  // Parse Date helper
  const parseDateStr = (val: any): string => {
    if (!val) return new Date().toISOString().split('T')[0];
    if (typeof val === 'number') {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    }
    const s = String(val).trim();
    const brMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (brMatch) {
      return `${brMatch[3]}-${brMatch[2].padStart(2, '0')}-${brMatch[1].padStart(2, '0')}`;
    }
    return s;
  };

  // Read and generate live preview from uploaded spreadsheet
  const validateAndParseFile = async (file: File) => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValid) {
      addToast(
        'Formato Incompatível',
        'O formato do arquivo selecionado não é homologado. Utilize planilhas .xlsx, .xls ou .csv.',
        'error'
      );
      return;
    }

    setSelectedFile(file);
    setImportResult(null);
    setImportLogs([]);
    addLog('INFO', `Arquivo selecionado: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawJson = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' });

      addLog('INFO', `Aba carregada: "${firstSheetName}" com ${rawJson.length} linhas brutas.`);

      // 1. Detect technician name from filename
      const cleanFileName = file.name.toUpperCase();
      let fileTech: User | undefined = undefined;
      for (const u of users) {
        if (!u.name) continue;
        const firstName = u.name.split(' ')[0].toUpperCase();
        if (firstName.length >= 3 && cleanFileName.includes(firstName)) {
          fileTech = u;
          break;
        }
      }

      if (fileTech) {
        setDetectedFileTechName(fileTech.name);
        addLog('SUCCESS', `Técnico identificado pelo nome do arquivo: "${fileTech.name}" (ID: ${fileTech.id})`);
      } else {
        setDetectedFileTechName(null);
        addLog('WARN', 'Nenhum técnico específico identificado no nome do arquivo. Realizando mapeamento por linhas.');
      }

      // 2. Parse and filter rows
      const parsedRows: PreviewOrderRow[] = [];
      let ignoredCount = 0;

      const monthNamesBr = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];

      const getRowField = (r: any, candidates: string[]) => {
        const rKeys = Object.keys(r);
        const sanitize = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_.]+/g, '');
        
        for (const target of candidates) {
          const cleanTarget = sanitize(target);
          for (const k of rKeys) {
            const cleanK = sanitize(k);
            if (cleanK === cleanTarget) return r[k];
          }
        }
        for (const target of candidates) {
          const cleanTarget = sanitize(target);
          for (const k of rKeys) {
            const cleanK = sanitize(k);
            if (cleanK.includes(cleanTarget) || cleanTarget.includes(cleanK)) return r[k];
          }
        }
        return '';
      };

      for (let i = 0; i < rawJson.length; i++) {
        const row = rawJson[i];
        const origem = String(getRowField(row, ['Origem', 'origem']) || '').trim();
        const prestador = String(getRowField(row, ['Prestador', 'Tecnico', 'Técnico', 'tecnico', 'Prestador / Tecnico', 'Tecnico Vinculado']) || '').trim();
        const tipoVisita = String(getRowField(row, ['Tipo Visita', 'Tipo de Visita', 'Tipo_Visita', 'Serviço', 'Servico', 'Categoria']) || '').trim();
        const idChamado = String(getRowField(row, ['IdChamado', 'Id Chamado', 'ID Chamado', 'Chamado', 'OS', 'Numero Chamado']) || `IMP-${Date.now()}-${i}`).trim();

        // Check summary row
        const rowStr = `${origem} ${prestador} ${tipoVisita} ${idChamado}`.toLowerCase();
        if (
          rowStr.includes('total') ||
          rowStr.includes('totais') ||
          rowStr.includes('vale') ||
          rowStr.includes('adiantamento') ||
          rowStr.includes('líquido') ||
          rowStr.includes('liquido') ||
          rowStr.includes('bruto') ||
          (!tipoVisita && !idChamado)
        ) {
          ignoredCount++;
          continue;
        }

        // Determine technician
        let rowTechId = '';
        let rowTechName = 'Não Alocado';

        if (prestador && prestador !== 'O Higienizador' && prestador !== 'A HIGIENIZADORA' && prestador !== 'Prestador' && prestador.length >= 3) {
          // Look up in users ignoring accents
          const sanitizeStr = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          const cleanPrestador = sanitizeStr(prestador);
          
          const matchedUser = users.find((u) => {
            const cleanName = sanitizeStr(u.name);
            const cleanFirstName = cleanName.split(' ')[0];
            return cleanName === cleanPrestador || cleanName.includes(cleanPrestador) || (cleanFirstName.length >= 3 && cleanPrestador.includes(cleanFirstName));
          });
          
          if (matchedUser) {
            rowTechId = matchedUser.id;
            rowTechName = matchedUser.name;
          } else {
            rowTechName = prestador;
          }
        } else if (fileTech) {
          rowTechId = fileTech.id;
          rowTechName = fileTech.name;
        }

        const km = parseKm(getRowField(row, ['KM', 'Km', 'Km Rodado', 'Quilometragem', 'KM Rodado']));
        const pedagio = parseMoney(getRowField(row, ['Pedágio', 'PEDAGIO', 'Pedagio', 'pedagio', 'Valor Pedagio', 'Vl Pedagio']));
        let valorVisita = parseMoney(getRowField(row, ['VALOR DA VISITA', 'VALOR DA VISTA', 'Valor da Visita', 'Valor da Vista', 'Valor Visita', 'Valor', 'Vl Visita', 'Vl. Visita', 'Base Fee']));
        const dtVisita = parseDateStr(getRowField(row, ['Dt.Visita', 'Dt Visita', 'Data Visita', 'Data', 'Dt_Visita', 'Data_Visita', 'Dt. Visita']));
        const statusRaw = String(getRowField(row, ['Status OS', 'Status_OS', 'Status', 'status', 'Situacao', 'Situação']) || 'COMPLETED').toUpperCase();
        
        let statusOS: 'COMPLETED' | 'CANCELLED' | 'IN_PROGRESS' | 'PENDING' = 'COMPLETED';
        if (statusRaw.includes('PERD') || statusRaw.includes('AUSEN')) {
          statusOS = 'COMPLETED';
          if (valorVisita <= 0) valorVisita = 20.00;
        } else if (statusRaw.includes('CANC') || statusRaw.includes('RECUS') || statusRaw.includes('IMPOSS')) {
          statusOS = 'CANCELLED';
        } else if (statusRaw.includes('ANDA') || statusRaw.includes('EXEC') || statusRaw.includes('INIC')) {
          statusOS = 'IN_PROGRESS';
        } else if (statusRaw.includes('PEND') || statusRaw.includes('AGEN')) {
          statusOS = 'PENDING';
        }

        if (valorVisita <= 0 && statusOS === 'COMPLETED') {
          let foundPrice = 0;
          
          const isServiceMatch = (visitaRaw: string, tableServiceRaw: string) => {
            const sanitize = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const v = sanitize(visitaRaw);
            const s = sanitize(tableServiceRaw);
            if (v === s || v.includes(s) || s.includes(v)) return true;
            
            const vNorm = v.replace('inst.', 'instalacao').replace('inst ', 'instalacao ').replace(' coifa', ' depurador e coifa');
            const sNorm = s.replace('inst.', 'instalacao').replace('inst ', 'instalacao ').replace(' coifa', ' depurador e coifa');
            if (vNorm.includes(sNorm) || sNorm.includes(vNorm)) return true;
            
            // TV specifics
            if (vNorm.includes('tv') && sNorm.includes('tv')) {
              const vIsLarge = vNorm.includes('50 a 65') || vNorm.includes('66 a 98') || vNorm.includes('acima');
              const sIsLarge = sNorm.includes('acima');
              if (vIsLarge && sIsLarge) return true;
              if (!vIsLarge && !sIsLarge && (vNorm.includes('ate 49') || vNorm.includes('ate 55')) && sNorm.includes('ate 55')) return true;
            }

            const getTokens = (str: string) => str.split(/[\s\-+/]+/).filter(t => t.length > 2 && !['com', 'sem', 'ate', 'para', 'de', 'da', 'do', 'em'].includes(t));
            const vTokens = getTokens(vNorm);
            const sTokens = getTokens(sNorm);
            
            let matchCount = 0;
            for (const st of sTokens) {
              if (vTokens.some(vt => vt === st || vt.startsWith(st) || st.startsWith(vt))) {
                matchCount++;
              }
            }
            if (sTokens.length > 0 && matchCount >= Math.max(1, sTokens.length - 1)) {
              return true;
            }
            return false;
          };

          const searchUsers = rowTechId ? [users.find(u => u.id === rowTechId), ...users] : users;
          for (const u of searchUsers) {
            if (u && (u as any).priceTable && Array.isArray((u as any).priceTable)) {
              const pTable: any[] = (u as any).priceTable;
              const match = pTable.find(p => isServiceMatch(tipoVisita, p.serviceType || ''));
              if (match && match.prepostoPrice) {
                foundPrice = match.prepostoPrice;
                break;
              }
            }
          }
          if (foundPrice > 0) {
            valorVisita = foundPrice;
          }
        }

        const totalCalculado = Number((valorVisita + km * 0.50 + pedagio).toFixed(2));
        const rowKey = `${idChamado}-${dtVisita}-${statusOS}-${parsedRows.length + 1}`;

        parsedRows.push({
          rowKey,
          idChamado,
          dtVisita,
          tipoVisita: tipoVisita || 'Instalação / Higienização',
          prestadorPlanilha: prestador || 'O Higienizador',
          technicianId: rowTechId,
          technicianName: rowTechName,
          statusOS,
          cidade: String(getRowField(row, ['Cidade', 'cidade']) || 'São Paulo').trim(),
          uf: String(getRowField(row, ['UF', 'uf']) || 'SP').trim().toUpperCase(),
          cep: String(getRowField(row, ['CEP', 'cep']) || '---').trim(),
          bairro: String(getRowField(row, ['Bairro', 'bairro']) || '---').trim(),
          km,
          pedagio,
          valorVisita,
          totalCalculado,
          selected: true,
        });
      }

      // Detecção Automática do Período (Ano, Mês e Quinzena)
      if (parsedRows.length > 0) {
        const periodCounts: Record<string, number> = {};
        parsedRows.forEach((r) => {
          if (r.dtVisita) {
            const parts = r.dtVisita.split('-');
            if (parts.length === 3) {
              const y = parseInt(parts[0], 10);
              const m = parseInt(parts[1], 10);
              const d = parseInt(parts[2], 10);
              if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                const p = d <= 15 ? 1 : 2;
                const key = `${y}-${m}-${p}`;
                periodCounts[key] = (periodCounts[key] || 0) + 1;
              }
            }
          }
        });

        let topPeriodKey = '';
        let topCount = 0;
        Object.entries(periodCounts).forEach(([k, count]) => {
          if (count > topCount) {
            topCount = count;
            topPeriodKey = k;
          }
        });

        if (topPeriodKey) {
          const [detY, detM, detP] = topPeriodKey.split('-').map(Number);
          const monthLabel = monthNamesBr[detM - 1] || `Mês ${detM}`;
          setDetectedPeriodInfo({
            year: detY,
            month: detM,
            period: detP as 1 | 2,
            monthName: monthLabel,
          });
          addLog('INFO', `Período detectado: ${detP}ª Quinzena de ${monthLabel}/${detY} (${topCount} ordens)`);
        }
      }

      setPreviewRows(parsedRows);
      setIsPreviewing(true);
      addLog(
        'SUCCESS',
        `Pré-visualização gerada com sucesso: ${parsedRows.length} chamados operacionais válidos (${ignoredCount} linhas de totais ignoradas).`
      );
    } catch (err: any) {
      addLog('ERROR', `Falha ao ler planilha: ${err.message}`);
      addToast('Erro na Planilha', 'Não foi possível interpretar o arquivo selecionado.', 'error');
    }
  };

  // Bulk technician assignment
  const handleApplyBulkTechnician = () => {
    if (!bulkTechId) {
      addToast('Selecione um Técnico', 'Escolha o técnico que deseja aplicar às linhas selecionadas.', 'warning');
      return;
    }

    const tech = users.find((u) => u.id === bulkTechId);
    if (!tech) return;

    setPreviewRows((prev) =>
      prev.map((row) =>
        row.selected
          ? { ...row, technicianId: tech.id, technicianName: tech.name }
          : row
      )
    );

    const selectedCount = previewRows.filter((r) => r.selected).length;
    addLog('INFO', `Técnico "${tech.name}" atribuído a ${selectedCount} chamados selecionados.`);
    addToast('Técnico Atribuído', `"${tech.name}" foi vinculado a ${selectedCount} linhas da prévia.`, 'success');
  };

  // Row update helper
  const handleUpdateRowField = (rowKey: string, field: keyof PreviewOrderRow, value: any) => {
    setPreviewRows((prev) =>
      prev.map((r) => {
        if (r.rowKey !== rowKey) return r;
        const target = { ...r, [field]: value };

        if (field === 'technicianId') {
          const found = users.find((u) => u.id === value);
          target.technicianName = found ? found.name : 'Não Alocado';
        }

        if (field === 'km' || field === 'pedagio' || field === 'valorVisita') {
          const km = Number(target.km) || 0;
          const ped = Number(target.pedagio) || 0;
          const vis = Number(target.valorVisita) || 0;
          target.totalCalculado = Number((vis + km * 0.50 + ped).toFixed(2));
        }

        return target;
      })
    );
  };

  // Toggle selection
  const handleToggleSelectAll = (checked: boolean) => {
    setPreviewRows((prev) => prev.map((r) => ({ ...r, selected: checked })));
  };

  // Execute Direct Spreadsheet Import
  const handleExecuteDirectSpreadsheet = async () => {
    if (!selectedFile) {
      addToast('Arquivo Ausente', 'Selecione uma planilha antes de iniciar a importação massiva.', 'warning');
      return;
    }

    setIsProcessing(true);
    setProgressStatus('Processando importação massiva e estruturando dados...');
    setImportResult(null);
    addLog('INFO', 'Iniciando processamento direto na base de dados...');

    try {
      const res = await ApiService.importOrdersSpreadsheet(selectedFile);

      if (res.success) {
        setImportResult(res);
        addLog(
          'SUCCESS',
          `Importação estrutural concluída: ${res.importedCount || 0} OS integradas, ${res.techniciansCreated || 0} novos técnicos homologados.`
        );
        addToast(
          'Importação Concluída com Sucesso',
          `${res.importedCount || 0} ordens importadas e integradas à base de dados.`,
          'success'
        );
        await reloadAllData();
      } else {
        setImportResult(res);
        addLog('ERROR', `Falha no processamento: ${res.error || 'Erro estrutural desconhecido.'}`);
        addToast('Falha na Importação', res.error || 'Ocorreu um erro estrutural ao processar a planilha.', 'error');
      }
    } catch (err: any) {
      addLog('ERROR', `Falha de comunicação com o servidor: ${err.message}`);
      setImportResult({
        success: false,
        error: err.message || 'Ocorreu um erro inesperado durante a comunicação com o servidor.',
      });
      addToast('Erro na Importação', err.message || 'Falha de comunicação com o servidor.', 'error');
    } finally {
      setIsProcessing(false);
      setProgressStatus('');
    }
  };

  // Execute Fine-Tuned JSON Import
  const handleConfirmAndSaveFineTuned = async () => {
    const selectedRows = previewRows.filter((r) => r.selected);
    if (selectedRows.length === 0) {
      addToast('Ausência de Seleção', 'Selecione pelo menos uma ordem de serviço para importar.', 'warning');
      return;
    }

    setIsProcessing(true);
    setProgressStatus(`Consolidando ${selectedRows.length} ordens validadas na base de dados...`);
    addLog('INFO', `Iniciando processamento em lote de ${selectedRows.length} ordens validadas...`);

    try {
      const payloadOrders = selectedRows.map((r) => ({
        Origem: 'Porto Seguro',
        IdChamado: r.idChamado,
        'Dt.Visita': r.dtVisita,
        'Tipo Visita': r.tipoVisita,
        Prestador: r.technicianName !== 'Não Alocado' ? r.technicianName : r.prestadorPlanilha,
        Tecnico: r.technicianName !== 'Não Alocado' ? r.technicianName : r.prestadorPlanilha,
        technicianId: r.technicianId || undefined,
        'Status OS': r.statusOS,
        Status: r.statusOS,
        Cidade: r.cidade,
        UF: r.uf,
        CEP: r.cep,
        Bairro: r.bairro,
        KM: r.km,
        Pedágio: r.pedagio,
        PEDAGIO: r.pedagio,
        'Valor da Visita': r.valorVisita,
        'VALOR DA VISTA': r.valorVisita,
        Total: r.totalCalculado,
      }));

      const res = await ApiService.importOrdersJson(payloadOrders);

      if (res.success) {
        if (detectedPeriodInfo) {
          setSelectedYear(detectedPeriodInfo.year);
          setSelectedMonth(detectedPeriodInfo.month);
          setSelectedPeriod(detectedPeriodInfo.period);
        }

        setImportResult({
          success: true,
          message: `${res.importedCount || selectedRows.length} ordens consolidadas e vinculadas aos respectivos técnicos.`,
          importedCount: res.importedCount || selectedRows.length,
          techniciansCreated: res.techniciansCreated || 0,
        });
        addLog(
          'SUCCESS',
          `Processamento em lote concluído: ${res.importedCount || selectedRows.length} ordens estruturadas com sucesso.`
        );
        addToast(
          'Ordens Consolidadas',
          `${res.importedCount || selectedRows.length} ordens integradas à base de dados.`,
          'success'
        );
        await reloadAllData();
      } else {
        setImportResult({
          success: false,
          error: res.error || 'Falha ao consolidar ordens no sistema.',
        });
        addLog('ERROR', `Falha estrutural: ${res.error}`);
        addToast('Falha na Importação', res.error || 'Ocorreu um erro ao processar o lote de ordens.', 'error');
      }
    } catch (err: any) {
      addLog('ERROR', `Falha de comunicação com o servidor: ${err.message}`);
      setImportResult({
        success: false,
        error: err.message || 'Falha de comunicação com o servidor.',
      });
      addToast('Falha de Comunicação', err.message, 'error');
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
          IdChamado: '10866922',
          'Dt.Visita': '14/08/2026',
          'Tipo Visita': 'Instala TV de 49 a 86 + Suporte Fixo',
          Prestador: 'O Higienizador',
          'Status OS': 'Concluído',
          Cidade: 'RIBEIRAO PIRES',
          UF: 'SP',
          CEP: '09400-000',
          Bairro: 'ALIANCA',
          KM: 32,
          Pedágio: 'R$ 0,00',
          'Valor da Visita': 'R$ 20,00',
        },
        {
          Origem: 'Porto Seguro',
          IdChamado: '10866199',
          'Dt.Visita': '12/08/2026',
          'Tipo Visita': 'Instala TV de 49 a 86 + Suporte Fixo',
          Prestador: 'O Higienizador',
          'Status OS': 'Concluído',
          Cidade: 'GUARULHOS',
          UF: 'SP',
          CEP: '07000-000',
          Bairro: 'VILA ALZIRA',
          KM: 70,
          Pedágio: 'R$ 0,00',
          'Valor da Visita': 'R$ 20,00',
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

  const allSelected = previewRows.length > 0 && previewRows.every((r) => r.selected);
  const selectedCount = previewRows.filter((r) => r.selected).length;
  const filteredPreviewRows = previewRows.filter((row) => {
    if (previewFilterStatus !== 'ALL' && row.statusOS !== previewFilterStatus) return false;
    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase();
      return (
        row.idChamado.toLowerCase().includes(q) ||
        row.tipoVisita.toLowerCase().includes(q) ||
        row.technicianName.toLowerCase().includes(q) ||
        row.cidade.toLowerCase().includes(q) ||
        row.bairro.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div id="data-import-view" className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Cabeçalho da Central de Importações */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-[#003366] tracking-tight">
            Central de Importações Administrativa
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gestão consolidada de fechamentos Porto Seguro, tabelas de preço de serviços contratuais e controle futuro de insumos.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveSubTab('operacional')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'operacional'
                ? 'bg-[#003366] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Fechamento Operacional
          </button>
          <button
            onClick={() => setActiveSubTab('tabela_precos')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'tabela_precos'
                ? 'bg-[#003366] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tabela de Preços Porto
          </button>
          <button
            onClick={() => setActiveSubTab('estoque')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'estoque'
                ? 'bg-[#003366] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Estoque & Insumos
          </button>
        </div>
      </div>

      {activeSubTab === 'operacional' && (
        <div className="space-y-6">
          {/* Top Action Bar */}
      <div className="flex items-center justify-end gap-3">
        <button
          id="btn-download-template"
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-xs cursor-pointer"
        >
          <Download className="w-4 h-4 text-slate-500" />
          Baixar Modelo Excel (.xlsx)
        </button>
      </div>

      {/* Regras e Especificações da Importação */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start gap-3">
          <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Vínculo Relacional Automático</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Detecta o nome do técnico no nome do arquivo (ex: "BRENO") ou nas colunas da planilha, vinculando diretamente ao seu ID no banco de dados.
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start gap-3">
          <div className="p-2 bg-blue-50 text-blue-700 rounded-lg shrink-0 mt-0.5">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Prévia & Ajuste Fino</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Confira a lista de ordens antes de gravar, troque o técnico em massa ou linha a linha e ajuste valores de KM e taxas facilmente.
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start gap-3">
          <div className="p-2 bg-amber-50 text-amber-700 rounded-lg shrink-0 mt-0.5">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Integração com Fechamento</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Cálculo de R$ 0,50/km, pedágios 1:1 e taxas preposto alimentam imediatamente o extrato do técnico e o relatório quinzenal.
            </p>
          </div>
        </div>
      </div>

      {/* Área de Upload Drag & Drop */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-blue-600" />
            Selecione ou Arraste a Planilha da Porto Seguro
          </h2>
          {detectedFileTechName && (
            <span className="px-3 py-1 bg-emerald-100 text-emerald-900 rounded-full font-bold text-xs flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
              <span>Técnico Detectado no Arquivo: {detectedFileTechName}</span>
            </span>
          )}
        </div>

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
                <p className="text-sm font-bold text-slate-900">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB &bull; {previewRows.length} linhas interpretadas
                </p>
                <span className="inline-block mt-2 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full">
                  Pronto para Prévia e Ajuste Fino
                </span>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-700">
                  <span className="font-bold text-blue-600 hover:underline">
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

        {/* Botões de Ação de Upload */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowLogs(!showLogs)}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-slate-500" />
              <span>Logs & Diagnóstico {showLogs ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />}</span>
            </button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {selectedFile && (
              <button
                id="btn-clear-file"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                  setPreviewRows([]);
                  setIsPreviewing(false);
                  setImportResult(null);
                  setDetectedFileTechName(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isProcessing}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Limpar Arquivo
              </button>
            )}

            {selectedFile && !isPreviewing && (
              <button
                id="btn-start-import-direct"
                type="button"
                onClick={handleExecuteDirectSpreadsheet}
                disabled={isProcessing}
                className="px-5 py-2 bg-[#003366] hover:bg-[#00264d] text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                <span>{isProcessing ? 'Processando Importação...' : 'Importação Direta Automática'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CONSOLE DE LOGS & DIAGNÓSTICO */}
      {showLogs && importLogs.length > 0 && (
        <div className="bg-slate-900 text-slate-200 rounded-xl p-4 font-mono text-xs shadow-inner space-y-2 border border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-slate-400 font-bold flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              Logs de Execução e Mapeamento em Tempo Real
            </span>
            <span className="text-[10px] text-slate-500">{importLogs.length} eventos registrados</span>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
            {importLogs.map((log, i) => (
              <div key={i} className="flex items-start space-x-2">
                <span className="text-slate-500 text-[10px] shrink-0">[{log.timestamp}]</span>
                <span
                  className={`font-bold shrink-0 text-[10px] ${
                    log.level === 'SUCCESS'
                      ? 'text-emerald-400'
                      : log.level === 'WARN'
                      ? 'text-amber-400'
                      : log.level === 'ERROR'
                      ? 'text-red-400'
                      : 'text-cyan-400'
                  }`}
                >
                  [{log.level}]
                </span>
                <span className="text-slate-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PREVIEW E AJUSTE FINO (MELHORIA 1) */}
      {isPreviewing && previewRows.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 animate-fadeIn">
          {/* Header da Prévia */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-[#003366]">
                  Pré-Visualização & Ajuste Fino ({previewRows.length} chamados)
                </h3>
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-900 rounded-full font-bold text-xs">
                  {selectedCount} selecionados
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Revise os técnicos atribuídos, ajuste valores ou realize correções manuais antes de confirmar a gravação.
              </p>
            </div>

            {/* Ações em Massa */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center space-x-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                <span className="text-xs font-bold text-slate-600">Atribuir Técnico:</span>
                <select
                  value={bulkTechId}
                  onChange={(e) => setBulkTechId(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded text-xs font-bold text-slate-800"
                >
                  <option value="">Selecione o técnico...</option>
                  {users
                    .filter((u) => u.role === 'TECHNICIAN')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={handleApplyBulkTechnician}
                  className="px-3 py-1 bg-[#003366] hover:bg-[#00264d] text-white rounded text-xs font-bold cursor-pointer"
                >
                  Aplicar aos Selecionados
                </button>
              </div>

              <button
                type="button"
                onClick={handleConfirmAndSaveFineTuned}
                disabled={isProcessing || selectedCount === 0}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-black shadow-md flex items-center space-x-2 cursor-pointer"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{isProcessing ? 'Gravando Ordens...' : `Confirmar e Salvar ${selectedCount} Ordens`}</span>
              </button>
            </div>
          </div>

          {/* Filtros e Busca na Prévia */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={previewSearch}
                onChange={(e) => setPreviewSearch(e.target.value)}
                placeholder="Filtrar por chamado, serviço, cidade..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <span className="font-bold text-slate-500">Status:</span>
              {['ALL', 'COMPLETED', 'CANCELLED', 'PENDING'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setPreviewFilterStatus(st)}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                    previewFilterStatus === st
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st === 'ALL' ? 'Todos' : st === 'COMPLETED' ? 'Concluído' : st === 'CANCELLED' ? 'Cancelado' : 'Pendente'}
                </button>
              ))}
            </div>
          </div>

          {/* Tabela de Ajuste Fino */}
          <div className="border border-slate-200 rounded-xl overflow-auto max-h-96">
            <table className="w-full text-left text-xs min-w-[1000px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-3">IdChamado</th>
                  <th className="py-2.5 px-3">Dt. Visita</th>
                  <th className="py-2.5 px-3">Tipo Visita / Escopo</th>
                  <th className="py-2.5 px-3">Técnico Vinculado (Ajuste Fino)</th>
                  <th className="py-2.5 px-3">Cidade / UF</th>
                  <th className="py-2.5 px-2 text-right">KM</th>
                  <th className="py-2.5 px-2 text-right">Pedágio</th>
                  <th className="py-2.5 px-2 text-right">Valor Visita</th>
                  <th className="py-2.5 px-3 text-right">Total Calculado</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPreviewRows.map((row) => {
                  return (
                    <tr
                      key={row.rowKey}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        row.technicianName === 'Não Alocado' ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) => handleUpdateRowField(row.rowKey, 'selected', e.target.checked)}
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                        />
                      </td>

                      {/* Chamado */}
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">
                        {row.idChamado}
                      </td>

                      {/* Data Visita */}
                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                        {row.dtVisita}
                      </td>

                      {/* Tipo Visita */}
                      <td className="py-2 px-3 font-medium text-slate-800 max-w-xs truncate" title={row.tipoVisita}>
                        {row.tipoVisita}
                      </td>

                      {/* Técnico Selecionável */}
                      <td className="py-2 px-3">
                        <select
                          value={row.technicianId}
                          onChange={(e) => handleUpdateRowField(row.rowKey, 'technicianId', e.target.value)}
                          className={`px-2 py-1 rounded text-xs font-bold border transition-colors ${
                            row.technicianId === '' && row.technicianName !== 'Não Alocado'
                              ? 'bg-blue-50 text-blue-900 border-blue-300'
                              : row.technicianName === 'Não Alocado'
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'bg-white text-slate-800 border-slate-200'
                          }`}
                        >
                          <option value="">
                            {row.technicianName !== 'Não Alocado' && row.technicianName !== 'A HIGIENIZADORA' && row.technicianName !== 'O Higienizador'
                              ? `✨ ${row.technicianName} (Será Criado)`
                              : '⚠️ Não Alocado'}
                          </option>
                          {users
                            .filter((u) => u.role === 'TECHNICIAN')
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                        </select>
                      </td>

                      {/* Local */}
                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                        {row.cidade} / {row.uf}
                      </td>

                      {/* KM */}
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          value={row.km}
                          onChange={(e) => handleUpdateRowField(row.rowKey, 'km', Number(e.target.value))}
                          className="w-14 px-1 py-0.5 text-right font-mono font-bold bg-white border border-slate-200 rounded text-xs"
                        />
                      </td>

                      {/* Pedágio */}
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          step="0.1"
                          value={row.pedagio}
                          onChange={(e) => handleUpdateRowField(row.rowKey, 'pedagio', Number(e.target.value))}
                          className="w-16 px-1 py-0.5 text-right font-mono bg-white border border-slate-200 rounded text-xs"
                        />
                      </td>

                      {/* Valor Visita */}
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          step="1"
                          value={row.valorVisita}
                          onChange={(e) => handleUpdateRowField(row.rowKey, 'valorVisita', Number(e.target.value))}
                          className="w-16 px-1 py-0.5 text-right font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded text-xs"
                        />
                      </td>

                      {/* Total Calculado */}
                      <td className="py-2 px-3 text-right font-mono font-black text-emerald-700">
                        R$ {row.totalCalculado.toFixed(2)}
                      </td>

                      {/* Status OS */}
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                            row.statusOS === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : row.statusOS === 'CANCELLED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {row.statusOS === 'COMPLETED' ? 'Concluído' : row.statusOS === 'CANCELLED' ? 'Cancelado' : 'Pendente'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                    <p className="text-xs font-medium text-slate-500">Ordens de Serviço Gravadas</p>
                    <p className="text-2xl font-bold text-emerald-700 mt-1">
                      {importResult.importedCount || 0}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Disponíveis no DataGrid e Fechamento</p>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-emerald-200/80 shadow-xs">
                    <p className="text-xs font-medium text-slate-500">Novos Técnicos Criados</p>
                    <p className="text-2xl font-bold text-indigo-700 mt-1">
                      {importResult.techniciansCreated || 0}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Cadastrados automaticamente</p>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-emerald-200/80 shadow-xs">
                    <p className="text-xs font-medium text-slate-500">Linhas Sanitizadas</p>
                    <p className="text-2xl font-bold text-slate-700 mt-1">
                      {importResult.ignoredRowsCount || 0}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Totais e vales tratados</p>
                  </div>
                </div>

                {/* Botões de Ação Pós-Importação */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    id="btn-go-to-finance-detected"
                    type="button"
                    onClick={() => {
                      if (detectedPeriodInfo) {
                        setSelectedYear(detectedPeriodInfo.year);
                        setSelectedMonth(detectedPeriodInfo.month);
                        setSelectedPeriod(detectedPeriodInfo.period);
                      }
                      setActiveTab('finance');
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm cursor-pointer"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>
                      Ver Fechamento {detectedPeriodInfo ? `(${detectedPeriodInfo.period}ª Qz - ${detectedPeriodInfo.monthName}/${detectedPeriodInfo.year})` : 'Quinzenal'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    id="btn-go-to-orders"
                    type="button"
                    onClick={() => setActiveTab('orders')}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs cursor-pointer"
                  >
                    <span>Ver Ordens de Serviço (OS)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    id="btn-go-to-technicians"
                    type="button"
                    onClick={() => setActiveTab('technicians')}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-slate-500" />
                    <span>Ver Equipe e Tabela de Preços</span>
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Guia de Mapeamento de Colunas */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Info className="w-5 h-5 text-slate-500" />
          Mapeamento das Colunas da Planilha Porto Seguro
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { col: 'Origem', desc: 'Identificação da origem (ex: Porto Seguro)', req: true },
            { col: 'IdChamado', desc: 'Identificador único do atendimento (callNumber)', req: true },
            { col: 'Dt.Visita', desc: 'Data da realização do serviço', req: true },
            { col: 'Tipo Visita', desc: 'Categoria/Tipo do serviço executado', req: true },
            { col: 'Status OS', desc: 'Situação (Concluído, Cancelado, etc.)', req: false },
            { col: 'Tecnico', desc: 'Nome do prestador (busca ou auto-cadastro relacional)', req: true },
            { col: 'KM', desc: 'Quilometragem percorrida (R$ 0,50/km)', req: false },
            { col: 'Pedágio', desc: 'Custos com pedágio comprovados', req: false },
            { col: 'Valor da Visita', desc: 'Taxa base acordada para a visita', req: true },
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
      )}

      {activeSubTab === 'tabela_precos' && (
        <div className="space-y-6">
          {isPortoPreviewing && portoPricePreviewRows.length > 0 ? (
            <div className="space-y-4 animate-fadeIn">
              {/* Header da Prévia de Preços */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-200 rounded-full text-xs font-black uppercase tracking-wider">
                      Modo Pré-Visualização
                    </span>
                    <h3 className="text-lg font-black text-slate-900">
                      Novas Regras Contratuais ({portoPricePreviewRows.length} itens encontrados)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Arquivo: <strong className="text-slate-700">{portoPriceSelectedFile?.name}</strong> &bull; Vigência Detectada na Planilha: <strong className="text-blue-700">{portoPriceEffectiveDatePreview || 'Não Identificada'}</strong>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Revise os preços abaixo. Ao clicar em confirmar, o sistema atualizará o catálogo contratual e reajustará os repasses futuros automaticamente.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={portoPriceUploading}
                    onClick={() => {
                      setIsPortoPreviewing(false);
                      setPortoPricePreviewRows([]);
                      setPortoPriceSelectedFile(null);
                    }}
                    className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                  >
                    Descartar
                  </button>

                  <button
                    type="button"
                    disabled={portoPriceUploading}
                    onClick={handleConfirmPortoPrices}
                    className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-black rounded-lg text-xs flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {portoPriceUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>{portoPriceUploading ? 'Gravando no Servidor...' : 'Confirmar e Gravar Tabela'}</span>
                  </button>
                </div>
              </div>

              {/* Tabela de Preview de Preços */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h4 className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">
                    Lista de Novos Valores Contratuais a Serem Gravados
                  </h4>
                </div>
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] border-b border-slate-100 sticky top-0 z-10">
                      <tr>
                        <th className="py-3 px-4">CATEGORIA</th>
                        <th className="py-3 px-4">NOME DO SERVIÇO</th>
                        <th className="py-3 px-4 text-right">CONCLUÍDO (OS NORMAL)</th>
                        <th className="py-3 px-4 text-right">VENDA NO LOCAL (NOVO SERVIÇO)</th>
                        <th className="py-3 px-4 text-right">ITEM ADICIONAL (ALMOFADA/ASSENTO)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {portoPricePreviewRows.map((item, idx) => {
                        const existingMatch = portoPrices.find(
                          (p) => p.category.toLowerCase() === item.category.toLowerCase() && p.service_name.toLowerCase() === item.service_name.toLowerCase()
                        );
                        const isNew = !existingMatch;
                        const priceChanged = existingMatch && (
                          Number(existingMatch.completed_price) !== Number(item.completed_price) || 
                          Number(existingMatch.additional_price) !== Number(item.additional_price) ||
                          Number(existingMatch.additional_item_price || 0) !== Number(item.additional_item_price || 0)
                        );

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-800">
                              <div className="flex items-center gap-2">
                                <span>{item.category}</span>
                                {isNew && (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[8px] uppercase">Novo</span>
                                )}
                                {priceChanged && (
                                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[8px] uppercase">Alterado</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-600">{item.service_name}</td>
                            <td className="py-3 px-4 text-right">
                              <span className="inline-flex items-center px-2 py-1 rounded bg-emerald-50 text-emerald-800 font-extrabold font-mono text-xs border border-emerald-100 shadow-2xs">
                                R$ {Number(item.completed_price).toFixed(2)}
                              </span>
                              {existingMatch && Number(existingMatch.completed_price) !== Number(item.completed_price) && (
                                <span className="block text-[10px] text-slate-400 line-through">De: R$ {Number(existingMatch.completed_price).toFixed(2)}</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="text-slate-500 font-mono">R$ {Number(item.additional_price).toFixed(2)}</span>
                              {existingMatch && Number(existingMatch.additional_price) !== Number(item.additional_price) && (
                                <span className="block text-[10px] text-slate-400 line-through">De: R$ {Number(existingMatch.additional_price).toFixed(2)}</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {Number(item.additional_item_price || 0) === 0 ? (
                                <span className="text-slate-300 font-bold font-mono">—</span>
                              ) : (
                                <span className="text-slate-600 font-mono font-bold">R$ {Number(item.additional_item_price).toFixed(2)}</span>
                              )}
                              {existingMatch && Number(existingMatch.additional_item_price || 0) !== Number(item.additional_item_price || 0) && (
                                <span className="block text-[10px] text-slate-400 line-through">De: R$ {Number(existingMatch.additional_item_price || 0).toFixed(2)}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Card de Resumo da Tabela de Preços */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600">Vigência Ativa</span>
                    <h3 className="text-2xl font-black text-slate-900 mt-1">
                      {portoPricesEffectiveDate ? formatIsoDateToBr(portoPricesEffectiveDate) : '29/07/2026'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Data em que a tabela contratual oficial de repasse e faturamento entrou em vigência.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-500">Serviços Catalogados</p>
                      <p className="text-xl font-bold text-slate-800 mt-0.5">{portoPrices.length} itens</p>
                    </div>
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-full text-xs font-bold">
                      Sincronizado via BD
                    </span>
                  </div>
                </div>

                {/* Upload de Nova Tabela Contratual */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <UploadCloud className="w-5 h-5 text-blue-600" />
                    Subir Nova Tabela Contratual Porto Seguro
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Carregue uma planilha Excel (.xlsx) contendo as novas colunas e valores contratuais. O sistema processará as palavras-chave e apresentará uma prévia de formatação antes de aplicar as mudanças.
                  </p>

                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      id="porto-price-file-upload"
                      accept=".xlsx, .xls"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handlePreviewPortoPrices(e.target.files[0]);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={portoPriceUploading}
                      onClick={() => document.getElementById('porto-price-file-upload')?.click()}
                      className="px-4 py-2.5 bg-[#003366] hover:bg-[#00264d] text-white font-bold rounded-lg text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {portoPriceUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                      <span>{portoPriceUploading ? 'Lendo Arquivo...' : 'Subir Nova Tabela'}</span>
                    </button>
                    <span className="text-[11px] text-slate-400">Suporta arquivos Excel .xlsx oficiais</span>
                  </div>
                </div>
              </div>

              {/* Tabela de Preços Catalogada */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Lista de Preços de Serviços Contratuais
                  </h3>
                  <span className="px-2.5 py-1 bg-blue-100 text-blue-900 rounded-full text-xs font-bold">
                    Tabela Ativa
                  </span>
                </div>

                <div className="overflow-x-auto">
                  {portoPricesLoading ? (
                    <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center gap-3">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                      <span>Carregando itens contratuais...</span>
                    </div>
                  ) : portoPrices.length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-500">
                      Nenhum preço de serviço cadastrado no banco de dados.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] border-b border-slate-100">
                        <tr>
                          <th className="py-3 px-4">Categoria</th>
                          <th className="py-3 px-4">Nome do Serviço</th>
                          <th className="py-3 px-4">Palavras-chave</th>
                          <th className="py-3 px-4 text-right">Preço Concluído</th>
                          <th className="py-3 px-4 text-right">Preço Adicional</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {portoPrices.map((item, idx) => (
                          <tr key={item.id || idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-800">{item.category}</td>
                            <td className="py-3 px-4 text-slate-600">{item.service_name}</td>
                            <td className="py-3 px-4 font-mono text-[10px] text-slate-500">{item.search_keywords || 'N/A'}</td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-700">R$ {Number(item.completed_price).toFixed(2)}</td>
                            <td className="py-3 px-4 text-right text-slate-500">R$ {Number(item.additional_price || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeSubTab === 'estoque' && (
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-xs space-y-6 text-center max-w-2xl mx-auto my-6 animate-fadeIn">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
            <Layers className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-block px-3 py-1 bg-amber-100 text-amber-900 border border-amber-200 rounded-full font-extrabold text-[11px] uppercase tracking-wider">
              Planejado / Futuro
            </div>
            <h3 className="text-xl font-extrabold text-slate-900">
              Controle de Estoque & Insumos Integrado
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
              Este módulo gerenciará o inventário físico de insumos em tempo real. No momento, o sistema já realiza a baixa automática estrutural do item de estoque padrão <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-amber-700">SUP-TV-44-70</code> (Custo: R$ 28.00) quando um chamado da Porto Seguro é registrado contendo a inclusão de suporte fixo de TV.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-left">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Item Monitorado</span>
              <span className="text-xs font-extrabold text-slate-800">SUP-TV-44-70</span>
              <span className="text-[11px] text-slate-500 block mt-0.5">Suporte de TV Fixo (44" a 70")</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Custo Unitário</span>
              <span className="text-xs font-extrabold text-emerald-700 font-mono">R$ 28,00</span>
              <span className="text-[11px] text-slate-500 block mt-0.5">Debitador automático no repasse</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
