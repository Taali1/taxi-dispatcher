import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, FileCode, CheckCircle, XCircle, Loader, Trash2, AlertTriangle } from 'lucide-react';

interface StatementResult {
  index: number;
  success: boolean;
  statement: string;
  error?: string;
  affected?: number | null;
}

interface UploadResult {
  success: boolean;
  total: number;
  successCount: number;
  errorCount: number;
  results: StatementResult[];
  error?: string;
}

const SqlUpload: React.FC = () => {
  const [sqlContent, setSqlContent] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Auto-scroll do wyników po każdym wykonaniu
  useEffect(() => {
    if (result) {
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, [result]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.sql')) {
      alert('Proszę wybrać plik z rozszerzeniem .sql');
      return;
    }
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSqlContent((ev.target?.result as string) || '');
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleClear = () => {
    setSqlContent('');
    setFileName(null);
    setResult(null);
  };

  const handleExecute = async () => {
    if (!sqlContent.trim()) return;
    setConfirmOpen(false);
    setExecuting(true);
    setResult(null);
    try {
      const res = await fetch('/api/sql-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlContent })
      });

      // Obsłuż błędne statusy HTTP
      if (!res.ok) {
        let errMsg = `Serwer zwrócił błąd ${res.status}`;
        try {
          const errBody = await res.json();
          errMsg = errBody.error || errMsg;
        } catch {
          // odpowiedź nie jest JSON (np. 404 HTML) — zostaw domyślny komunikat
        }
        setResult({ success: false, total: 0, successCount: 0, errorCount: 1, results: [], error: errMsg });
        return;
      }

      const data: UploadResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({
        success: false,
        total: 0,
        successCount: 0,
        errorCount: 1,
        results: [],
        error: 'Błąd połączenia z serwerem: ' + (err?.message ?? String(err))
      });
    } finally {
      setExecuting(false);
    }
  };

  const statementCount = sqlContent
    .split(/;[ \t]*(\r?\n|$)/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*')).length;

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
            <FileCode className="w-5 h-5 text-blue-400" />
            <span>Wgraj skrypt SQL</span>
          </h3>
          {(sqlContent || fileName) && (
            <button
              onClick={handleClear}
              className="flex items-center space-x-1 text-gray-400 hover:text-red-400 text-sm transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Wyczyść</span>
            </button>
          )}
        </div>

        {/* File drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-600 hover:border-blue-500 rounded-lg p-6 text-center cursor-pointer transition-colors group"
        >
          <Upload className="w-8 h-8 text-gray-500 group-hover:text-blue-400 mx-auto mb-2 transition-colors" />
          <p className="text-gray-300 group-hover:text-white transition-colors text-sm">
            {fileName
              ? <span className="text-blue-400 font-medium">{fileName}</span>
              : <>Kliknij lub przeciągnij plik <span className="text-blue-400">.sql</span></>
            }
          </p>
          <p className="text-xs text-gray-500 mt-1">MySQL / MariaDB SQL</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sql"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Divider */}
        <div className="flex items-center space-x-3">
          <div className="flex-1 border-t border-gray-700" />
          <span className="text-xs text-gray-500">lub wklej SQL ręcznie</span>
          <div className="flex-1 border-t border-gray-700" />
        </div>

        {/* SQL textarea */}
        <textarea
          value={sqlContent}
          onChange={e => { setSqlContent(e.target.value); setFileName(null); setResult(null); }}
          placeholder="-- Wklej tutaj swój skrypt SQL&#10;ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_number VARCHAR(50);"
          rows={8}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-gray-200 font-mono text-sm resize-y focus:outline-none focus:border-blue-500 placeholder-gray-600"
        />

        {/* Footer: stats + execute */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            {sqlContent.trim()
              ? `${statementCount} ${statementCount === 1 ? 'polecenie' : statementCount < 5 ? 'polecenia' : 'poleceń'} do wykonania`
              : 'Brak treści'
            }
          </p>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!sqlContent.trim() || executing}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-5 py-2 rounded-lg transition-colors font-medium"
          >
            {executing ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>{executing ? 'Wykonuję...' : 'Wykonaj SQL'}</span>
          </button>
        </div>
      </div>

      {/* ── Wyniki — renderowane tuż pod formularzem ── */}
      {result && (
        <div ref={resultRef} className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
          {/* Summary banner */}
          <div className={`flex items-start space-x-3 p-4 rounded-lg border ${
            result.error || result.errorCount === result.total && result.total > 0
              ? 'bg-red-900/30 border-red-700'
              : result.errorCount > 0
                ? 'bg-yellow-900/30 border-yellow-700'
                : 'bg-green-900/30 border-green-700'
          }`}>
            {result.error || (result.errorCount > 0 && result.errorCount === result.total) ? (
              <XCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            ) : result.errorCount > 0 ? (
              <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white">
                {result.error
                  ? 'Błąd wykonania'
                  : result.errorCount === 0
                    ? 'Skrypt wykonany pomyślnie'
                    : `Wykonano z błędami (${result.errorCount} z ${result.total})`
                }
              </p>
              {result.error && (
                <p className="text-red-300 text-sm mt-1 break-all">{result.error}</p>
              )}
              {!result.error && (
                <p className="text-sm mt-1 text-gray-400">
                  ✅ {result.successCount} sukces&nbsp;&nbsp;❌ {result.errorCount} błąd
                </p>
              )}
            </div>
          </div>

          {/* Statement list */}
          {result.results.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Szczegóły ({result.results.length})
              </p>
              {result.results.map((r) => (
                <div
                  key={r.index}
                  className={`flex items-start space-x-3 p-3 rounded-lg text-sm ${
                    r.success
                      ? 'bg-green-900/20 border border-green-800'
                      : 'bg-red-900/20 border border-red-800'
                  }`}
                >
                  <span className="text-gray-500 text-xs w-5 flex-shrink-0 mt-0.5">{r.index}.</span>
                  <div className="flex-1 min-w-0">
                    <code className="text-gray-300 text-xs break-all">{r.statement}</code>
                    {r.success && r.affected != null && (
                      <p className="text-green-400 text-xs mt-1">Wierszy: {r.affected}</p>
                    )}
                    {!r.success && r.error && (
                      <p className="text-red-400 text-xs mt-1 break-words">⚠ {r.error}</p>
                    )}
                  </div>
                  {r.success
                    ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  }
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-800 border border-yellow-600 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-start space-x-3 mb-5">
              <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-white font-bold text-lg">Potwierdź wykonanie</h4>
                <p className="text-gray-300 text-sm mt-1">
                  Zamierzasz wykonać <strong className="text-yellow-400">{statementCount}</strong>{' '}
                  {statementCount === 1 ? 'polecenie' : 'poleceń'} SQL.
                  Operacje <code className="text-red-400">DROP</code>, <code className="text-red-400">DELETE</code>,{' '}
                  <code className="text-orange-400">ALTER</code> są nieodwracalne.
                </p>
              </div>
            </div>
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleExecute}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
              >
                Tak, wykonaj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SqlUpload;
