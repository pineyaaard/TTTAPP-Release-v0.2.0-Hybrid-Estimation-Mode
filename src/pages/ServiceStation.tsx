import React, { useState, useEffect } from 'react';
import { Search, Wrench, Loader2, CheckCircle2, AlertCircle, Package, ArrowLeft, Key } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Type } from '@google/genai';
import { generateContentWithRetry } from '../lib/gemini';
import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId || undefined,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const SYSTEM_INSTRUCTION = `You are an expert automotive service estimator and mechanic operating in the Czech Republic.
Your task is to analyze a user's description of a car problem or requested service, and provide an estimate for labor hours and parts required.

CRITICAL: You MUST use the Google Search tool to find the REAL OEM part numbers for the specific vehicle.
Then, use Google Search to find REAL prices in CZK.
- Retail Price (for the client): Find the price on lkq.cz (Auto Kelly) without registration.
- Wholesale Price (for the master): Find the price on automedik.cz.
If exact prices aren't found, estimate based on your catalog knowledge for the specific vehicle brand.

1. **Labor Hours (Nh)**: Estimate the standard labor hours required for the described work. Use standard industry times (e.g., Autodata, Mitchell). The cost per labor hour is 1000 CZK.
   - Example: Timing belt replacement (замена ГРМ) is typically 4.5 - 5.0 Nh (which equals 4500 - 5000 CZK). ALWAYS return labor in Nh, not direct currency.

2. **Parts**: Identify the main parts required for the repair. For each part, provide estimated retail prices in CZK for the following categories:
   - new_original: OEM part from the dealer.
   - good_aftermarket: Premium aftermarket brand (e.g., Brembo, Lemförder, Bosch).
   - average_aftermarket: Standard aftermarket brand (e.g., TRW, Meyle).
   - cheap_aftermarket: Budget aftermarket brand (e.g., Starline, Maxgear).
   - used_original: Used OEM part from a scrapyard (e.g., Allegro, rrr.lt).

For each part category, provide a realistic search link.
CRITICAL FOR LINKS: Do NOT guess internal LKQ product IDs. If you found the exact product page (e.g., https://www.lkq.cz/Product/...), use it.
If you only have the OEM part number, use these reliable search links:
- Autodoc: https://www.autodoc.cz/search?keyword=[PART_NUMBER]
- Automedik: https://automedik.cz/autodily/hledani?search=[PART_NUMBER]
- Google: https://www.google.com/search?q=[PART_NUMBER]+[BRAND]+cz

3. **Wholesale Price**: For each part, calculate the wholesale price (cost to the mechanic). This is typically the price on automedik.cz (without markup) or autokelly.cz with a mechanic's discount (e.g., 20-30% off retail). Retail price is the price charged to the client.

If the user provides a VIN, use it to infer the vehicle make and model if possible.

Return the result strictly as a JSON object matching this schema:
{
  "laborHours": number,
  "laborCost": number, // laborHours * 1000
  "parts": [
    {
      "partName": string,
      "results": [
        { "category": "new_original", "name": string, "retailPrice": number, "wholesalePrice": number, "link": string },
        { "category": "good_aftermarket", "name": string, "retailPrice": number, "wholesalePrice": number, "link": string },
        { "category": "average_aftermarket", "name": string, "retailPrice": number, "wholesalePrice": number, "link": string },
        { "category": "cheap_aftermarket", "name": string, "retailPrice": number, "wholesalePrice": number, "link": string },
        { "category": "used_original", "name": string, "retailPrice": number, "wholesalePrice": number, "link": string }
      ]
    }
  ]
}`;

import { ThemeToggle } from '../components/ThemeToggle';

