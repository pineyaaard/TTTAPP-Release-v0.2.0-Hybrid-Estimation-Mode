import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { db, auth } from '../firebase';
import { ShieldCheck, Search, Clock, CheckCircle2, XCircle, ExternalLink, Package, ArrowLeft, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ThemeToggle } from '../components/ThemeToggle';

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

export function CRM() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      if (!user) {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
      alert('Failed to login');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setLeads([]);
      return;
    }
    if (!db) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const leadsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLeads(leadsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'leads');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  const updateStatus = async (id: string, newStatus: string) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'leads', id), { status: newStatus, updatedAt: new Date().toISOString() });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `leads/${id}`);
    }
  };

  const filteredLeads = leads.filter(lead => {
    if (filter === 'all') return true;
    return lead.track === filter;
  });

  if (loading) {
    return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-rose-500/50 font-mono text-sm uppercase tracking-widest">Загрузка CRM...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center font-sans p-4">
        <div className="glass-panel p-8 max-w-sm w-full space-y-6">
          <h2 className="text-2xl font-bold text-center gradient-text">Master Login</h2>
          <button onClick={handleLogin} className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 px-4 rounded transition-colors uppercase tracking-widest text-xs flex items-center justify-center gap-2">
            <ShieldCheck size={16} />
            Sign in with Google
          </button>
          <button type="button" onClick={() => navigate('/')} className="w-full text-zinc-500 hover:text-zinc-300 text-xs uppercase tracking-widest mt-4">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 font-sans selection:bg-rose-500/30">
      {/* Top Navigation */}
      <div className="max-w-7xl mx-auto mb-12 flex justify-between items-center">
        <button 
          onClick={() => navigate('/')}
          className="group flex items-center gap-2 text-zinc-500 hover:text-rose-500 transition-colors text-[10px] font-mono uppercase tracking-[0.2em]"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
          {t('back')}
        </button>

        <div className="flex items-center gap-4">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-zinc-500 hover:text-rose-500 transition-colors text-[10px] font-mono uppercase tracking-[0.2em]"
          >
            <LogOut size={14} />
            Logout
          </button>
          <div className="flex gap-2 bg-zinc-900/50 p-1 rounded border border-zinc-800/50">
            {['en', 'ru', 'cs'].map((lng) => (
              <button
                key={lng}
                onClick={() => changeLanguage(lng)}
                className={`text-[9px] font-mono uppercase tracking-widest px-3 py-1 rounded transition-all ${
                  i18n.language === lng 
                    ? 'bg-rose-500 text-white font-bold' 
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {lng}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-zinc-800/50">
          <div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tighter gradient-text mb-2">
              {t('crm_title')}
            </h1>
            <p className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.3em] font-medium">
              {t('crm_subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="flex gap-2 bg-zinc-900/50 p-1 rounded border border-zinc-800/50">
              <button 
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded text-[10px] font-mono uppercase tracking-wider transition-all ${filter === 'all' ? 'bg-rose-600 text-white font-bold accent-glow' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {t('filter_all')}
              </button>
              <button 
                onClick={() => setFilter('body_shop')}
                className={`px-4 py-2 rounded text-[10px] font-mono uppercase tracking-wider transition-all ${filter === 'body_shop' ? 'bg-rose-500/20 text-rose-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {t('filter_body_shop')}
              </button>
              <button 
                onClick={() => setFilter('service_station')}
                className={`px-4 py-2 rounded text-[10px] font-mono uppercase tracking-wider transition-all ${filter === 'service_station' ? 'bg-blue-500/20 text-blue-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {t('filter_service_station')}
              </button>
            </div>
          </div>
        </header>

        <div className="grid gap-6">
          {filteredLeads.map((lead) => (
            <div key={lead.id} className={`glass-panel p-6 relative overflow-hidden group transition-all hover:border-zinc-700`}>
              <div className={`absolute top-0 left-0 w-1 h-full ${lead.track === 'body_shop' ? 'bg-rose-500' : 'bg-blue-500'}`} />
              <div className="flex flex-col lg:flex-row justify-between gap-8">
                
                {/* Left Col: Info */}
                <div className="flex-1 space-y-6">
                  <div className="flex items-center gap-4 border-b border-zinc-800/50 pb-4">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-widest border ${
                      lead.track === 'body_shop' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                      {lead.track === 'body_shop' ? t('filter_body_shop') : t('filter_service_station')}
                    </span>
                    <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-tighter">{new Date(lead.createdAt).toLocaleString()}</span>
                    <span className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest">{t('source')}: {lead.source}</span>
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-zinc-100 flex flex-wrap items-center gap-3 mb-3">
                      <span className="font-mono tracking-tight uppercase">
                        {lead.vehicleInfo?.manualEntry 
                          ? `${lead.vehicleInfo?.make || ''} ${lead.vehicleInfo?.model || ''} ${lead.vehicleInfo?.year || ''}`.trim() || t('vin_not_specified')
                          : (lead.vehicleInfo?.vin !== 'UNKNOWN' ? lead.vehicleInfo?.vin : t('vin_not_specified'))}
                      </span>
                      {lead.vehicleInfo?.manualEntry && <span className="text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded uppercase tracking-widest">{t('manual_entry')}</span>}
                    </h3>
                    <p className="text-zinc-400 text-[13px] font-mono leading-relaxed uppercase tracking-tight">{lead.requestDetails?.description}</p>
                  </div>

                  {lead.requestDetails?.photoUrls?.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {lead.requestDetails.photoUrls.map((url: string, i: number) => (
                        <img key={i} src={url} alt="Damage" className="w-20 h-20 object-cover rounded border border-zinc-800 hover:border-rose-500/50 transition-all cursor-pointer" />
                      ))}
                    </div>
                  )}
                </div>

                {/* Middle Col: Parts (Master View) */}
                <div className="flex-1 bg-zinc-950/50 rounded-lg p-5 border border-zinc-800/50 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 blur-3xl rounded-full" />
                  <h4 className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-2 mb-5">
                    <Package size={12} className="text-rose-500" />
                    {t('parts_wholesale')}
                  </h4>
                  
                  <div className="space-y-4">
                    {lead.track === 'service_station' && lead.estimation?.parts ? (
                      lead.estimation.parts.map((part: any, idx: number) => {
                        // Display the best option (e.g., good_aftermarket or new_original) as the main one
                        const bestOption = part.results.find((r: any) => r.category === 'good_aftermarket') || part.results[0];
                        if (!bestOption) return null;
                        return (
                          <div key={idx} className="p-4 bg-zinc-900/30 rounded border border-zinc-800/50 hover:border-zinc-700 transition-colors">
                            <div className="flex justify-between items-start mb-3">
                              <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">{part.partName} ({bestOption.name})</span>
                              <span className="font-mono text-rose-500 font-bold text-xs">{bestOption.wholesalePrice?.toLocaleString() || (bestOption.retailPrice * 0.75).toLocaleString()} <span className="text-[9px] opacity-50">Kč</span></span>
                            </div>
                            <div className="text-[10px] font-mono text-zinc-500 mb-3 flex justify-between items-center bg-zinc-950/50 p-2 rounded border border-zinc-800/30">
                              <span className="uppercase tracking-tighter">{t('client_price')}: {bestOption.retailPrice?.toLocaleString()} Kč</span>
                              <span className="text-emerald-500 font-bold uppercase tracking-tighter">{t('margin')}: {(bestOption.retailPrice - (bestOption.wholesalePrice || bestOption.retailPrice * 0.75)).toLocaleString()} Kč</span>
                            </div>
                            <div className="flex gap-2">
                              {bestOption.link && (
                                <a href={bestOption.link} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono text-zinc-500 hover:text-white flex items-center gap-1.5 transition-colors bg-zinc-800/50 px-2 py-1 rounded uppercase tracking-widest truncate max-w-[200px]">
                                  {bestOption.link.includes('autokelly') ? 'AutoKelly' : bestOption.link.includes('automedik') ? 'AutoMedik' : 'Link'} <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : lead.track === 'body_shop' && lead.estimation?.repairs ? (
                      lead.estimation.repairs.map((repair: any, idx: number) => (
                        <div key={idx} className="p-4 bg-zinc-900/30 rounded border border-zinc-800/50 hover:border-zinc-700 transition-colors">
                          <div className="flex justify-between items-start mb-3">
                            <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">{repair.name}</span>
                            <span className="font-mono text-rose-500 font-bold text-xs">{repair.cost?.toLocaleString()} <span className="text-[9px] opacity-50">Kč</span></span>
                          </div>
                          <div className="text-[10px] font-mono text-zinc-500 mb-3 flex justify-between items-center bg-zinc-950/50 p-2 rounded border border-zinc-800/30">
                            <span className="uppercase tracking-tighter">{repair.type}</span>
                          </div>
                          <p className="text-[10px] font-mono text-zinc-400 mt-2">{repair.description}</p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-zinc-600 font-mono text-[10px] uppercase tracking-[0.3em]">No estimation data</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Col: Actions */}
                <div className="w-full lg:w-48 flex flex-col gap-2">
                  <div className="text-[9px] font-mono font-bold text-zinc-600 mb-2 uppercase tracking-[0.3em]">Status Control</div>
                  <button 
                    onClick={() => updateStatus(lead.id, 'new')}
                    className={`px-4 py-2.5 rounded text-[10px] font-mono uppercase tracking-wider font-bold transition-all flex items-center gap-3 border ${lead.status === 'new' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 accent-glow' : 'bg-zinc-900/50 text-zinc-600 border-transparent hover:bg-zinc-800 hover:text-zinc-400'}`}
                  >
                    <Clock size={12} /> {t('status_new')}
                  </button>
                  <button 
                    onClick={() => updateStatus(lead.id, 'in_progress')}
                    className={`px-4 py-2.5 rounded text-[10px] font-mono uppercase tracking-wider font-bold transition-all flex items-center gap-3 border ${lead.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 accent-glow' : 'bg-zinc-900/50 text-zinc-600 border-transparent hover:bg-zinc-800 hover:text-zinc-400'}`}
                  >
                    <Search size={12} /> {t('status_in_progress')}
                  </button>
                  <button 
                    onClick={() => updateStatus(lead.id, 'completed')}
                    className={`px-4 py-2.5 rounded text-[10px] font-mono uppercase tracking-wider font-bold transition-all flex items-center gap-3 border ${lead.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 accent-glow' : 'bg-zinc-900/50 text-zinc-600 border-transparent hover:bg-zinc-800 hover:text-zinc-400'}`}
                  >
                    <CheckCircle2 size={12} /> {t('status_completed')}
                  </button>
                  <button 
                    onClick={() => updateStatus(lead.id, 'rejected')}
                    className={`px-4 py-2.5 rounded text-[10px] font-mono uppercase tracking-wider font-bold transition-all flex items-center gap-3 border ${lead.status === 'rejected' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 accent-glow' : 'bg-zinc-900/50 text-zinc-600 border-transparent hover:bg-zinc-800 hover:text-zinc-400'}`}
                  >
                    <XCircle size={12} /> {t('status_rejected')}
                  </button>
                </div>

              </div>
            </div>
          ))}
          
          {filteredLeads.length === 0 && (
            <div className="text-center py-20 border border-dashed border-zinc-800 rounded-lg technical-border">
              <p className="text-zinc-600 font-mono text-[10px] uppercase tracking-[0.3em]">{t('no_leads')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
