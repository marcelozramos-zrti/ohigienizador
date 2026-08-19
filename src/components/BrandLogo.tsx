import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  className?: string;
  variant?: 'full' | 'icon-only' | 'horizontal';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showSubtitle = true,
  className = '',
  variant = 'full',
}) => {
  const sizeMap = {
    sm: { icon: 28, title: 'text-sm', sub: 'text-[9px]' },
    md: { icon: 40, title: 'text-lg', sub: 'text-[10px]' },
    lg: { icon: 56, title: 'text-2xl', sub: 'text-xs' },
    xl: { icon: 72, title: 'text-3xl', sub: 'text-sm' },
  };

  const currentSize = sizeMap[size];

  // SVG representation of the iconic blue sofa with sparkling highlights matching the official logo
  const SofaIcon = (
    <svg
      viewBox="0 0 200 140"
      width={currentSize.icon}
      height={(currentSize.icon * 140) / 200}
      className="shrink-0 drop-shadow-sm"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="sofaGradPrimary" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00A3E0" />
          <stop offset="40%" stopColor="#0066CC" />
          <stop offset="100%" stopColor="#003366" />
        </linearGradient>
        <linearGradient id="sofaGradCushion" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="60%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#0369A1" />
        </linearGradient>
        <linearGradient id="sofaHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* Sofa Feet */}
      <rect x="36" y="118" width="12" height="14" rx="3" fill="#002244" />
      <rect x="152" y="118" width="12" height="14" rx="3" fill="#002244" />

      {/* Main Base Shadow / Platform */}
      <rect x="22" y="98" width="156" height="24" rx="10" fill="#00264d" />

      {/* Main Sofa Body / Base */}
      <rect x="20" y="86" width="160" height="34" rx="14" fill="url(#sofaGradPrimary)" />
      {/* Base Top Border Highlight */}
      <path d="M 28 88 Q 100 86 172 88" stroke="url(#sofaHighlight)" strokeWidth="2.5" strokeLinecap="round" />

      {/* Backrest Left & Right Pillows */}
      <rect x="34" y="28" width="62" height="62" rx="14" fill="url(#sofaGradCushion)" stroke="#FFFFFF" strokeWidth="2.5" />
      <path d="M 42 34 Q 65 30 88 34" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.7" strokeLinecap="round" />

      <rect x="104" y="28" width="62" height="62" rx="14" fill="url(#sofaGradCushion)" stroke="#FFFFFF" strokeWidth="2.5" />
      <path d="M 112 34 Q 135 30 158 34" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.7" strokeLinecap="round" />

      {/* Bottom Seat Cushions */}
      <rect x="42" y="68" width="54" height="28" rx="12" fill="#0284C7" stroke="#FFFFFF" strokeWidth="3" />
      <rect x="104" y="68" width="54" height="28" rx="12" fill="#0284C7" stroke="#FFFFFF" strokeWidth="3" />

      {/* Left Armrest */}
      <ellipse cx="28" cy="74" rx="18" ry="24" fill="url(#sofaGradPrimary)" stroke="#FFFFFF" strokeWidth="3" />
      <path d="M 20 62 Q 26 56 34 62" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.8" strokeLinecap="round" />

      {/* Right Armrest */}
      <ellipse cx="172" cy="74" rx="18" ry="24" fill="url(#sofaGradPrimary)" stroke="#FFFFFF" strokeWidth="3" />
      <path d="M 164 62 Q 172 56 180 62" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.8" strokeLinecap="round" />

      {/* Sparkles / Clean Accents */}
      {/* Top Left Sparkle */}
      <path
        d="M 64 16 L 66 22 L 72 24 L 66 26 L 64 32 L 62 26 L 56 24 L 62 22 Z"
        fill="#38BDF8"
      />
      <circle cx="64" cy="24" r="1.5" fill="#FFFFFF" />

      {/* Top Right Sparkle */}
      <path
        d="M 174 20 L 175.5 24.5 L 180 26 L 175.5 27.5 L 174 32 L 172.5 27.5 L 168 26 L 172.5 24.5 Z"
        fill="#38BDF8"
      />
      <circle cx="174" cy="26" r="1.2" fill="#FFFFFF" />

      {/* Small accent dot */}
      <circle cx="48" cy="20" r="1.5" fill="#00A3E0" />
      <circle cx="152" cy="18" r="1.8" fill="#00A3E0" />
    </svg>
  );

  if (variant === 'icon-only') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        {SofaIcon}
      </div>
    );
  }

  if (variant === 'horizontal') {
    return (
      <div className={`inline-flex items-center gap-3 ${className}`}>
        {SofaIcon}
        <div className="flex flex-col">
          <span
            className={`font-black tracking-tight text-[#003366] font-sans leading-none ${currentSize.title}`}
          >
            O Higienizador
          </span>
          {showSubtitle && (
            <span
              className={`text-[#0284C7] font-semibold tracking-normal mt-0.5 whitespace-nowrap leading-none ${currentSize.sub}`}
            >
              Higienização e Impermeabilização de Estofados
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-center text-center ${className}`}>
      {SofaIcon}
      <div className="mt-1 flex flex-col items-center">
        <span
          className={`font-black tracking-tight text-[#003366] font-sans leading-tight ${currentSize.title}`}
        >
          O Higienizador
        </span>
        {showSubtitle && (
          <span
            className={`text-[#0284C7] font-semibold tracking-normal mt-0.5 whitespace-nowrap leading-tight ${currentSize.sub}`}
          >
            Higienização e Impermeabilização de Estofados
          </span>
        )}
      </div>
    </div>
  );
};