export function ServiceStation() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [vin, setVin] = useState('');
  const [vinData, setVinData] = useState<any>(null);
  const [isSearchingVin, setIsSearchingVin] = useState(false);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [viewMode, setViewMode] = useState<'client' | 'master'>('client');
  const [selectedParts, setSelectedParts] = useState<Record<number, string>>({});

  useEffect(() => {
    const checkApiKey = async () => {
      const win = window as any;
      if (win.aistudio && typeof win.aistudio.hasSelectedApiKey === 'function') {
        const hasKey = await win.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        const key = process.env.API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
        setHasApiKey(!!key && key !== 'MY_GEMINI_API_KEY');
      }
    };
    checkApiKey();
  }, []);

  const handleSelectApiKey = async () => {
    const win = window as any;
    if (win.aistudio && typeof win.aistudio.openSelectKey === 'function') {
      await win.aistudio.openSelectKey();
      setHasApiKey(true);
    } else {
      alert("API key selection is not available in this environment. Please set the API_KEY environment variable.");
    }
  };

  const searchVin = async () => {
    if (vin.length !== 17) {
      setError(t('vin_length'));
      return;
    }
    setIsSearchingVin(true);
    setError(null);
    try {
      const res = await fetch(`/api/vin/${vin}`);
      if (!res.ok) throw new Error('Ошибка поиска VIN');
      const data = await res.json();
      if (!data.found || data.make === 'Unknown Make') {
        setError('Автомобиль не найден. Пожалуйста, введите данные вручную.');
        setVinData({ vin: vin, make: '', model: '', year: '', found: false });
      } else {
        setVinData(data);
      }
    } catch (err) {
      setError('Ошибка поиска VIN. Пожалуйста, введите данные вручную.');
      setVinData({ vin: vin, make: '', model: '', year: '', found: false });
    } finally {
      setIsSearchingVin(false);
    }
  };

  const submitRequest = async () => {
    if (!description.trim()) {
      setError(t('describe_error'));
      return;
    }
    if (!hasApiKey) {
      setError("Please select an API key first.");
      return;
    }
    
    setIsSubmitting(true);
    setError(null);

    try {
      const apiKey = process.env.API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        throw new Error("API key is missing or invalid. Please select a valid Gemini API key.");
      }

      const vehicleInfoString = vinData ? `${vinData.make} ${vinData.model} (${vinData.year}) VIN: ${vinData.vin}` : (vin ? `VIN: ${vin}` : 'Unknown');

      const promptText = `Vehicle: ${vehicleInfoString}\nDescription of problem/service: ${description}`;

      const response = await generateContentWithRetry(apiKey, {
        model: 'gemini-3.1-pro-preview',
        contents: promptText,
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              laborHours: { type: Type.NUMBER },
              laborCost: { type: Type.NUMBER },
              parts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    partName: { type: Type.STRING },
                    results: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          category: { type: Type.STRING },
                          name: { type: Type.STRING },
                          retailPrice: { type: Type.NUMBER },
                          wholesalePrice: { type: Type.NUMBER },
                          link: { type: Type.STRING }
                        },
                        required: ["category", "name", "retailPrice", "wholesalePrice", "link"]
                      }
                    }
                  },
                  required: ["partName", "results"]
                }
              }
            },
            required: ["laborHours", "laborCost", "parts"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      
      const parsedResult = JSON.parse(text);
      setResult(parsedResult);

      // Save lead to CRM
      try {
        await addDoc(collection(db, 'leads'), {
          track: "service_station",
          source: "web",
          status: "new",
          vehicleInfo: {
            vin: vin || "UNKNOWN",
            make: vinData?.make || "Unknown",
            model: vinData?.model || "Unknown",
            year: vinData?.year || "Unknown",
            manualEntry: !vin
          },
          requestDetails: {
            description: description,
            photoUrls: []
          },
          estimation: parsedResult,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'leads');
      }

    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('API_KEY_INVALID')) {
        setError("API key is invalid. Please select a valid Gemini API key.");
        setHasApiKey(false);
      } else if (err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED')) {
        setError("⚠️ QUOTA EXCEEDED: The AI model is currently overloaded or you have reached your request limit. Please wait a moment and try again.");
      } else {
        setError(err.message || t('server_error'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateLaborCost = () => {
    if (!result) return 0;
    const premiumBrands = ['porsche', 'mercedes', 'bmw', 'audi', 'lexus', 'land rover', 'jaguar', 'bentley', 'maserati', 'ferrari', 'lamborghini', 'rolls-royce', 'aston martin', 'tesla'];
    const isPremium = vinData?.make && premiumBrands.some(brand => vinData.make.toLowerCase().includes(brand));
    const premiumMultiplier = isPremium ? 1.5 : 1;
    return result.laborCost * premiumMultiplier;
  };

  const calculatePartsTotal = () => {
    if (!result?.parts || !result.parts.length) return 0;
    return result.parts.reduce((sum: number, p: any, idx: number) => {
      const selectedCat = selectedParts[idx] || 'average';
      
      if (selectedCat === 'average') {
        const prices = p.results.map((r: any) => viewMode === 'master' ? r.wholesalePrice : r.retailPrice).filter((price: number) => price > 0);
        if (prices.length === 0) return sum;
        const avg = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
        return sum + Math.round(avg);
      } else {
        const part = p.results.find((r: any) => r.category === selectedCat);
        const price = part ? (viewMode === 'master' ? part.wholesalePrice : part.retailPrice) : 0;
        return sum + price;
      }
    }, 0);
  };

  const calculateTotal = () => {
    return calculateLaborCost() + calculatePartsTotal();
  };

  return (
    <div className="min-h-screen p-4 md:p-8 font-sans selection:bg-rose-500/30">
      <div className="max-w-6xl mx-auto space-y-12">
        
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-zinc-800/50">
          <div>
            <button 
              onClick={() => navigate('/')}
              className="group flex items-center gap-2 text-zinc-500 hover:text-rose-500 transition-colors text-[10px] font-mono uppercase tracking-[0.2em] mb-6"
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
              {t('back')}
            </button>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tighter gradient-text">
              {t('app_name')}
            </h1>
            <p className="text-zinc-500 mt-3 font-mono tracking-[0.3em] text-[10px] uppercase">{t('service_station')}</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="flex items-center gap-3 text-[10px] font-mono text-rose-500 uppercase tracking-[0.2em] border border-rose-500/20 bg-rose-500/5 px-4 py-2 rounded">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              {t('system_online')}
            </div>
          </div>
        </header>

        {!hasApiKey && (
          <div className="glass-panel p-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-rose-500/30 bg-rose-500/5">
            <div className="flex items-center gap-3">
              <Key className="text-rose-500" size={20} />
              <div>
                <h3 className="text-sm font-bold text-zinc-100">API Key Required</h3>
                <p className="text-xs text-zinc-400 mt-1">Please select your Gemini API key to use the AI estimation features.</p>
              </div>
            </div>
            <button
              onClick={handleSelectApiKey}
              className="bg-rose-600 hover:bg-rose-500 text-white px-6 py-2 rounded text-xs font-bold uppercase tracking-widest transition-colors whitespace-nowrap"
            >
              Select API Key
            </button>
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_450px] gap-8">
          <div className="space-y-6">
            
            <div className="glass-panel p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-rose-500/20" />
              <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] mb-6 flex items-center gap-3 text-zinc-500">
                <Search size={14} className="text-rose-500" />
                {t('vin_search_parts')}
              </h2>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={vin}
                    onChange={(e) => setVin(e.target.value.toUpperCase())}
                    placeholder={t('vin_placeholder')}
                    className="w-full bg-white/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-lg px-6 py-4 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-rose-500/50 transition-all font-mono uppercase text-sm tracking-wider"
                    maxLength={17}
                  />
                </div>
                <button
                  onClick={searchVin}
                  disabled={isSearchingVin || vin.length !== 17}
                  className="bg-rose-600 text-white hover:bg-rose-500 px-8 py-4 rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs uppercase tracking-[0.2em] accent-glow"
                >
                  {isSearchingVin ? <Loader2 className="animate-spin" size={18} /> : t('find')}
                </button>
              </div>
              {vinData && vinData.found && (
                <div className="mt-6 p-5 bg-white/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-lg flex items-center gap-4 animate-in fade-in zoom-in-95 duration-300">
                  <div className="w-10 h-10 rounded bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                    <CheckCircle2 className="text-rose-500" size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-100 text-sm">{vinData.make} {vinData.model} ({vinData.year})</p>
                    <p className="text-[10px] text-zinc-500 font-mono mt-1 tracking-wider uppercase">{vinData.vin}</p>
                  </div>
                </div>
              )}
              {vinData && !vinData.found && (
                <div className="mt-6 p-5 bg-white/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-lg animate-in fade-in zoom-in-95 duration-300">
                  <div className="flex items-center gap-3 mb-4">
                    <AlertCircle className="text-amber-500" size={18} />
                    <p className="text-sm font-semibold text-amber-500">VIN not found. Please enter vehicle details manually.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Make (e.g., Skoda)"
                      value={vinData?.make !== 'Unknown Make' ? (vinData?.make || '') : ''}
                      onChange={(e) => setVinData({...vinData, make: e.target.value})}
                      className="bg-white/50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-rose-500/50 outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Model (e.g., Octavia)"
                      value={vinData?.model !== 'Unknown Model' ? (vinData?.model || '') : ''}
                      onChange={(e) => setVinData({...vinData, model: e.target.value})}
                      className="bg-white/50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-rose-500/50 outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Year"
                      value={vinData?.year !== 'Unknown Year' ? (vinData?.year || '') : ''}
                      onChange={(e) => setVinData({...vinData, year: e.target.value})}
                      className="bg-white/50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-rose-500/50 outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Engine"
                      value={vinData?.engine !== 'Unknown' ? (vinData?.engine || '') : ''}
                      onChange={(e) => setVinData({...vinData, engine: e.target.value})}
                      className="bg-white/50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-rose-500/50 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="glass-panel p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-rose-500/20" />
              <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] mb-6 flex items-center gap-3 text-zinc-500">
                <Wrench size={14} className="text-rose-500" />
                {t('what_to_do')}
              </h2>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('describe_problem')}
                className="w-full h-48 bg-white/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-lg px-6 py-5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-rose-500/50 transition-all resize-none text-[13px] font-mono leading-relaxed uppercase tracking-tight"
              />
            </div>

            {error && (
              <div className="p-5 bg-rose-950/20 border border-rose-900/30 rounded-lg flex items-start gap-4 text-rose-200 animate-in fade-in slide-in-from-top-2">
                <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-500" />
                <p className="text-[11px] font-mono uppercase tracking-wider leading-relaxed">{error}</p>
              </div>
            )}

            <button
              onClick={submitRequest}
              disabled={isSubmitting || !description.trim() || !hasApiKey}
              className="w-full py-5 rounded-lg font-bold text-xs uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed bg-zinc-100 hover:bg-white text-zinc-950 accent-glow"
            >
              {isSubmitting ? (
                <><Loader2 className="animate-spin" size={18} /> {t('analyzing')}</>
              ) : (
                <><CheckCircle2 size={18} /> {t('analyze')}</>
              )}
            </button>
          </div>

          <div className="space-y-6">
            {result ? (
              <div className="glass-panel p-8 relative overflow-hidden animate-in fade-in slide-in-from-right-8 duration-700">
                <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
                <div className="flex items-center justify-between mb-10">
                  <h2 className="text-[11px] font-mono uppercase tracking-[0.3em] text-zinc-400">{t('preliminary_estimate')}</h2>
                  <div className="flex items-center gap-4">
                    <div className="flex bg-zinc-900/50 border border-zinc-800 rounded-lg p-1">
                      <button
                        onClick={() => setViewMode('client')}
                        className={`px-3 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-all ${
                          viewMode === 'client' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Клиент
                      </button>
                      <button
                        onClick={() => setViewMode('master')}
                        className={`px-3 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-all ${
                          viewMode === 'master' ? 'bg-rose-500/20 text-rose-400' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Мастер
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-10">
                  <div className="p-5 rounded-lg bg-zinc-900/50 border border-zinc-800 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-rose-500/40" />
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-100">{t('labor_hours')}</h3>
                        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-tight mt-1">{result.laborHours} Nh x 1000 Kč</p>
                      </div>
                      <div className="font-mono text-sm font-bold text-rose-500">
                        + {result.laborCost.toLocaleString()} <span className="text-[10px] opacity-50">Kč</span>
                      </div>
                    </div>
                  </div>
                </div>

                {result.parts && result.parts.length > 0 && (
                  <div className="mb-10 space-y-4">
                    <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-3 mb-6">
                      <Package size={14} className="text-rose-500" />
                      {t('parts_options')}
                    </h3>
                    {result.parts.map((partSearch: any, idx: number) => {
                      const getPart = (cat: string) => partSearch.results.find((r: any) => r.category === cat);
                      const options = [
                        { cat: 'new_original', label: t('new_original') },
                        { cat: 'good_aftermarket', label: t('good_aftermarket') },
                        { cat: 'average_aftermarket', label: t('average_aftermarket') },
                        { cat: 'cheap_aftermarket', label: t('cheap_aftermarket') },
                        { cat: 'used_original', label: t('used_original') }
                      ];

                      return (
                        <div key={idx} className="p-5 rounded-lg bg-white/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800">
                          <h4 className="text-[11px] font-bold text-zinc-100 mb-4 uppercase tracking-wider">{partSearch.partName}</h4>
                          <div className="space-y-2.5">
                            {(() => {
                              const isSelected = (selectedParts[idx] || 'average') === 'average';
                              const prices = partSearch.results.map((r: any) => viewMode === 'master' ? r.wholesalePrice : r.retailPrice).filter((price: number) => price > 0);
                              const avg = prices.length > 0 ? Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length) : 0;
                              
                              return (
                                <div 
                                  className={`flex justify-between items-center group p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-rose-500/10 border border-rose-500/20' : 'hover:bg-zinc-800/30 border border-transparent'}`}
                                  onClick={() => setSelectedParts(prev => ({ ...prev, [idx]: 'average' }))}
                                >
                                  <div className="flex flex-col">
                                    <span className={`text-[10px] font-mono uppercase tracking-tighter transition-colors ${isSelected ? 'text-rose-400' : 'text-zinc-500 group-hover:text-zinc-400'}`}>Средняя цена (Arithmetic Mean)</span>
                                  </div>
                                  <div className="flex flex-col items-end">
                                    <span className={`text-[11px] font-mono font-bold ${isSelected ? 'text-rose-400' : 'text-zinc-300'}`}>{avg.toLocaleString()} <span className="text-[9px] opacity-40">Kč</span></span>
                                  </div>
                                </div>
                              );
                            })()}
                            {options.map(opt => {
                              const part = getPart(opt.cat);
                              if (!part) return null;
                              const isSelected = (selectedParts[idx] || 'average') === opt.cat;
                              return (
                                <div 
                                  key={opt.cat} 
                                  className={`flex justify-between items-center group p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-rose-500/10 border border-rose-500/20' : 'hover:bg-zinc-800/30 border border-transparent'}`}
                                  onClick={() => setSelectedParts(prev => ({ ...prev, [idx]: opt.cat }))}
                                >
                                  <div className="flex flex-col">
                                    <span className={`text-[10px] font-mono uppercase tracking-tighter transition-colors ${isSelected ? 'text-rose-400' : 'text-zinc-500 group-hover:text-zinc-400'}`}>{opt.label}</span>
                                    {viewMode === 'master' && part.link && (
                                      <a href={part.link} target="_blank" rel="noreferrer" className="text-[9px] text-rose-500 hover:text-rose-400 mt-0.5 truncate max-w-[150px] sm:max-w-[200px]" onClick={e => e.stopPropagation()}>
                                        {part.name || 'Link'} ↗
                                      </a>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end">
                                    {viewMode === 'master' ? (
                                      <>
                                        <span className={`text-[11px] font-mono font-bold ${isSelected ? 'text-rose-400' : 'text-zinc-300'}`}>{part.wholesalePrice.toLocaleString()} <span className="text-[9px] opacity-40">Kč</span> <span className="text-[8px] opacity-50 font-normal">(Опт)</span></span>
                                        <span className={`text-[9px] font-mono ${isSelected ? 'text-rose-400/70' : 'text-zinc-500'}`}>{part.retailPrice.toLocaleString()} Kč (Розница)</span>
                                      </>
                                    ) : (
                                      <span className={`text-[11px] font-mono font-bold ${isSelected ? 'text-rose-400' : 'text-zinc-300'}`}>{part.retailPrice.toLocaleString()} <span className="text-[9px] opacity-40">Kč</span></span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="pt-8 border-t border-zinc-800/50 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">{t('labor')}</span>
                    <span className="text-lg font-bold font-mono text-zinc-100">{calculateLaborCost().toLocaleString()} <span className="text-xs opacity-40">Kč</span></span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">{t('parts_from')}</span>
                    <span className="text-lg font-bold font-mono text-zinc-400">
                      {calculatePartsTotal().toLocaleString()} <span className="text-xs opacity-40">Kč</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-6 border-t border-zinc-800">
                    <span className="text-xs font-mono uppercase tracking-[0.3em] text-rose-500 font-bold">{t('total_from')}</span>
                    <span className="text-3xl font-bold font-mono text-white accent-text">
                      {calculateTotal().toLocaleString()} <span className="text-sm opacity-40">Kč</span>
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-panel p-12 flex flex-col items-center justify-center text-center h-full min-h-[500px] technical-border">
                <div className="w-16 h-16 rounded-lg border border-zinc-800 flex items-center justify-center mb-6">
                  <Wrench className="text-zinc-700" size={24} strokeWidth={1.5} />
                </div>
                <h3 className="text-[11px] font-mono uppercase tracking-[0.3em] text-zinc-500 mb-3">{t('waiting_data')}</h3>
                <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest max-w-[200px] leading-relaxed">{t('service_prompt')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
