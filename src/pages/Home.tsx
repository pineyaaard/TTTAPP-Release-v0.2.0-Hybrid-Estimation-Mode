import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, PaintBucket, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '../components/ThemeToggle';

export function Home() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="min-h-screen font-sans selection:bg-rose-500/30 transition-colors duration-300 relative">
      <div className="absolute top-0 right-0 w-full p-4 flex justify-end items-center gap-4 z-50">
        <ThemeToggle />
        <div className="flex gap-2">
          {['en', 'ru', 'cs'].map((lng) => (
            <button
              key={lng}
              onClick={() => changeLanguage(lng)}
              className={`text-[10px] uppercase font-mono tracking-[0.2em] px-3 py-1.5 rounded border transition-all ${
                i18n.language === lng 
                  ? 'border-rose-500 bg-rose-500/10 text-rose-500' 
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {lng}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center min-h-screen pt-20 pb-10 p-6">
        <div className="text-center mb-24 relative">
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-[10px] font-mono tracking-[0.5em] text-rose-500/50 uppercase whitespace-nowrap">
            System Initialized
          </div>
          <h1 className="text-5xl sm:text-7xl md:text-9xl font-bold tracking-tighter mb-4 gradient-text">
            {t('app_name')}
          </h1>
          <div className="flex items-center justify-center gap-4">
            <div className="h-px w-12 bg-zinc-300 dark:bg-zinc-800" />
            <p className="text-zinc-500 text-[11px] uppercase tracking-[0.3em] font-mono">
              {t('subtitle')}
            </p>
            <div className="h-px w-12 bg-zinc-300 dark:bg-zinc-800" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 w-full max-w-5xl">
          <button 
            onClick={() => navigate('/body-shop')}
            className="group relative overflow-hidden glass-panel p-10 text-left transition-all hover:border-rose-500/50 hover:bg-rose-500/[0.02]"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <div className="text-[10px] font-mono text-rose-500">01</div>
            </div>
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-lg technical-border flex items-center justify-center mb-8 group-hover:border-rose-500/50 transition-colors">
                <PaintBucket className="text-zinc-400 group-hover:text-rose-500 transition-colors" size={24} strokeWidth={1.5} />
              </div>
              <h2 className="text-2xl font-semibold mb-3 tracking-tight group-hover:text-white transition-colors">{t('body_shop')}</h2>
              <p className="text-zinc-500 mb-12 text-sm leading-relaxed max-w-[280px]">
                {t('body_shop_desc')}
              </p>
              <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.2em] text-rose-500">
                <span className="h-1 w-1 bg-rose-500 rounded-full animate-pulse" />
                {t('start_estimation')}
              </div>
            </div>
          </button>

          <button 
            onClick={() => navigate('/service-station')}
            className="group relative overflow-hidden glass-panel p-10 text-left transition-all hover:border-rose-500/50 hover:bg-rose-500/[0.02]"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <div className="text-[10px] font-mono text-rose-500">02</div>
            </div>
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-lg technical-border flex items-center justify-center mb-8 group-hover:border-rose-500/50 transition-colors">
                <Wrench className="text-zinc-400 group-hover:text-rose-500 transition-colors" size={24} strokeWidth={1.5} />
              </div>
              <h2 className="text-2xl font-semibold mb-3 tracking-tight group-hover:text-white transition-colors">{t('service_station')}</h2>
              <p className="text-zinc-500 mb-12 text-sm leading-relaxed max-w-[280px]">
                {t('service_station_desc')}
              </p>
              <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.2em] text-rose-500">
                <span className="h-1 w-1 bg-rose-500 rounded-full animate-pulse" />
                {t('start_estimation')}
              </div>
            </div>
          </button>
        </div>

        <div className="mt-24">
          <button 
            onClick={() => navigate('/tttapp')}
            className="group flex items-center gap-4 px-6 py-3 rounded-full border border-zinc-800 hover:border-zinc-700 transition-all"
          >
            <ShieldCheck className="text-zinc-500 group-hover:text-rose-500 transition-colors" size={16} strokeWidth={1.5} />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 group-hover:text-zinc-300 transition-colors">
              {t('crm_login')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
