import React, { useState } from 'react';
import {
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Fingerprint,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BrandLogo } from './BrandLogo';
import { User } from '../types';

export const LoginView: React.FC = () => {
  const { login, verifyMfa } = useApp();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [mfaCode, setMfaCode] = useState<string>('');
  const [isMfaStep, setIsMfaStep] = useState<boolean>(false);
  const [mfaUser, setMfaUser] = useState<User | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showApkInfo, setShowApkInfo] = useState<boolean>(false);

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (result.requiresMfa && result.user) {
        setIsMfaStep(true);
        setMfaUser(result.user);
        setMfaCode('');
      } else if (!result.success) {
        setErrorMessage(result.error || 'Credenciais inválidas. Verifique seu e-mail e senha.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha na comunicação com o servidor de autenticação.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const result = await verifyMfa(email, mfaCode);
      if (!result.success) {
        setErrorMessage(result.error || 'Código de 6 dígitos inválido ou expirado.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao validar segundo fator.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-slate-100 flex flex-col justify-between text-slate-800 font-sans relative antialiased">
      {/* Top Header Bar */}
      <header className="w-full max-w-7xl mx-auto px-4 py-4 flex items-center justify-end">
        <div className="flex items-center space-x-2 text-xs">
          <button
            type="button"
            onClick={() => setShowApkInfo(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-[#003366] hover:bg-slate-50 transition-colors text-xs font-semibold cursor-pointer shadow-xs"
          >
            <Smartphone className="w-3.5 h-3.5 text-cyan-600" />
            <span>Instalar no Celular</span>
          </button>
        </div>
      </header>

      {/* Center Auth Card */}
      <main className="w-full max-w-md mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-6">
          
          {/* Official Brand Logo Centered */}
          <div className="flex flex-col items-center justify-center text-center space-y-3 pb-2 border-b border-slate-100">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 shadow-xs">
              <BrandLogo size="lg" variant="icon-only" />
            </div>
            <div>
              <h1 className="text-xl font-black text-[#003366] tracking-tight">
                O Higienizador
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Gestão Integrada Porto Seguro
              </p>
            </div>
          </div>

          {/* Error Message Alert */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start space-x-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span className="font-medium leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: Email & Password */}
          {!isMfaStep ? (
            <form onSubmit={handleSubmitLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  E-mail de Acesso
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@ohigienizador.com.br"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Senha
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-transparent transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-[#003366] hover:bg-[#002244] text-white font-bold text-sm shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <span>Entrar no Sistema</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* STEP 2: MFA 6-DIGIT CODE */
            <form onSubmit={handleVerifyMfaSubmit} className="space-y-4">
              <div className="p-3 rounded-xl bg-cyan-50 border border-cyan-200 text-xs text-cyan-900 space-y-1">
                <div className="font-bold flex items-center space-x-1.5">
                  <Fingerprint className="w-4 h-4 text-cyan-700" />
                  <span>Segundo Fator de Autenticação (MFA)</span>
                </div>
                <p className="text-[11px] text-cyan-800 leading-relaxed">
                  Insira o código de 6 dígitos gerado no seu aplicativo autenticador para confirmar o acesso de <strong>{mfaUser?.name}</strong>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 text-center">
                  Código de 6 Dígitos
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full text-center py-3 bg-slate-50 border border-cyan-600 rounded-xl text-2xl font-mono font-black tracking-[0.3em] text-[#003366] focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-600"
                />
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMfaStep(false);
                    setErrorMessage('');
                  }}
                  className="w-1/3 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={isLoading || mfaCode.length < 6}
                  className="w-2/3 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <>
                      <span>Validar Código</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Footer Security Assurance */}
          <div className="pt-2 border-t border-slate-100 text-center">
            <span className="text-[11px] text-slate-400 inline-flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ambiente Protegido • Conexão Segura SSL/TLS</span>
            </span>
          </div>
        </div>
      </main>

      {/* Modal: PWA & Mobile Installation Guide */}
      {showApkInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 shadow-2xl space-y-4 text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-[#003366] text-white flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#003366]">Instalação no Celular</h3>
                  <p className="text-xs text-slate-500">https://ohigienizador.zrti.tech</p>
                </div>
              </div>
              <button
                onClick={() => setShowApkInfo(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="p-3.5 rounded-xl bg-cyan-50 border border-cyan-200 space-y-2">
                <strong className="text-[#003366] block font-bold text-sm">
                  Instalação Direta no Celular (PWA)
                </strong>
                <p className="text-slate-700">
                  O sistema pode ser instalado como aplicativo nativo diretamente no celular dos técnicos:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-700 pl-1 font-medium">
                  <li>Acesse <strong>https://ohigienizador.zrti.tech</strong> no Chrome ou Safari.</li>
                  <li>Toque no menu de 3 pontos do navegador (ou botão Compartilhar no iOS).</li>
                  <li>Selecione <strong>"Adicionar à tela de início"</strong> ou <strong>"Instalar Aplicativo"</strong>.</li>
                  <li>O ícone do app será criado na tela inicial, executando em tela cheia.</li>
                </ol>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <strong className="text-slate-800 block font-bold text-xs">
                  Geração de APK Standalone (Capacitor)
                </strong>
                <p className="text-slate-600 text-[11px]">
                  Para empacotar o APK nativo via terminal:
                </p>
                <div className="bg-slate-900 text-cyan-300 p-2 rounded font-mono text-[10px] overflow-x-auto">
                  npm install @capacitor/core @capacitor/cli @capacitor/android<br/>
                  npx cap init "O Higienizador" "tech.zrti.ohigienizador"<br/>
                  npx cap add android && npx cap build android
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowApkInfo(false)}
                className="px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Footer */}
      <footer className="w-full max-w-7xl mx-auto px-4 py-4 text-center text-xs text-slate-400 border-t border-slate-200">
        <p>© 2026 O Higienizador • Prestador Parceiro Autorizado Porto Seguro</p>
      </footer>
    </div>
  );
};
