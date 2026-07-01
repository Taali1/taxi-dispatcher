import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save } from 'lucide-react';
import { dataSourceService } from '../../services/dataSourceService';
import type { ClientPreviewData } from './ClientPreviewModal';
import type { Preference } from '../../services/preferencesService';

interface Props {
  client: ClientPreviewData;
  preferences: Preference[];
  onClose: () => void;
  onSave: (updated: ClientPreviewData) => void;
}

type FormData = {
  clientName:   string;
  phoneNumber:  string;
  email:        string;
  companyName:  string;
  street:       string;
  city:         string;
  postalCode:   string;
  nip:          string;
  internalInfo: string;
};

const FIELDS: { key: keyof Omit<FormData, 'internalInfo'>; label: string; type?: string }[] = [
  { key: 'clientName',  label: 'Nazwa klienta' },
  { key: 'phoneNumber', label: 'Numer telefonu' },
  { key: 'email',       label: 'E-mail',        type: 'email' },
  { key: 'companyName', label: 'Nazwa firmy' },
  { key: 'street',      label: 'Ulica' },
  { key: 'city',        label: 'Miasto' },
  { key: 'postalCode',  label: 'Kod pocztowy' },
  { key: 'nip',         label: 'NIP' },
];

const inputCls =
  'w-full h-10 px-3 text-base rounded border border-[#c4c7cc] dark:border-[#7a7a7a] ' +
  'bg-white dark:bg-[#383838] text-gray-900 dark:text-white ' +
  'placeholder-gray-400 dark:placeholder-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors';

const getPrefIds = (val: number[] | string | null): number[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(Number).filter(Boolean);
  try {
    const parsed = JSON.parse(val as string);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch { return []; }
};

const ClientEditModal: React.FC<Props> = ({ client, preferences, onClose, onSave }) => {
  const [form, setForm] = useState<FormData>({
    clientName:   client.clientName   ?? '',
    phoneNumber:  client.phoneNumber  ?? '',
    email:        client.email        ?? '',
    companyName:  client.companyName  ?? '',
    street:       client.street       ?? '',
    city:         client.city         ?? '',
    postalCode:   client.postalCode   ?? '',
    nip:          client.nip          ?? '',
    internalInfo: client.internalInfo ?? '',
  });
  const [selectedPrefIds, setSelectedPrefIds] = useState<number[]>(
    getPrefIds(client.permanentPreferenceIds),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const set =
    (k: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const togglePref = (id: number) =>
    setSelectedPrefIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await dataSourceService.query(
        `UPDATE clients
         SET client_name=?, phone_number=?, email=?, company_name=?,
             street=?, city=?, postal_code=?, nip=?, internal_info=?,
             permanent_preference_ids=?
         WHERE phone_number=?`,
        [
          form.clientName   || null,
          form.phoneNumber  || null,
          form.email        || null,
          form.companyName  || null,
          form.street       || null,
          form.city         || null,
          form.postalCode   || null,
          form.nip          || null,
          form.internalInfo || null,
          JSON.stringify(selectedPrefIds),
          client.phoneNumber,
        ],
      );

      if (result.success) {
        onSave({
          ...client,
          clientName:              form.clientName   || client.clientName,
          phoneNumber:             form.phoneNumber  || client.phoneNumber,
          email:                   form.email        || null,
          companyName:             form.companyName  || null,
          street:                  form.street       || null,
          city:                    form.city         || null,
          postalCode:              form.postalCode   || null,
          nip:                     form.nip          || null,
          internalInfo:            form.internalInfo || null,
          permanentPreferenceIds:  selectedPrefIds,
        });
      } else {
        setError('Nie udało się zapisać zmian.');
      }
    } catch {
      setError('Wystąpił błąd podczas zapisu.');
    } finally {
      setSaving(false);
    }
  };

  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-[#2d2d2d] border border-gray-200 dark:border-[#696969] rounded-md shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">

        {/* ── Nagłówek ── */}
        <div className="shrink-0 px-6 py-4 border-b border-gray-200 dark:border-[#696969] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Edytuj dane klienta
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#434343] text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Formularz ── */}
        <div className="px-6 py-5 overflow-y-auto flex-1 flex gap-5 items-start">

          {/* Lewa: pola tekstowe */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {FIELDS.map(({ key, label, type }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-300 mb-1">
                    {label}
                  </label>
                  <input
                    type={type ?? 'text'}
                    value={form[key]}
                    onChange={set(key)}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 dark:text-gray-300 mb-1">
                Uwagi wewnętrzne
              </label>
              <textarea
                value={form.internalInfo}
                onChange={set('internalInfo')}
                rows={3}
                className={
                  'w-full px-3 py-2 text-base rounded border border-[#c4c7cc] dark:border-[#7a7a7a] ' +
                  'bg-white dark:bg-[#383838] text-gray-900 dark:text-white ' +
                  'placeholder-gray-400 dark:placeholder-gray-400 ' +
                  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ' +
                  'transition-colors resize-none'
                }
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            )}
          </div>

          {/* Prawa: preferencje stałe */}
          <div className="w-52 shrink-0">
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-300 mb-2">
              Preferencje stałe
            </label>
            {preferences.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-300 italic">
                Brak zdefiniowanych preferencji
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                {preferences.map(p => {
                  const selected = selectedPrefIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePref(p.id)}
                      className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all border ${
                        selected
                          ? 'text-white shadow-sm border-transparent'
                          : 'text-gray-600 dark:text-gray-200 bg-gray-100 dark:bg-[#383838] border-[#c4c7cc] dark:border-[#7a7a7a] hover:bg-gray-200 dark:hover:bg-[#585858]'
                      }`}
                      style={selected ? { backgroundColor: p.color || '#6b7280' } : {}}
                    >
                      <span className="truncate">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* ── Stopka ── */}
        <div className="shrink-0 px-6 py-3 border-t border-gray-200 dark:border-[#696969] flex items-center justify-end gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 h-9 text-[15px] font-semibold rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white transition-colors"
          >
            {saving
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Save className="w-4 h-4" />
            }
            Zapisz
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-5 h-9 text-[15px] font-semibold bg-[#585858] hover:bg-[#4a4a4a] active:bg-[#3c3c3c] text-white rounded-md transition-colors"
          >
            <X size={15} /> Zamknij
          </button>
        </div>

      </div>
    </div>,
    document.body,
  );
};

export default ClientEditModal;
