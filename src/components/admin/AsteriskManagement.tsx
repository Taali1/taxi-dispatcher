import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone, CheckCircle, XCircle, AlertCircle, RefreshCw, Play, Square, RotateCcw,
  Save, Terminal, Settings, Users, List, Layers, Shield, Radio,
  FileText, Mic, Wifi, Volume2, Clock, Download, ChevronRight, Info,
  Plus, Trash2, Eye, EyeOff
} from 'lucide-react';

const API = '/api/asterisk';

// ─── helpers ──────────────────────────────────────────────────────────────────
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return r.json();
}

const Badge: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${ok ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
    {ok ? <CheckCircle size={11} /> : <XCircle size={11} />} {label}
  </span>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 mt-5 first:mt-0">{children}</h3>
);

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
    {children}
    {hint && <p className="text-xs text-gray-300 mt-1">{hint}</p>}
  </div>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props} className={`w-full px-3 py-2 border border-[#4a4a4a] rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#2a2a2a] placeholder-gray-600 ${props.className ?? ''}`} />
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select {...props} className={`w-full px-3 py-2 border border-[#4a4a4a] rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#2a2a2a] ${props.className ?? ''}`} />
);

const Btn: React.FC<{ onClick?: () => void; disabled?: boolean; variant?: 'primary' | 'danger' | 'ghost'; children: React.ReactNode; className?: string }> =
  ({ onClick, disabled, variant = 'primary', children, className = '' }) => {
    const base = 'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    const variants = {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white',
      danger: 'bg-red-600 hover:bg-red-700 text-white',
      ghost: 'border border-[#4a4a4a] hover:bg-[#272727] text-gray-300',
    };
    return <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>{children}</button>;
  };

// ─── TABS CONFIG ──────────────────────────────────────────────────────────────
const TABS = [
  { id: 'install',    label: 'Instalacja',      icon: Download },
  { id: 'status',     label: 'Status',           icon: Radio },
  { id: 'general',    label: 'Ogólne',           icon: Settings },
  { id: 'sip',        label: 'SIP / Trunki',     icon: Phone },
  { id: 'extensions', label: 'Wewnętrzne',       icon: Users },
  { id: 'dialplan',   label: 'Plan wybierania',  icon: List },
  { id: 'queues',     label: 'Kolejki',          icon: Layers },
  { id: 'ivr',        label: 'IVR',              icon: Volume2 },
  { id: 'ami',        label: 'AMI (Manager)',    icon: Shield },
  { id: 'cdr',        label: 'CDR / Billing',   icon: FileText },
  { id: 'recording',  label: 'Nagrywanie',       icon: Mic },
  { id: 'network',    label: 'Sieć & NAT',       icon: Wifi },
  { id: 'codecs',     label: 'Kodeki',           icon: Layers },
  { id: 'logs',       label: 'Logi',             icon: Terminal },
];

// ─── INSTALL TAB ─────────────────────────────────────────────────────────────
const INSTALL_STEPS = [
  { id: 'update',  label: 'Aktualizacja pakietów',     cmd: 'apt-get update',                         desc: 'Pobiera aktualną listę dostępnych pakietów' },
  { id: 'install', label: 'Instalacja Asterisk',       cmd: 'apt-get install -y asterisk',            desc: 'Instaluje Asterisk z repozytoriów Ubuntu' },
  { id: 'modules', label: 'Moduły i konfiguracja',    cmd: 'apt-get install -y asterisk-modules',    desc: 'Dodatkowe moduły Asteriska' },
  { id: 'enable',  label: 'Autostart przy rozruchu',   cmd: 'systemctl enable asterisk',              desc: 'Włącza Asterisk jako usługę systemową' },
  { id: 'start',   label: 'Uruchomienie usługi',      cmd: 'systemctl start asterisk',               desc: 'Startuje Asterisk' },
  { id: 'status',  label: 'Weryfikacja statusu',      cmd: 'systemctl status asterisk',              desc: 'Sprawdza czy Asterisk działa poprawnie' },
];

type StepState = 'idle' | 'running' | 'ok' | 'error';

