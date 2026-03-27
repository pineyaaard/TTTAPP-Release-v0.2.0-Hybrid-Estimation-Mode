import React, { useState, useRef, useCallback } from 'react';
import { 
  Camera, 
  Upload, 
  X, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2, 
  Wrench, 
  Car, 
  DollarSign,
  Loader2,
  Play,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { estimateDamage, EstimationResult, RepairItem, fileToBase64 } from './services/geminiService';

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<EstimationResult | null>(null);
  const [repairOptions, setRepairOptions] = useState<Record<number, 'default' | 'replace_only' | 'replace_and_paint' | 'polishing_only' | 'none'>>({});
  const [globalPolishing, setGlobalPolishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (files.length + newFiles.length > 10) {
        setError('Максимальное количество файлов - 10');
        return;
      }
      setFiles(prev => [...prev, ...newFiles]);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const onEstimate = async () => {
    if (files.length === 0) return;
    
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setGlobalPolishing(false);

    try {
      const fileData = await Promise.all(files.map(async (file) => {
        const base64 = await fileToBase64(file);
        return {
          data: base64.split(',')[1],
          mimeType: file.type
        };
      }));
      const estimation = await estimateDamage(fileData);
      // Ensure repairs is an array
      if (!estimation.repairs) {
        estimation.repairs = [];
      }
      setResult(estimation);
      
      // Initialize options based on repair type
      const initialOptions: Record<number, 'default' | 'replace_only' | 'replace_and_paint' | 'polishing_only' | 'none'> = {};
      estimation.repairs.forEach((repair: RepairItem, idx: number) => { 
        if (repair.type === 'minor_adjacent' || repair.type === 'frame_work' || repair.type === 'internal_element') {
          initialOptions[idx] = 'none';
        } else {
          initialOptions[idx] = 'default';
        }
      });
      setRepairOptions(initialOptions);
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка при анализе');
    } finally {
      setIsProcessing(false);
    }
  };

  const calculateTotal = () => {
    if (!result || !result.repairs) return 0;
    let total = result.repairs.reduce((acc, repair, idx) => {
      const option = repairOptions[idx];
      if (option === 'default') return acc + repair.cost;
      if (option === 'replace_only') return acc + 1000;
      if (option === 'replace_and_paint') return acc + 6000;
      if (option === 'polishing_only') return acc + 500;
      return acc;
    }, 0);
    
    if (globalPolishing) {
      total += 7000; // Average price for full car polishing
    }
    
    return total;
  };

  const isVideo = (file: File) => file.type.startsWith('video/');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight gradient-text">TTTAP</h1>
            <p className="text-xs font-mono text-rose-400/80 tracking-[0.2em] mt-1 uppercase">TWIN TRACK TORPEDO</p>
            <p className="text-zinc-400 mt-3">Профессиональная оценка стоимости ремонта по фото и видео</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 bg-zinc-900/50 px-3 py-1.5 rounded-full border border-zinc-800 shadow-[0_0_10px_rgba(244,63,94,0.1)]">
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
            AI ENGINE ACTIVE
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-rose-500/5 border border-rose-500/20 rounded-2xl shadow-[0_0_15px_rgba(244,63,94,0.05)] gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]">
                <Wrench className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-bold text-rose-400 tracking-wider uppercase drop-shadow-[0_0_5px_rgba(244,63,94,0.5)]">Track 01</span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono uppercase border border-rose-500/20 animate-pulse">Active</span>
                </div>
                <h2 className="text-lg font-bold text-zinc-100">Покраска и кузовной цех</h2>
              </div>
            </div>
            <div className="text-sm text-rose-200/70 max-w-xs border-l-2 border-rose-500/20 pl-4">
              <p>Оценка стоимости кузовных работ и покраски по фото.</p>
              <p className="text-xs opacity-60 mt-1">Механические работы (Track 02) оцениваются отдельно.</p>
            </div>
          </div>

          {/* Upload Section */}
          <section className="glass-panel p-6 space-y-6 border-rose-500/10">
            <div className="flex items-center gap-3 mb-2">
              <Camera className="w-5 h-5 text-rose-400" />
              <h2 className="text-xl font-semibold">Загрузка материалов</h2>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-800 rounded-xl p-12 flex flex-col items-center justify-center gap-4 hover:border-rose-500/50 hover:bg-rose-500/5 transition-all cursor-pointer group"
            >
              <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(244,63,94,0)] group-hover:shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                <Upload className="w-8 h-8 text-zinc-500 group-hover:text-rose-400" />
              </div>
              <div className="text-center">
                <p className="font-medium">Нажмите для загрузки или перетащите файлы</p>
                <p className="text-sm text-zinc-500 mt-1">До 10 фото или видео (MP4, MOV)</p>
              </div>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                multiple 
                accept="image/*,video/*"
                className="hidden" 
              />
            </div>

            {/* File Preview */}
            <AnimatePresence>
              {files.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-2 sm:grid-cols-5 gap-4"
                >
                  {files.map((file, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700 group">
                      {isVideo(file) ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <Play className="w-8 h-8 text-zinc-500" />
                        </div>
                      ) : (
                        <img 
                          src={URL.createObjectURL(file)} 
                          alt="preview" 
                          className="w-full h-full object-cover"
                        />
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <div className="flex items-center gap-2 text-red-400 bg-red-400/10 p-3 rounded-lg border border-red-400/20">
                <AlertCircle className="w-4 h-4" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            <button 
              onClick={onEstimate}
              disabled={files.length === 0 || isProcessing}
              className="w-full py-4 bg-rose-600 hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(244,63,94,0.4)] hover:shadow-[0_0_25px_rgba(244,63,94,0.6)] disabled:shadow-none"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  АНАЛИЗИРУЕМ ПОВРЕЖДЕНИЯ...
                </>
              ) : (
                <>
                  <ChevronRight className="w-5 h-5" />
                  ПОЛУЧИТЬ ОЦЕНКУ
                </>
              )}
            </button>
          </section>

          {/* Results Section */}
          <AnimatePresence>
            {result && (
              <motion.section 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="glass-panel p-6 border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.05)]">
                  <div className="flex flex-col md:flex-row justify-between gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Car className="w-6 h-6 text-rose-400" />
                        <div>
                          <p className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Автомобиль</p>
                          <h3 className="text-2xl font-bold">{result.carModel}</h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-rose-400" />
                        <p className="text-sm text-zinc-400">Уверенность модели: {(result.confidence * 100).toFixed(0)}%</p>
                      </div>
                    </div>
                    <div className="bg-zinc-800/50 p-6 rounded-2xl border border-zinc-700 flex flex-col items-center justify-center min-w-[200px]">
                      <p className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-1">Итоговая стоимость</p>
                      <div className="flex items-center text-4xl font-bold text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]">
                        {calculateTotal().toLocaleString()} Kč
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wrench className="w-5 h-5 text-rose-400" />
                      <h3 className="text-lg font-semibold">Детализация работ</h3>
                    </div>
                    {result.repairs && result.repairs.map((repair, idx) => {
                      const option = repairOptions[idx];
                      const isActive = option !== 'none';
                      const isGrayedOut = repair.type === 'minor_adjacent' || repair.type === 'frame_work' || repair.type === 'internal_element';

                      return (
                        <div key={idx} className={`glass-panel p-4 flex flex-col gap-4 transition-all ${
                          isActive ? 'border-rose-500/30 bg-rose-500/5' : 'opacity-60 grayscale border-zinc-800'
                        }`}>
                          <div className="flex justify-between items-start gap-4 cursor-pointer" onClick={() => {
                            if (isGrayedOut && option === 'none') {
                              setRepairOptions(prev => ({ ...prev, [idx]: 'default' }));
                            } else {
                              setRepairOptions(prev => ({ ...prev, [idx]: option === 'none' ? 'default' : 'none' }));
                            }
                          }}>
                            <div className="flex gap-3">
                              <div className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                isActive ? 'bg-rose-500 border-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'border-zinc-600'
                              }`}>
                                {isActive && <CheckCircle2 className="w-3 h-3 text-white" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-zinc-100">{repair.name}</h4>
                                  {repair.type === 'replacement' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/20">ЗАМЕНА</span>
                                  )}
                                  {repair.type === 'frame_work' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/20">СТАПЕЛЬ</span>
                                  )}
                                  {repair.type === 'minor_adjacent' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-500/20 text-zinc-400 border border-zinc-500/20">СМЕЖНАЯ ДЕТАЛЬ</span>
                                  )}
                                  {repair.type === 'internal_element' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-500/20 text-zinc-400 border border-zinc-500/20">ВНУТРЕННИЙ ЭЛЕМЕНТ</span>
                                  )}
                                </div>
                                <p className="text-sm text-zinc-400 mt-1">{repair.description}</p>
                              </div>
                            </div>
                            <div className={`font-mono font-bold whitespace-nowrap ${
                              isActive ? 'text-rose-400' : 'text-zinc-600'
                            }`}>
                              + {
                                option === 'replace_only' ? '1 000' :
                                option === 'replace_and_paint' ? '6 000' :
                                option === 'polishing_only' ? '500' :
                                repair.cost.toLocaleString()
                              } Kč
                            </div>
                          </div>

                          {/* Additional Options */}
                          {isActive && repair.type !== 'frame_work' && repair.type !== 'internal_element' && (
                            <div className="flex flex-wrap gap-2 pl-8 pt-2 border-t border-zinc-800/50">
                              {[
                                { id: 'replace_and_paint', label: 'Замена/снятие + покраска (6 000 Kč)', cost: 6000, activeClass: 'bg-purple-500 text-white' },
                                ...[
                                  { id: 'default', label: `Стандартный ремонт (${repair.cost.toLocaleString()} Kč)`, cost: repair.cost, activeClass: 'bg-rose-500 text-white' },
                                  { id: 'replace_only', label: 'Замена (1 000 Kč)', cost: 1000, activeClass: 'bg-amber-500 text-white' },
                                  { id: 'polishing_only', label: 'Только полировка (500 Kč)', cost: 500, activeClass: 'bg-blue-500 text-white' }
                                ].sort((a, b) => b.cost - a.cost)
                              ].map(opt => (
                                <button
                                  key={opt.id}
                                  onClick={(e) => { e.stopPropagation(); setRepairOptions(prev => ({ ...prev, [idx]: opt.id as any })); }}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    option === opt.id ? opt.activeClass : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Global Polishing Toggle */}
                    <div 
                      onClick={() => setGlobalPolishing(!globalPolishing)}
                      className={`glass-panel p-4 flex justify-between items-center cursor-pointer transition-all mt-6 ${
                        globalPolishing ? 'border-blue-500/50 bg-blue-500/10' : 'border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                          globalPolishing ? 'bg-blue-500 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'border-zinc-600'
                        }`}>
                          {globalPolishing && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <div>
                          <h4 className="font-bold text-zinc-100">Полная полировка кузова</h4>
                          <p className="text-xs text-zinc-400">Освежить ЛКП всего автомобиля (от 6000 до 8000 крон)</p>
                        </div>
                      </div>
                      <div className={`font-mono font-bold whitespace-nowrap ${
                        globalPolishing ? 'text-blue-400' : 'text-zinc-600'
                      }`}>
                        + 7,000 Kč
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Заключение ИИ</h3>
                    <div className="glass-panel p-4 bg-zinc-900/30">
                      <p className="text-sm leading-relaxed text-zinc-300 italic">
                        "{result.summary}"
                      </p>
                    </div>
                    {result.notes && (
                      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <p className="text-sm text-amber-200">
                          <span className="font-bold mr-2">Примечание:</span>
                          {result.notes}
                        </p>
                      </div>
                    )}
                    <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                      <p className="text-xs text-blue-400 leading-tight">
                        * Данная оценка является предварительной и основана на визуальном анализе ИИ. Рекомендуется очный осмотр специалистом.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