const InstallTab: React.FC = () => {
  const [stepStates, setStepStates] = useState<Record<string, StepState>>({});
  const [stepOutput, setStepOutput] = useState<Record<string, string>>({});

  const runStep = async (stepId: string) => {
    setStepStates(s => ({ ...s, [stepId]: 'running' }));
    try {
      const res = await apiFetch('/install/step', { method: 'POST', body: JSON.stringify({ step: stepId }) });
      setStepOutput(s => ({ ...s, [stepId]: res.stdout || res.stderr || '' }));
      setStepStates(s => ({ ...s, [stepId]: res.success ? 'ok' : 'error' }));
    } catch (e) {
      setStepOutput(s => ({ ...s, [stepId]: String(e) }));
      setStepStates(s => ({ ...s, [stepId]: 'error' }));
    }
  };

  const runAll = async () => {
    for (const step of INSTALL_STEPS) {
      await runStep(step.id);
      const state = stepStates[step.id];
      if (state === 'error') break;
    }
  };

  const stateIcon = (s: StepState) => {
    if (s === 'running') return <RefreshCw size={16} className="animate-spin text-blue-500" />;
    if (s === 'ok') return <CheckCircle size={16} className="text-green-500" />;
    if (s === 'error') return <XCircle size={16} className="text-red-500" />;
    return <div className="w-4 h-4 rounded-full border-2 border-[#4a4a4a]" />;
  };

  return (
    <div className="max-w-3xl">
      <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 mb-6 flex gap-3">
        <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-300">
          <strong>Wymagania:</strong> Ubuntu 20.04+ z dostępem root/sudo. Serwer Node.js musi działać jako root lub mieć sudo bez hasła.
          Instalacja zajmuje ok. 2–5 minut w zależności od prędkości łącza.
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <Btn onClick={runAll}>
          <Play size={16} /> Zainstaluj automatycznie (wszystkie kroki)
        </Btn>
      </div>

      <div className="space-y-3">
        {INSTALL_STEPS.map((step, i) => {
          const state = stepStates[step.id] ?? 'idle';
          const output = stepOutput[step.id];
          return (
            <div key={step.id} className={`border rounded-lg overflow-hidden ${state === 'ok' ? 'border-green-200' : state === 'error' ? 'border-red-200' : 'border-[#3d3d3d]'}`}>
              <div className="flex items-center gap-3 p-4 bg-[#1e1e1e]">
                <span className="text-gray-300 text-sm font-mono w-5">{i + 1}.</span>
                {stateIcon(state)}
                <div className="flex-1">
                  <p className="font-medium text-sm text-white">{step.label}</p>
                  <p className="text-xs text-gray-500">{step.desc}</p>
                  <code className="text-xs text-gray-500 font-mono bg-[#272727] px-1 rounded">{step.cmd}</code>
                </div>
                <Btn onClick={() => runStep(step.id)} disabled={state === 'running'} variant="ghost" className="text-xs px-3 py-1.5">
                  {state === 'running' ? 'Trwa...' : state === 'ok' ? 'Uruchom ponownie' : 'Uruchom'}
                </Btn>
              </div>
              {output && (
                <pre className={`text-xs font-mono p-3 max-h-48 overflow-auto ${state === 'error' ? 'bg-red-900/30 text-red-300' : 'bg-gray-900 text-green-400'}`}>{output}</pre>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 border-t pt-6">
        <SectionTitle>Ręczne polecenia (SSH)</SectionTitle>
        <pre className="bg-gray-900 text-green-400 text-xs font-mono p-4 rounded-lg overflow-auto">
{`# Pełna instalacja Asterisk na Ubuntu:
sudo apt-get update
sudo apt-get install -y asterisk asterisk-modules asterisk-config
sudo systemctl enable asterisk
sudo systemctl start asterisk

# Weryfikacja:
sudo systemctl status asterisk
sudo asterisk -V

# Wejście do konsoli Asterisk:
sudo asterisk -r

# Restart Asterisk:
sudo systemctl restart asterisk

# Przeładowanie konfiguracji (bez restartu):
sudo asterisk -rx "core reload"

# Logi:
sudo tail -f /var/log/asterisk/messages`}
        </pre>
      </div>
    </div>
  );
};

// ─── STATUS TAB ───────────────────────────────────────────────────────────────
const StatusTab: React.FC = () => {
  const [status, setStatus] = useState<any>(null);
  const [channels, setChannels] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cliCmd, setCliCmd] = useState('core show version');
  const [cliOutput, setCliOutput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [s, c] = await Promise.all([apiFetch('/status'), apiFetch('/channels')]);
    setStatus(s); setChannels(c);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const serviceAction = async (action: string) => {
    setActionLoading(action);
    await apiFetch('/service', { method: 'POST', body: JSON.stringify({ action }) });
    setTimeout(load, 2000);
    setActionLoading(null);
  };

  const runCli = async () => {
    const r = await apiFetch('/cli', { method: 'POST', body: JSON.stringify({ command: cliCmd }) });
    setCliOutput(r.output || r.error || '');
  };

  return (
    <div className="max-w-4xl">
      {loading ? <div className="text-gray-500 text-sm">Ładowanie...</div> : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-[#272727] border rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Status instalacji</p>
              <Badge ok={status?.installed} label={status?.installed ? 'Zainstalowany' : 'Nie zainstalowany'} />
            </div>
            <div className="bg-[#272727] border rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Usługa systemd</p>
              <Badge ok={status?.running} label={status?.running ? 'Działa' : 'Zatrzymana'} />
            </div>
            <div className="bg-[#272727] border rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Wersja</p>
              <span className="text-sm font-mono text-gray-100">{status?.version || '—'}</span>
            </div>
          </div>

          <div className="flex gap-2 mb-6">
            {['start','stop','restart','reload'].map(a => (
              <Btn key={a} onClick={() => serviceAction(a)} disabled={actionLoading === a} variant={a === 'stop' ? 'danger' : 'ghost'}>
                {actionLoading === a ? <RefreshCw size={14} className="animate-spin" /> : null}
                {a.charAt(0).toUpperCase() + a.slice(1)}
              </Btn>
            ))}
            <Btn onClick={load} variant="ghost"><RefreshCw size={14} /> Odśwież</Btn>
          </div>

          {channels?.success && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <SectionTitle>Aktywne kanały</SectionTitle>
                <pre className="bg-gray-900 text-green-400 text-xs font-mono p-3 rounded max-h-48 overflow-auto">{channels.channels || '(brak aktywnych kanałów)'}</pre>
              </div>
              <div>
                <SectionTitle>SIP Peers</SectionTitle>
                <pre className="bg-gray-900 text-green-400 text-xs font-mono p-3 rounded max-h-48 overflow-auto">{channels.peers || '(brak zarejestrowanych peerów)'}</pre>
              </div>
            </div>
          )}

          <SectionTitle>Konsola Asterisk (CLI)</SectionTitle>
          <div className="flex gap-2 mb-2">
            <Input value={cliCmd} onChange={e => setCliCmd(e.target.value)} onKeyDown={e => e.key === 'Enter' && runCli()} placeholder="np. core show channels" className="flex-1" />
            <Btn onClick={runCli}><Terminal size={14} /> Wyślij</Btn>
          </div>
          <pre className="bg-gray-900 text-green-400 text-xs font-mono p-3 rounded min-h-[80px] max-h-64 overflow-auto">{cliOutput || '(wpisz komendę i wciśnij Enter)'}</pre>
        </>
      )}
    </div>
  );
};

// ─── GENERAL TAB ─────────────────────────────────────────────────────────────
const GeneralTab: React.FC = () => {
  const [cfg, setCfg] = useState({ runuser: 'asterisk', rungroup: 'asterisk', maxcalls: '100', maxload: '0.9', language: 'pl', defaultzone: 'pl', verbose: '3', debug: '0', autofork: 'no', nofork: 'no', highpriority: 'yes', dumpcore: 'no', astsbindir: '/usr/sbin', astvarlibdir: '/var/lib/asterisk', astagidir: '/var/lib/asterisk/agi-bin', astetcdir: '/etc/asterisk', astspooldir: '/var/spool/asterisk', astlogdir: '/var/log/asterisk' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    const content = `[directories]\nastsbindir => ${cfg.astsbindir}\nastvarlibdir => ${cfg.astvarlibdir}\nastagidir => ${cfg.astagidir}\nastetcdir => ${cfg.astetcdir}\nastspooldir => ${cfg.astspooldir}\nastlogdir => ${cfg.astlogdir}\n\n[options]\nverbose = ${cfg.verbose}\ndebug = ${cfg.debug}\nnofork = ${cfg.nofork}\nautofork = ${cfg.autofork}\nhighpriority = ${cfg.highpriority}\nmaxcalls = ${cfg.maxcalls}\nmaxload = ${cfg.maxload}\nrunuser = ${cfg.runuser}\nrungroup = ${cfg.rungroup}\ndumpcore = ${cfg.dumpcore}\ndefaultlanguage = ${cfg.language}\ndefaultzone = ${cfg.defaultzone}\n`;
    await apiFetch('/config/asterisk', { method: 'POST', body: JSON.stringify({ content }) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const f = (key: keyof typeof cfg) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setCfg(c => ({ ...c, [key]: e.target.value }));

  return (
    <div className="max-w-2xl">
      <SectionTitle>Użytkownik i uprawnienia</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Użytkownik systemowy (runuser)"><Input value={cfg.runuser} onChange={f('runuser')} /></Field>
        <Field label="Grupa systemowa (rungroup)"><Input value={cfg.rungroup} onChange={f('rungroup')} /></Field>
      </div>

      <SectionTitle>Wydajność</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Maks. liczba połączeń (maxcalls)" hint="0 = bez limitu"><Input type="number" value={cfg.maxcalls} onChange={f('maxcalls')} /></Field>
        <Field label="Maks. obciążenie CPU (maxload)" hint="0.9 = 90% CPU"><Input type="number" step="0.1" value={cfg.maxload} onChange={f('maxload')} /></Field>
      </div>

      <SectionTitle>Lokalizacja</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Domyślny język"><Select value={cfg.language} onChange={f('language')}>
          <option value="pl">Polski (pl)</option>
          <option value="en">English (en)</option>
          <option value="de">Deutsch (de)</option>
          <option value="fr">Français (fr)</option>
        </Select></Field>
        <Field label="Strefa czasowa (defaultzone)"><Input value={cfg.defaultzone} onChange={f('defaultzone')} /></Field>
      </div>

      <SectionTitle>Diagnostyka</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Poziom verbose (0–5)" hint="Więcej = więcej logów"><Input type="number" min="0" max="5" value={cfg.verbose} onChange={f('verbose')} /></Field>
        <Field label="Poziom debug (0–5)"><Input type="number" min="0" max="5" value={cfg.debug} onChange={f('debug')} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Priorytety wysokie (highpriority)"><Select value={cfg.highpriority} onChange={f('highpriority')}><option>yes</option><option>no</option></Select></Field>
        <Field label="Dump core przy crash (dumpcore)"><Select value={cfg.dumpcore} onChange={f('dumpcore')}><option>no</option><option>yes</option></Select></Field>
      </div>

      <SectionTitle>Ścieżki systemowe</SectionTitle>
      {(['astsbindir','astvarlibdir','astagidir','astetcdir','astspooldir','astlogdir'] as (keyof typeof cfg)[]).map(k => (
        <Field key={k} label={k}><Input value={cfg[k]} onChange={f(k)} /></Field>
      ))}

      <div className="mt-4">
        <Btn onClick={save} disabled={saving}><Save size={14} /> {saving ? 'Zapisywanie…' : saved ? '✓ Zapisano' : 'Zapisz asterisk.conf'}</Btn>
      </div>
    </div>
  );
};

// ─── SIP TAB ─────────────────────────────────────────────────────────────────
interface SipTrunk { id: number; name: string; host: string; username: string; secret: string; context: string; fromuser: string; fromdomain: string; insecure: string; qualify: string; nat: string; dtmfmode: string; type: string; }

const SipTab: React.FC = () => {
  const [global, setGlobal] = useState({ bindport: '5060', bindaddr: '0.0.0.0', nat: 'force_rport,comedia', qualify: 'yes', qualifyfreq: '60', dtmfmode: 'rfc2833', disallow: 'all', allow: 'ulaw,alaw,g722', videosupport: 'no', rtptimeout: '60', rtpholdtimeout: '300', tcpenable: 'no', tlsenable: 'no', context: 'from-external', maxexpirey: '3600', minexpirey: '60', defaultexpirey: '120', registertimeout: '20', registerattempts: '10' });
  const [trunks, setTrunks] = useState<SipTrunk[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const addTrunk = () => setTrunks(t => [...t, { id: Date.now(), name: `trunk${t.length + 1}`, host: '', username: '', secret: '', context: 'from-trunk', fromuser: '', fromdomain: '', insecure: 'port,invite', qualify: 'yes', nat: 'force_rport,comedia', dtmfmode: 'rfc2833', type: 'peer' }]);
  const delTrunk = (id: number) => setTrunks(t => t.filter(x => x.id !== id));
  const updTrunk = (id: number, key: keyof SipTrunk, val: string) => setTrunks(t => t.map(x => x.id === id ? { ...x, [key]: val } : x));

  const save = async () => {
    setSaving(true);
    let content = `[general]\nbindport=${global.bindport}\nbindaddr=${global.bindaddr}\nnat=${global.nat}\nqualify=${global.qualify}\nqualifyfreq=${global.qualifyfreq}\ndtmfmode=${global.dtmfmode}\ndisallow=${global.disallow}\nallow=${global.allow}\nvideosupport=${global.videosupport}\nrtptimeout=${global.rtptimeout}\nrtpholdtimeout=${global.rtpholdtimeout}\ntcpenable=${global.tcpenable}\ntlsenable=${global.tlsenable}\ncontext=${global.context}\nmaxexpirey=${global.maxexpirey}\nminexpirey=${global.minexpirey}\ndefaultexpirey=${global.defaultexpirey}\nregistertimeout=${global.registertimeout}\nregisterattempts=${global.registerattempts}\n`;
    for (const t of trunks) {
      content += `\n[${t.name}]\ntype=${t.type}\nhost=${t.host}\nusername=${t.username}\nsecret=${t.secret}\ncontext=${t.context}\n${t.fromuser ? `fromuser=${t.fromuser}\n` : ''}${t.fromdomain ? `fromdomain=${t.fromdomain}\n` : ''}insecure=${t.insecure}\nqualify=${t.qualify}\nnat=${t.nat}\ndtmfmode=${t.dtmfmode}\ndisallow=all\nallow=ulaw,alaw\n`;
    }
    await apiFetch('/config/sip', { method: 'POST', body: JSON.stringify({ content }) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const fg = (k: keyof typeof global) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setGlobal(g => ({ ...g, [k]: e.target.value }));

  return (
    <div className="max-w-3xl">
      <SectionTitle>Ustawienia globalne SIP</SectionTitle>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Port nasłuchu (bindport)"><Input value={global.bindport} onChange={fg('bindport')} /></Field>
        <Field label="Adres IP (bindaddr)" hint="0.0.0.0 = wszystkie interfejsy"><Input value={global.bindaddr} onChange={fg('bindaddr')} /></Field>
        <Field label="Domyślny kontekst"><Input value={global.context} onChange={fg('context')} /></Field>
        <Field label="NAT"><Input value={global.nat} onChange={fg('nat')} hint="force_rport,comedia" /></Field>
        <Field label="DTMF Mode"><Select value={global.dtmfmode} onChange={fg('dtmfmode')}><option value="rfc2833">RFC 2833</option><option value="info">SIP INFO</option><option value="inband">Inband</option><option value="auto">Auto</option></Select></Field>
        <Field label="Qualify"><Select value={global.qualify} onChange={fg('qualify')}><option>yes</option><option>no</option></Select></Field>
        <Field label="Qualify freq (s)"><Input type="number" value={global.qualifyfreq} onChange={fg('qualifyfreq')} /></Field>
        <Field label="RTP Timeout (s)"><Input type="number" value={global.rtptimeout} onChange={fg('rtptimeout')} /></Field>
        <Field label="RTP Hold Timeout (s)"><Input type="number" value={global.rtpholdtimeout} onChange={fg('rtpholdtimeout')} /></Field>
        <Field label="TCP Enable"><Select value={global.tcpenable} onChange={fg('tcpenable')}><option>no</option><option>yes</option></Select></Field>
        <Field label="TLS Enable"><Select value={global.tlsenable} onChange={fg('tlsenable')}><option>no</option><option>yes</option></Select></Field>
        <Field label="Video Support"><Select value={global.videosupport} onChange={fg('videosupport')}><option>no</option><option>yes</option></Select></Field>
        <Field label="Max Expiry (s)"><Input type="number" value={global.maxexpirey} onChange={fg('maxexpirey')} /></Field>
        <Field label="Min Expiry (s)"><Input type="number" value={global.minexpirey} onChange={fg('minexpirey')} /></Field>
        <Field label="Default Expiry (s)"><Input type="number" value={global.defaultexpirey} onChange={fg('defaultexpirey')} /></Field>
        <Field label="Disallow kodeki"><Input value={global.disallow} onChange={fg('disallow')} /></Field>
        <Field label="Allow kodeki (priorytetowo)"><Input value={global.allow} onChange={fg('allow')} /></Field>
      </div>

      <SectionTitle>Trunki SIP</SectionTitle>
      {trunks.map(t => (
        <div key={t.id} className="border rounded-lg p-4 mb-3 bg-[#272727]">
          <div className="flex justify-between mb-3">
            <span className="font-medium text-sm">{t.name || 'Nowy trunk'}</span>
            <button onClick={() => delTrunk(t.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {([['name','Nazwa sekcji'],['host','Host / IP'],['username','Username'],['secret','Secret / Hasło'],['context','Kontekst'],['fromuser','From User'],['fromdomain','From Domain'],['type','Typ'],['insecure','Insecure'],['nat','NAT'],['qualify','Qualify'],['dtmfmode','DTMF Mode']] as [keyof SipTrunk, string][]).map(([k, lab]) => (
              <div key={k}>
                <label className="block text-xs font-medium text-gray-300 mb-1">{lab}</label>
                {k === 'type' ? (
                  <Select value={t[k]} onChange={e => updTrunk(t.id, k, e.target.value)} className="text-xs py-1">
                    <option>peer</option><option>friend</option><option>user</option>
                  </Select>
                ) : k === 'dtmfmode' ? (
                  <Select value={t[k]} onChange={e => updTrunk(t.id, k, e.target.value)} className="text-xs py-1">
                    <option>rfc2833</option><option>info</option><option>inband</option><option>auto</option>
                  </Select>
                ) : (
                  <Input value={t[k]} onChange={e => updTrunk(t.id, k, e.target.value)} className="text-xs py-1" type={k === 'secret' ? 'password' : 'text'} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <Btn onClick={addTrunk} variant="ghost"><Plus size={14} /> Dodaj trunk</Btn>

      <div className="mt-4 flex gap-2">
        <Btn onClick={save} disabled={saving}><Save size={14} /> {saving ? 'Zapisywanie…' : saved ? '✓ Zapisano' : 'Zapisz sip.conf'}</Btn>
      </div>
    </div>
  );
};

// ─── EXTENSIONS TAB ──────────────────────────────────────────────────────────
interface Ext { id: number; number: string; name: string; secret: string; context: string; mailbox: string; callerid: string; host: string; nat: string; qualify: string; dtmfmode: string; }

const ExtensionsTab: React.FC = () => {
  const [exts, setExts] = useState<Ext[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  const add = () => setExts(e => [...e, { id: Date.now(), number: `${100 + e.length}`, name: '', secret: '', context: 'internal', mailbox: '', callerid: '', host: 'dynamic', nat: 'force_rport,comedia', qualify: 'yes', dtmfmode: 'rfc2833' }]);
  const del = (id: number) => setExts(e => e.filter(x => x.id !== id));
  const upd = (id: number, k: keyof Ext, v: string) => setExts(e => e.map(x => x.id === id ? { ...x, [k]: v } : x));

  const save = async () => {
    setSaving(true);
    let content = '';
    for (const e of exts) {
      content += `\n[${e.number}]\ntype=friend\nusername=${e.number}\nsecret=${e.secret}\ncallerid="${e.name}" <${e.number}>\nhost=${e.host}\ncontext=${e.context}\n${e.mailbox ? `mailbox=${e.mailbox}\n` : ''}nat=${e.nat}\nqualify=${e.qualify}\ndtmfmode=${e.dtmfmode}\ndisallow=all\nallow=ulaw,alaw\n`;
    }
    await apiFetch('/config/sip', { method: 'POST', body: JSON.stringify({ content }) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between mb-4">
        <Btn onClick={add}><Plus size={14} /> Dodaj numer wewnętrzny</Btn>
        <Btn onClick={() => setShowSecrets(s => !s)} variant="ghost">{showSecrets ? <EyeOff size={14} /> : <Eye size={14} />} {showSecrets ? 'Ukryj' : 'Pokaż'} hasła</Btn>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[#141414] border-b">
              {['Numer','Nazwa / CallerID','Secret','Kontekst','Skrzynka głos.','Host','NAT','Qualify','DTMF',''].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-300 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exts.map(e => (
              <tr key={e.id} className="border-b hover:bg-[#141414]">
                <td className="px-2 py-1.5"><Input value={e.number} onChange={ev => upd(e.id, 'number', ev.target.value)} className="text-xs py-1 w-16" /></td>
                <td className="px-2 py-1.5"><Input value={e.name} onChange={ev => upd(e.id, 'name', ev.target.value)} className="text-xs py-1 w-28" /></td>
                <td className="px-2 py-1.5"><Input type={showSecrets ? 'text' : 'password'} value={e.secret} onChange={ev => upd(e.id, 'secret', ev.target.value)} className="text-xs py-1 w-24" /></td>
                <td className="px-2 py-1.5"><Input value={e.context} onChange={ev => upd(e.id, 'context', ev.target.value)} className="text-xs py-1 w-24" /></td>
                <td className="px-2 py-1.5"><Input value={e.mailbox} onChange={ev => upd(e.id, 'mailbox', ev.target.value)} className="text-xs py-1 w-20" placeholder="100@vm" /></td>
                <td className="px-2 py-1.5"><Input value={e.host} onChange={ev => upd(e.id, 'host', ev.target.value)} className="text-xs py-1 w-20" /></td>
                <td className="px-2 py-1.5"><Select value={e.nat} onChange={ev => upd(e.id, 'nat', ev.target.value)} className="text-xs py-1 w-28"><option value="force_rport,comedia">force_rport</option><option value="no">no</option><option value="yes">yes</option></Select></td>
                <td className="px-2 py-1.5"><Select value={e.qualify} onChange={ev => upd(e.id, 'qualify', ev.target.value)} className="text-xs py-1"><option>yes</option><option>no</option></Select></td>
                <td className="px-2 py-1.5"><Select value={e.dtmfmode} onChange={ev => upd(e.id, 'dtmfmode', ev.target.value)} className="text-xs py-1 w-24"><option value="rfc2833">RFC2833</option><option value="info">INFO</option><option value="inband">Inband</option></Select></td>
                <td className="px-2 py-1.5"><button onClick={() => del(e.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {exts.length === 0 && <p className="text-center text-gray-300 text-sm py-8">Brak numerów wewnętrznych. Kliknij "Dodaj".</p>}
      </div>
      <div className="mt-4">
        <Btn onClick={save} disabled={saving}><Save size={14} /> {saving ? 'Zapisywanie…' : saved ? '✓ Zapisano' : 'Zapisz sip.conf'}</Btn>
      </div>
    </div>
  );
};

// ─── DIALPLAN TAB ─────────────────────────────────────────────────────────────
const DIALPLAN_TEMPLATES: Record<string, string> = {
  podstawowy: `[from-external]
exten => s,1,Answer()
exten => s,n,Playback(welcome)
exten => s,n,Hangup()

[internal]
; Połączenia wewnętrzne
exten => _1XX,1,NoOp(Wewnętrzne: \${EXTEN})
exten => _1XX,n,Dial(SIP/\${EXTEN},30)
exten => _1XX,n,VoiceMail(\${EXTEN}@default,u)
exten => _1XX,n,Hangup()

; Poczta głosowa
exten => *98,1,VoiceMailMain(\${CALLERID(num)}@default)
exten => *98,n,Hangup()`,

  trunk_wychodzacy: `[from-internal-out]
; Połączenia wychodzące przez trunk
exten => _0.,1,NoOp(Wychodzące: \${EXTEN})
exten => _0.,n,Dial(SIP/trunk1/\${EXTEN:1},60)
exten => _0.,n,Congestion()
exten => _0.,n,Hangup()

; Numer alarmowy
exten => 112,1,Dial(SIP/trunk1/112,60)
exten => 112,n,Hangup()`,

  ivr: `[ivr-main]
exten => s,1,Answer()
exten => s,n,Set(TIMEOUT(digit)=5)
exten => s,n,Set(TIMEOUT(response)=10)
exten => s,n,Background(ivr-welcome)
exten => s,n,WaitExten(5)

exten => 1,1,Goto(internal,100,1)
exten => 2,1,Goto(internal,200,1)
exten => 0,1,Goto(internal,100,1)
exten => i,1,Playback(invalid)
exten => i,n,Goto(s,1)
exten => t,1,Hangup()`,
};

const DialPlanTab: React.FC = () => {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/config/extensions').then(r => { setContent(r.content || DIALPLAN_TEMPLATES.podstawowy); setLoading(false); });
  }, []);

  const save = async () => {
    setSaving(true);
    await apiFetch('/config/extensions', { method: 'POST', body: JSON.stringify({ content }) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex gap-2 mb-3 flex-wrap">
        {Object.entries(DIALPLAN_TEMPLATES).map(([k, v]) => (
          <Btn key={k} variant="ghost" onClick={() => setContent(v)} className="text-xs px-3 py-1.5">
            <ChevronRight size={12} /> Szablon: {k}
          </Btn>
        ))}
      </div>
      {loading ? <div className="text-gray-300 text-sm">Ładowanie…</div> : (
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="w-full h-[500px] font-mono text-sm border border-[#4a4a4a] rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-green-400 resize-y"
          spellCheck={false}
        />
      )}
      <div className="mt-3 flex gap-2">
        <Btn onClick={save} disabled={saving}><Save size={14} /> {saving ? 'Zapisywanie…' : saved ? '✓ Zapisano' : 'Zapisz extensions.conf'}</Btn>
      </div>
      <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-800">
        <strong>Uwaga:</strong> Po zapisaniu wykonaj reload: <code>asterisk -rx "dialplan reload"</code> lub użyj przycisku Reload na zakładce Status.
      </div>
    </div>
  );
};

// ─── QUEUES TAB ───────────────────────────────────────────────────────────────
interface Queue { id: number; name: string; strategy: string; timeout: string; retry: string; maxlen: string; wrapuptime: string; musiconhold: string; announce: string; context: string; members: string; joinempty: string; leavewhenempty: string; ringinuse: string; }

const QueuesTab: React.FC = () => {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const add = () => setQueues(q => [...q, { id: Date.now(), name: `kolejka${q.length + 1}`, strategy: 'ringall', timeout: '30', retry: '5', maxlen: '0', wrapuptime: '0', musiconhold: 'default', announce: '', context: '', members: '', joinempty: 'yes', leavewhenempty: 'no', ringinuse: 'no' }]);
  const del = (id: number) => setQueues(q => q.filter(x => x.id !== id));
  const upd = (id: number, k: keyof Queue, v: string) => setQueues(q => q.map(x => x.id === id ? { ...x, [k]: v } : x));

  const save = async () => {
    setSaving(true);
    let content = '';
    for (const q of queues) {
      content += `\n[${q.name}]\nstrategy=${q.strategy}\ntimeout=${q.timeout}\nretry=${q.retry}\nmaxlen=${q.maxlen}\nwrapuptime=${q.wrapuptime}\nmusiconhold=${q.musiconhold}\njoinempty=${q.joinempty}\nleavewhenempty=${q.leavewhenempty}\nringinuse=${q.ringinuse}\n${q.announce ? `announce=${q.announce}\n` : ''}${q.context ? `context=${q.context}\n` : ''}`;
      for (const m of q.members.split(',').map(m => m.trim()).filter(Boolean)) {
        content += `member => SIP/${m}\n`;
      }
    }
    await apiFetch('/config/queues', { method: 'POST', body: JSON.stringify({ content }) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-3xl">
      <Btn onClick={add} className="mb-4"><Plus size={14} /> Dodaj kolejkę</Btn>
      {queues.map(q => (
        <div key={q.id} className="border rounded-lg p-4 mb-4 bg-[#1e1e1e]">
          <div className="flex justify-between mb-3">
            <span className="font-medium text-sm">{q.name}</span>
            <button onClick={() => del(q.id)} className="text-red-400 hover:text-red-600"><Trash2 size={15} /></button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Nazwa kolejki"><Input value={q.name} onChange={e => upd(q.id, 'name', e.target.value)} className="text-sm" /></Field>
            <Field label="Strategia">
              <Select value={q.strategy} onChange={e => upd(q.id, 'strategy', e.target.value)} className="text-sm">
                <option value="ringall">ringall – dzwoń do wszystkich</option>
                <option value="leastrecent">leastrecent – ostatnio nieużywany</option>
                <option value="fewestcalls">fewestcalls – najmniej połączeń</option>
                <option value="random">random – losowy</option>
                <option value="rrmemory">rrmemory – round-robin</option>
                <option value="linear">linear – liniowy</option>
                <option value="wrandom">wrandom – ważony losowy</option>
              </Select>
            </Field>
            <Field label="Timeout (s)"><Input type="number" value={q.timeout} onChange={e => upd(q.id, 'timeout', e.target.value)} className="text-sm" /></Field>
            <Field label="Retry (s)" hint="Czas przed kolejną próbą"><Input type="number" value={q.retry} onChange={e => upd(q.id, 'retry', e.target.value)} className="text-sm" /></Field>
            <Field label="Max w kolejce (0=∞)"><Input type="number" value={q.maxlen} onChange={e => upd(q.id, 'maxlen', e.target.value)} className="text-sm" /></Field>
            <Field label="Wrap-up time (s)"><Input type="number" value={q.wrapuptime} onChange={e => upd(q.id, 'wrapuptime', e.target.value)} className="text-sm" /></Field>
            <Field label="Music on hold"><Input value={q.musiconhold} onChange={e => upd(q.id, 'musiconhold', e.target.value)} className="text-sm" /></Field>
            <Field label="Join empty"><Select value={q.joinempty} onChange={e => upd(q.id, 'joinempty', e.target.value)} className="text-sm"><option>yes</option><option>no</option></Select></Field>
            <Field label="Leave when empty"><Select value={q.leavewhenempty} onChange={e => upd(q.id, 'leavewhenempty', e.target.value)} className="text-sm"><option>no</option><option>yes</option></Select></Field>
            <Field label="Ring in use"><Select value={q.ringinuse} onChange={e => upd(q.id, 'ringinuse', e.target.value)} className="text-sm"><option>no</option><option>yes</option></Select></Field>
          </div>
          <Field label="Członkowie kolejki (numery SIP, przecinkami)" hint="np. 100,101,102">
            <Input value={q.members} onChange={e => upd(q.id, 'members', e.target.value)} className="text-sm" placeholder="100,101,102" />
          </Field>
        </div>
      ))}
      {queues.length === 0 && <p className="text-gray-300 text-sm py-4">Brak kolejek.</p>}
      <Btn onClick={save} disabled={saving}><Save size={14} /> {saving ? 'Zapisywanie…' : saved ? '✓ Zapisano' : 'Zapisz queues.conf'}</Btn>
    </div>
  );
};

// ─── IVR TAB ─────────────────────────────────────────────────────────────────
const IvrTab: React.FC = () => {
  const [steps, setSteps] = useState([{ id: 1, key: '1', action: 'goto', target: '100', label: 'Dział sprzedaży' }]);
  const [greeting, setGreeting] = useState('ivr-welcome');
  const [context, setContext] = useState('ivr-main');
  const [timeout, setTimeout_] = useState('5');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const add = () => setSteps(s => [...s, { id: Date.now(), key: String(s.length + 1), action: 'goto', target: '', label: '' }]);
  const del = (id: number) => setSteps(s => s.filter(x => x.id !== id));
  const upd = (id: number, k: string, v: string) => setSteps(s => s.map(x => x.id === id ? { ...x, [k]: v } : x));

  const save = async () => {
    setSaving(true);
    let content = `[${context}]\nexten => s,1,Answer()\nexten => s,n,Set(TIMEOUT(digit)=${timeout})\nexten => s,n,Background(${greeting})\nexten => s,n,WaitExten(${timeout})\n`;
    for (const s of steps) {
      const action = s.action === 'goto' ? `Goto(internal,${s.target},1)` : s.action === 'queue' ? `Queue(${s.target})` : s.action === 'playback' ? `Playback(${s.target})` : `Hangup()`;
      content += `\nexten => ${s.key},1,NoOp(IVR: ${s.label})\nexten => ${s.key},n,${action}\nexten => ${s.key},n,Hangup()\n`;
    }
    content += `\nexten => i,1,Playback(invalid)\nexten => i,n,Goto(s,1)\nexten => t,1,Hangup()\n`;
    await apiFetch('/config/extensions', { method: 'POST', body: JSON.stringify({ content }) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl">
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Field label="Kontekst IVR"><Input value={context} onChange={e => setContext(e.target.value)} /></Field>
        <Field label="Plik powitania" hint="np. ivr-welcome (bez .gsm)"><Input value={greeting} onChange={e => setGreeting(e.target.value)} /></Field>
        <Field label="Timeout (s)"><Input type="number" value={timeout} onChange={e => setTimeout_(e.target.value)} /></Field>
      </div>
      <SectionTitle>Opcje menu</SectionTitle>
      {steps.map((s, i) => (
        <div key={s.id} className="flex gap-2 mb-2 items-end">
          <div className="w-12"><label className="text-xs text-gray-500">Klawisz</label><Input value={s.key} onChange={e => upd(s.id, 'key', e.target.value)} className="text-sm" /></div>
          <div className="w-32"><label className="text-xs text-gray-500">Akcja</label>
            <Select value={s.action} onChange={e => upd(s.id, 'action', e.target.value)} className="text-sm">
              <option value="goto">Przejdź do numeru</option>
              <option value="queue">Kolejka</option>
              <option value="playback">Odtwórz plik</option>
              <option value="hangup">Rozłącz</option>
            </Select>
          </div>
          <div className="flex-1"><label className="text-xs text-gray-500">Cel (numer/kolejka/plik)</label><Input value={s.target} onChange={e => upd(s.id, 'target', e.target.value)} className="text-sm" /></div>
          <div className="flex-1"><label className="text-xs text-gray-500">Opis</label><Input value={s.label} onChange={e => upd(s.id, 'label', e.target.value)} className="text-sm" placeholder="np. Dział sprzedaży" /></div>
          <button onClick={() => del(s.id)} className="text-red-400 hover:text-red-600 pb-2"><Trash2 size={14} /></button>
        </div>
      ))}
      <Btn onClick={add} variant="ghost" className="mt-1 mb-4"><Plus size={14} /> Dodaj opcję</Btn>
      <div className="mt-2"><Btn onClick={save} disabled={saving}><Save size={14} /> {saving ? 'Zapisywanie…' : saved ? '✓ Zapisano' : 'Zapisz konfigurację IVR'}</Btn></div>
    </div>
  );
};

// ─── AMI TAB ─────────────────────────────────────────────────────────────────
interface AmiUser { id: number; username: string; secret: string; deny: string; permit: string; perms: string[]; }
const AMI_PERMS = ['system','call','log','verbose','command','agent','user','config','all','originate'];

const AmiTab: React.FC = () => {
  const [global, setGlobal] = useState({ enabled: 'yes', port: '5038', bindaddr: '127.0.0.1', displayconnects: 'yes' });
  const [users, setUsers] = useState<AmiUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const add = () => setUsers(u => [...u, { id: Date.now(), username: 'admin', secret: '', deny: '0.0.0.0/0.0.0.0', permit: '127.0.0.1/255.255.255.0', perms: ['all'] }]);
  const del = (id: number) => setUsers(u => u.filter(x => x.id !== id));
  const upd = (id: number, k: keyof AmiUser, v: string | string[]) => setUsers(u => u.map(x => x.id === id ? { ...x, [k]: v } : x));
  const togglePerm = (id: number, perm: string) => setUsers(u => u.map(x => x.id === id ? { ...x, perms: x.perms.includes(perm) ? x.perms.filter(p => p !== perm) : [...x.perms, perm] } : x));

  const fg = (k: keyof typeof global) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setGlobal(g => ({ ...g, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    let content = `[general]\nenabled = ${global.enabled}\nport = ${global.port}\nbindaddr = ${global.bindaddr}\ndisplayconnects = ${global.displayconnects}\n`;
    for (const u of users) {
      content += `\n[${u.username}]\nsecret = ${u.secret}\ndeny = ${u.deny}\npermit = ${u.permit}\n${u.perms.map(p => `permit = ${p}`).join('\n')}\nread = ${u.perms.join(',')}\nwrite = ${u.perms.join(',')}\n`;
    }
    await apiFetch('/config/manager', { method: 'POST', body: JSON.stringify({ content }) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl">
      <SectionTitle>Ustawienia globalne AMI</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Enabled"><Select value={global.enabled} onChange={fg('enabled')}><option>yes</option><option>no</option></Select></Field>
        <Field label="Port"><Input type="number" value={global.port} onChange={fg('port')} /></Field>
        <Field label="Bind Address"><Input value={global.bindaddr} onChange={fg('bindaddr')} /></Field>
        <Field label="Display Connects"><Select value={global.displayconnects} onChange={fg('displayconnects')}><option>yes</option><option>no</option></Select></Field>
      </div>
      <SectionTitle>Konta AMI</SectionTitle>
      {users.map(u => (
        <div key={u.id} className="border rounded-lg p-4 mb-3 bg-[#272727]">
          <div className="flex justify-between mb-3">
            <span className="font-medium text-sm">{u.username}</span>
            <button onClick={() => del(u.id)} className="text-red-400"><Trash2 size={14} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Username"><Input value={u.username} onChange={e => upd(u.id, 'username', e.target.value)} /></Field>
            <Field label="Secret"><Input type="password" value={u.secret} onChange={e => upd(u.id, 'secret', e.target.value)} /></Field>
            <Field label="Deny (CIDR)"><Input value={u.deny} onChange={e => upd(u.id, 'deny', e.target.value)} /></Field>
            <Field label="Permit (CIDR)"><Input value={u.permit} onChange={e => upd(u.id, 'permit', e.target.value)} /></Field>
          </div>
          <label className="text-xs font-medium text-gray-300 block mb-2">Uprawnienia:</label>
          <div className="flex flex-wrap gap-2">
            {AMI_PERMS.map(p => (
              <button key={p} onClick={() => togglePerm(u.id, p)} className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${u.perms.includes(p) ? 'bg-blue-600 text-white border-blue-600' : 'bg-[#1e1e1e] text-gray-300 border-[#4a4a4a] hover:bg-[#141414]'}`}>{p}</button>
            ))}
          </div>
        </div>
      ))}
      <Btn onClick={add} variant="ghost" className="mb-4"><Plus size={14} /> Dodaj konto AMI</Btn>
      <div><Btn onClick={save} disabled={saving}><Save size={14} /> {saving ? 'Zapisywanie…' : saved ? '✓ Zapisano' : 'Zapisz manager.conf'}</Btn></div>
    </div>
  );
};

// ─── CDR TAB ─────────────────────────────────────────────────────────────────
const CdrTab: React.FC = () => {
  const [cfg, setCfg] = useState({ enable: 'yes', unanswered: 'yes', congestion: 'no', endbeforehexten: 'yes', initiatedseconds: 'no', batch: 'no', size: '100', time: '300', scheduleronly: 'no', safeshutdown: 'yes' });
  const [mysql, setMysql] = useState({ hostname: 'localhost', dbname: 'asterisk', table: 'cdr', password: '', user: 'asterisk', port: '3306', sock: '', userfield: '0' });
  const [cdrRows, setCdrRows] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingCdr, setLoadingCdr] = useState(false);

  const loadCdr = async () => { setLoadingCdr(true); const r = await apiFetch('/cdr'); if (r.success && Array.isArray(r.cdr)) setCdrRows(r.cdr); setLoadingCdr(false); };
  useEffect(() => { loadCdr(); }, []);

  const fc = (k: keyof typeof cfg) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setCfg(c => ({ ...c, [k]: e.target.value }));
  const fm = (k: keyof typeof mysql) => (e: React.ChangeEvent<HTMLInputElement>) => setMysql(c => ({ ...c, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    const cdrContent = `[general]\nenable=${cfg.enable}\nunanswered=${cfg.unanswered}\ncongestion=${cfg.congestion}\nendbeforehexten=${cfg.endbeforehexten}\nbatch=${cfg.batch}\nsize=${cfg.size}\ntime=${cfg.time}\n`;
    const mysqlContent = `[global]\nhostname=${mysql.hostname}\ndbname=${mysql.dbname}\ntable=${mysql.table}\npassword=${mysql.password}\nuser=${mysql.user}\nport=${mysql.port}\n${mysql.sock ? `sock=${mysql.sock}\n` : ''}userfield=${mysql.userfield}\n`;
    await Promise.all([
      apiFetch('/config/cdr', { method: 'POST', body: JSON.stringify({ content: cdrContent }) }),
      apiFetch('/config/cdr_mysql', { method: 'POST', body: JSON.stringify({ content: mysqlContent }) }),
    ]);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-3xl">
      <SectionTitle>Ustawienia CDR (cdr.conf)</SectionTitle>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Enabled"><Select value={cfg.enable} onChange={fc('enable')}><option>yes</option><option>no</option></Select></Field>
        <Field label="Rejestruj nieodebrane"><Select value={cfg.unanswered} onChange={fc('unanswered')}><option>yes</option><option>no</option></Select></Field>
        <Field label="Rejestruj zajęte"><Select value={cfg.congestion} onChange={fc('congestion')}><option>no</option><option>yes</option></Select></Field>
        <Field label="Batch mode"><Select value={cfg.batch} onChange={fc('batch')}><option>no</option><option>yes</option></Select></Field>
        <Field label="Batch size (rekordów)"><Input type="number" value={cfg.size} onChange={fc('size')} /></Field>
        <Field label="Batch time (s)"><Input type="number" value={cfg.time} onChange={fc('time')} /></Field>
      </div>
      <SectionTitle>MySQL CDR (cdr_mysql.conf)</SectionTitle>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Hostname"><Input value={mysql.hostname} onChange={fm('hostname')} /></Field>
        <Field label="Port"><Input type="number" value={mysql.port} onChange={fm('port')} /></Field>
        <Field label="Baza danych"><Input value={mysql.dbname} onChange={fm('dbname')} /></Field>
        <Field label="Tabela"><Input value={mysql.table} onChange={fm('table')} /></Field>
        <Field label="Użytkownik"><Input value={mysql.user} onChange={fm('user')} /></Field>
        <Field label="Hasło"><Input type="password" value={mysql.password} onChange={fm('password')} /></Field>
        <Field label="Socket (opcjonalnie)"><Input value={mysql.sock} onChange={fm('sock')} /></Field>
        <Field label="Userfield"><Select value={mysql.userfield} onChange={e => setMysql(m => ({ ...m, userfield: e.target.value }))}><option value="0">Nie</option><option value="1">Tak</option></Select></Field>
      </div>
      <Btn onClick={save} disabled={saving} className="mb-6"><Save size={14} /> {saving ? 'Zapisywanie…' : saved ? '✓ Zapisano' : 'Zapisz CDR conf'}</Btn>

      <SectionTitle>Historia połączeń <button onClick={loadCdr} className="ml-2 text-blue-500 hover:text-blue-700"><RefreshCw size={12} /></button></SectionTitle>
      {loadingCdr ? <div className="text-gray-300 text-sm">Ładowanie…</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead><tr className="bg-[#141414] border-b">{['Data','Numer z','Numer do','Czas (s)','Billsec','Status'].map(h => <th key={h} className="px-2 py-1.5 text-left text-gray-300">{h}</th>)}</tr></thead>
            <tbody>
              {cdrRows.slice(0, 50).map((r, i) => (
                <tr key={i} className="border-b hover:bg-[#141414]">
                  <td className="px-2 py-1 font-mono">{r.calldate || r.starttime || '—'}</td>
                  <td className="px-2 py-1">{r.src || r.clid || '—'}</td>
                  <td className="px-2 py-1">{r.dst || '—'}</td>
                  <td className="px-2 py-1">{r.duration ?? '—'}</td>
                  <td className="px-2 py-1">{r.billsec ?? '—'}</td>
                  <td className="px-2 py-1">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${r.disposition === 'ANSWERED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{r.disposition || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cdrRows.length === 0 && <p className="text-center text-gray-300 py-6">Brak rekordów CDR</p>}
        </div>
      )}
    </div>
  );
};

// ─── RECORDING TAB ────────────────────────────────────────────────────────────
const RecordingTab: React.FC = () => {
  const [cfg, setCfg] = useState({ dir: '/var/spool/asterisk/monitor', format: 'wav', prefix: 'recording', inbound: 'no', outbound: 'no', mixmonitor: 'yes', beep: 'no', silenceThreshold: '128', maxSilence: '0' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const f = (k: keyof typeof cfg) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setCfg(c => ({ ...c, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    const content = `; Ustawienia nagrywania rozmów\n; Katalog nagrań: ${cfg.dir}\n; Format: ${cfg.format}\n; MixMonitor: ${cfg.mixmonitor}\n; Nagrywanie przychodzących: ${cfg.inbound}\n; Nagrywanie wychodzących: ${cfg.outbound}\n; Prefix pliku: ${cfg.prefix}\n; Próg ciszy: ${cfg.silenceThreshold}\n; Max cisza (s): ${cfg.maxSilence}\n`;
    await apiFetch('/config/asterisk', { method: 'POST', body: JSON.stringify({ content }) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl">
      <div className="bg-blue-900/20 border border-blue-800 rounded p-3 mb-4 text-sm text-blue-300">
        Nagrywanie realizowane przez <strong>MixMonitor()</strong> w planie wybierania. Poniższe ustawienia generują konfigurację pomocniczą.
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Katalog nagrań" hint="/var/spool/asterisk/monitor"><Input value={cfg.dir} onChange={f('dir')} /></Field>
        <Field label="Format pliku"><Select value={cfg.format} onChange={f('format')}><option value="wav">WAV (bez kompresji)</option><option value="wav49">WAV49 (GSM)</option><option value="gsm">GSM</option><option value="mp3">MP3</option><option value="ogg">OGG</option></Select></Field>
        <Field label="Prefix nazwy pliku"><Input value={cfg.prefix} onChange={f('prefix')} /></Field>
        <Field label="Auto-nagrywanie przychodzących"><Select value={cfg.inbound} onChange={f('inbound')}><option>no</option><option>yes</option></Select></Field>
        <Field label="Auto-nagrywanie wychodzących"><Select value={cfg.outbound} onChange={f('outbound')}><option>no</option><option>yes</option></Select></Field>
        <Field label="Użyj MixMonitor"><Select value={cfg.mixmonitor} onChange={f('mixmonitor')}><option>yes</option><option>no</option></Select></Field>
        <Field label="Sygnał dźwiękowy (beep)"><Select value={cfg.beep} onChange={f('beep')}><option>no</option><option>yes</option></Select></Field>
        <Field label="Próg ciszy (0-32767)"><Input type="number" value={cfg.silenceThreshold} onChange={f('silenceThreshold')} /></Field>
        <Field label="Max cisza (s, 0=wyłączone)"><Input type="number" value={cfg.maxSilence} onChange={f('maxSilence')} /></Field>
      </div>
      <SectionTitle>Przykład użycia w extensions.conf</SectionTitle>
      <pre className="bg-gray-900 text-green-400 text-xs font-mono p-3 rounded">{`; Nagrywanie rozmowy:\nexten => _1XX,n,MixMonitor(${cfg.dir}/${cfg.prefix}-\${UNIQUEID}.${cfg.format})`}</pre>
      <div className="mt-4"><Btn onClick={save} disabled={saving}><Save size={14} /> {saving ? 'Zapisywanie…' : saved ? '✓ Zapisano' : 'Zapisz'}</Btn></div>
    </div>
  );
};

// ─── NETWORK TAB ──────────────────────────────────────────────────────────────
const NetworkTab: React.FC = () => {
  const [cfg, setCfg] = useState({ externip: '', externhost: '', localnet1: '192.168.0.0/255.255.0.0', localnet2: '10.0.0.0/255.0.0.0', localnet3: '', stunaddr: '', stunrefresh: '30', tcpenable: 'no', tcpbindaddr: '0.0.0.0', tlsenable: 'no', tlsbindaddr: '0.0.0.0', tlscertfile: '/etc/asterisk/keys/asterisk.pem', tlscafile: '', tlscipher: 'HIGH', rtpstart: '10000', rtpend: '20000', stunreachability: 'no' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const f = (k: keyof typeof cfg) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setCfg(c => ({ ...c, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    const sipNet = `; NAT i sieć — dopisz do sekcji [general] w sip.conf\n${cfg.externip ? `externip=${cfg.externip}\n` : ''}${cfg.externhost ? `externhost=${cfg.externhost}\n` : ''}${cfg.localnet1 ? `localnet=${cfg.localnet1}\n` : ''}${cfg.localnet2 ? `localnet=${cfg.localnet2}\n` : ''}${cfg.localnet3 ? `localnet=${cfg.localnet3}\n` : ''}${cfg.stunaddr ? `stunaddr=${cfg.stunaddr}\nstunrefresh=${cfg.stunrefresh}\n` : ''}tcpenable=${cfg.tcpenable}\ntcpbindaddr=${cfg.tcpbindaddr}\ntlsenable=${cfg.tlsenable}\ntlsbindaddr=${cfg.tlsbindaddr}\n${cfg.tlscertfile ? `tlscertfile=${cfg.tlscertfile}\n` : ''}${cfg.tlscafile ? `tlscafile=${cfg.tlscafile}\n` : ''}`;
    const rtpContent = `[general]\nrtpstart=${cfg.rtpstart}\nrtpend=${cfg.rtpend}\nstrictrtp=no\n${cfg.stunaddr ? `stunaddr=${cfg.stunaddr}\nstunreachability=${cfg.stunreachability}\n` : ''}`;
    await Promise.all([
      apiFetch('/config/rtp', { method: 'POST', body: JSON.stringify({ content: rtpContent }) }),
    ]);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl">
      <SectionTitle>Zewnętrzny adres IP (NAT)</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="externip" hint="Statyczny publiczny IP (zostawiaj puste jeśli dynamiczny)"><Input value={cfg.externip} onChange={f('externip')} placeholder="1.2.3.4" /></Field>
        <Field label="externhost" hint="Dynamiczne DNS (alternatywa dla externip)"><Input value={cfg.externhost} onChange={f('externhost')} placeholder="moj.ddns.org" /></Field>
      </div>
      <SectionTitle>Sieci lokalne (localnet)</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Sieć lokalna 1"><Input value={cfg.localnet1} onChange={f('localnet1')} placeholder="192.168.0.0/255.255.0.0" /></Field>
        <Field label="Sieć lokalna 2"><Input value={cfg.localnet2} onChange={f('localnet2')} placeholder="10.0.0.0/255.0.0.0" /></Field>
        <Field label="Sieć lokalna 3 (opcjonalnie)"><Input value={cfg.localnet3} onChange={f('localnet3')} /></Field>
      </div>
      <SectionTitle>STUN</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="STUN Server" hint="np. stun.l.google.com:19302"><Input value={cfg.stunaddr} onChange={f('stunaddr')} /></Field>
        <Field label="STUN Refresh (s)"><Input type="number" value={cfg.stunrefresh} onChange={f('stunrefresh')} /></Field>
        <Field label="STUN Reachability"><Select value={cfg.stunreachability} onChange={f('stunreachability')}><option>no</option><option>yes</option></Select></Field>
      </div>
      <SectionTitle>TCP / TLS</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="TCP Enable"><Select value={cfg.tcpenable} onChange={f('tcpenable')}><option>no</option><option>yes</option></Select></Field>
        <Field label="TCP Bind Address"><Input value={cfg.tcpbindaddr} onChange={f('tcpbindaddr')} /></Field>
        <Field label="TLS Enable"><Select value={cfg.tlsenable} onChange={f('tlsenable')}><option>no</option><option>yes</option></Select></Field>
        <Field label="TLS Bind Address"><Input value={cfg.tlsbindaddr} onChange={f('tlsbindaddr')} /></Field>
        <Field label="TLS Cert File"><Input value={cfg.tlscertfile} onChange={f('tlscertfile')} /></Field>
        <Field label="TLS CA File"><Input value={cfg.tlscafile} onChange={f('tlscafile')} /></Field>
      </div>
      <SectionTitle>RTP (rtp.conf)</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="RTP Port Start" hint="Port UDP dla mediów"><Input type="number" value={cfg.rtpstart} onChange={f('rtpstart')} /></Field>
        <Field label="RTP Port End"><Input type="number" value={cfg.rtpend} onChange={f('rtpend')} /></Field>
      </div>
      <div className="mt-4"><Btn onClick={save} disabled={saving}><Save size={14} /> {saving ? 'Zapisywanie…' : saved ? '✓ Zapisano' : 'Zapisz rtp.conf'}</Btn></div>
    </div>
  );
};

// ─── CODECS TAB ───────────────────────────────────────────────────────────────
const CODEC_LIST = [
  { id: 'ulaw', label: 'G.711 µ-law (ulaw)', desc: 'Standard USA, brak kompresji, 64kbps', recommended: true },
  { id: 'alaw', label: 'G.711 A-law (alaw)', desc: 'Standard Europa, brak kompresji, 64kbps', recommended: true },
  { id: 'g722', label: 'G.722 HD', desc: 'HD Voice, 64kbps, szeroksze pasmo', recommended: true },
  { id: 'g729', label: 'G.729', desc: 'Kompresja 8kbps, wymaga licencji', recommended: false },
  { id: 'opus', label: 'Opus', desc: 'Nowoczesny, VoIP/WebRTC, 6-510kbps', recommended: false },
  { id: 'gsm', label: 'GSM', desc: '13kbps, dobra kompresja', recommended: false },
  { id: 'g726', label: 'G.726', desc: '16-40kbps ADPCM', recommended: false },
  { id: 'slin', label: 'Signed Linear', desc: 'Bez kompresji, wewnętrzny format Asterisk', recommended: false },
  { id: 'h264', label: 'H.264 (wideo)', desc: 'Wideo H.264', recommended: false },
  { id: 'h263', label: 'H.263 (wideo)', desc: 'Wideo H.263', recommended: false },
  { id: 'vp8', label: 'VP8 (wideo)', desc: 'Wideo VP8/WebRTC', recommended: false },
];

const CodecsTab: React.FC = () => {
  const [enabled, setEnabled] = useState<string[]>(['ulaw', 'alaw', 'g722']);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggle = (id: string) => setEnabled(e => e.includes(id) ? e.filter(x => x !== id) : [...e, id]);
  const moveUp = (id: string) => setEnabled(e => { const i = e.indexOf(id); if (i <= 0) return e; const n = [...e]; [n[i-1], n[i]] = [n[i], n[i-1]]; return n; });
  const moveDown = (id: string) => setEnabled(e => { const i = e.indexOf(id); if (i < 0 || i >= e.length-1) return e; const n = [...e]; [n[i], n[i+1]] = [n[i+1], n[i]]; return n; });

  const save = async () => {
    setSaving(true);
    const lines = `disallow=all\n${enabled.map(c => `allow=${c}`).join('\n')}\n`;
    const note = `; Kodeki — wklej do sekcji [general] w sip.conf:\n${lines}`;
    await apiFetch('/config/sip', { method: 'POST', body: JSON.stringify({ content: note }) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-300 mb-4">Zaznacz kodeki i ustaw kolejność (priorytet od góry). Pierwsza opcja = najwyższy priorytet.</p>
      <div className="border rounded-lg overflow-hidden mb-4">
        {CODEC_LIST.map((c) => {
          const isEnabled = enabled.includes(c.id);
          const pos = enabled.indexOf(c.id);
          return (
            <div key={c.id} className={`flex items-center gap-3 px-4 py-3 border-b last:border-0 ${isEnabled ? 'bg-blue-50' : 'bg-[#1e1e1e]'}`}>
              <input type="checkbox" checked={isEnabled} onChange={() => toggle(c.id)} className="w-4 h-4 accent-blue-600" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{c.label}</span>
                  {c.recommended && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">zalecany</span>}
                  {isEnabled && <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded">#{pos + 1}</span>}
                </div>
                <p className="text-xs text-gray-500">{c.desc}</p>
              </div>
              {isEnabled && (
                <div className="flex flex-col gap-1">
                  <button onClick={() => moveUp(c.id)} className="text-gray-300 hover:text-gray-300 text-xs px-1">▲</button>
                  <button onClick={() => moveDown(c.id)} className="text-gray-300 hover:text-gray-300 text-xs px-1">▼</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="bg-[#272727] rounded p-3 text-xs font-mono mb-4 text-gray-300">
        disallow=all<br />
        {enabled.map(c => `allow=${c}`).join('\n')}
      </div>
      <Btn onClick={save} disabled={saving}><Save size={14} /> {saving ? 'Zapisywanie…' : saved ? '✓ Zapisano' : 'Zapisz konfigurację kodeków'}</Btn>
    </div>
  );
};

// ─── LOGS TAB ────────────────────────────────────────────────────────────────
const LogsTab: React.FC = () => {
  const [log, setLog] = useState('');
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState(200);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [logCfg, setLogCfg] = useState({ console_level: 'warning,error', messages_level: 'warning,notice,error', full_level: 'warning,notice,verbose,error,dtmf,fax', security_level: 'security' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLog = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch(`/log?lines=${lines}`);
    setLog(r.log || r.error || '');
    setLoading(false);
  }, [lines]);

  useEffect(() => { loadLog(); }, [loadLog]);

  useEffect(() => {
    if (autoRefresh) { intervalRef.current = setInterval(loadLog, 5000); }
    else { if (intervalRef.current) clearInterval(intervalRef.current); }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, loadLog]);

  const fl = (k: keyof typeof logCfg) => (e: React.ChangeEvent<HTMLInputElement>) => setLogCfg(c => ({ ...c, [k]: e.target.value }));

  const saveLogCfg = async () => {
    setSaving(true);
    const content = `[logfiles]\nconsole => ${logCfg.console_level}\nmessages => ${logCfg.messages_level}\nfull => ${logCfg.full_level}\nsecurity => ${logCfg.security_level}\n`;
    await apiFetch('/config/logger', { method: 'POST', body: JSON.stringify({ content }) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const LEVELS = 'verbose,debug,notice,warning,error,dtmf,fax,security';

  return (
    <div className="max-w-4xl">
      <SectionTitle>Konfiguracja logów (logger.conf)</SectionTitle>
      <p className="text-xs text-gray-500 mb-3">Dostępne poziomy: {LEVELS}</p>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <Field label="Konsola (console)"><Input value={logCfg.console_level} onChange={fl('console_level')} /></Field>
        <Field label="Plik messages"><Input value={logCfg.messages_level} onChange={fl('messages_level')} /></Field>
        <Field label="Plik full (szczegółowy)"><Input value={logCfg.full_level} onChange={fl('full_level')} /></Field>
        <Field label="Plik security"><Input value={logCfg.security_level} onChange={fl('security_level')} /></Field>
      </div>
      <Btn onClick={saveLogCfg} disabled={saving} className="mb-6"><Save size={14} /> {saving ? 'Zapisywanie…' : saved ? '✓ Zapisano' : 'Zapisz logger.conf'}</Btn>

      <SectionTitle>Podgląd logów na żywo</SectionTitle>
      <div className="flex gap-3 mb-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-300">Liczba linii:</label>
          <Select value={lines} onChange={e => setLines(Number(e.target.value))} className="w-24 text-sm py-1">
            <option value={50}>50</option><option value={100}>100</option><option value={200}>200</option><option value={500}>500</option><option value={1000}>1000</option>
          </Select>
        </div>
        <Btn onClick={loadLog} variant="ghost" disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Odśwież</Btn>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="w-4 h-4" />
          Auto-odświeżanie (5s)
        </label>
        {autoRefresh && <span className="text-xs text-green-600 font-medium animate-pulse">● LIVE</span>}
      </div>
      <pre className="bg-gray-900 text-green-400 text-xs font-mono p-4 rounded-lg h-[450px] overflow-auto leading-relaxed">
        {log || '(brak logów)'}
      </pre>
    </div>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const AsteriskManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('install');

  const renderTab = () => {
    switch (activeTab) {
      case 'install':    return <InstallTab />;
      case 'status':     return <StatusTab />;
      case 'general':    return <GeneralTab />;
      case 'sip':        return <SipTab />;
      case 'extensions': return <ExtensionsTab />;
      case 'dialplan':   return <DialPlanTab />;
      case 'queues':     return <QueuesTab />;
      case 'ivr':        return <IvrTab />;
      case 'ami':        return <AmiTab />;
      case 'cdr':        return <CdrTab />;
      case 'recording':  return <RecordingTab />;
      case 'network':    return <NetworkTab />;
      case 'codecs':     return <CodecsTab />;
      case 'logs':       return <LogsTab />;
      default:           return null;
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar nawigacji zakładek */}
      <div className="w-48 shrink-0 border-r border-[#3d3d3d] bg-[#141414] overflow-y-auto">
        <div className="p-3">
          <div className="flex items-center gap-2 mb-4 px-2">
            <Phone size={18} className="text-blue-600" />
            <span className="font-semibold text-white text-sm">Asterisk</span>
          </div>
          {TABS.map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm mb-0.5 transition-colors text-left ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#2a2a2a]'}`}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Treść zakładki */}
      <div className="flex-1 overflow-auto p-6">
        <h2 className="text-xl font-bold text-white mb-5">
          {TABS.find(t => t.id === activeTab)?.label}
        </h2>
        {renderTab()}
      </div>
    </div>
  );
};

export default AsteriskManagement;
