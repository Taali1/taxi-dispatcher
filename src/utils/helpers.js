export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function generateClientCode(phone) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = () => chars[Math.floor(Math.random() * chars.length)];
  const prefix = rand() + rand() + rand() + rand();
  const digits = String(phone || '').replace(/\D/g, '');
  const last3 = digits.slice(-3).padStart(3, '0');
  return `${prefix}-${last3}`;
}

export function detectZoneFromAddressKeywords(address) {
  if (!address) return null;
  const addr = address.toLowerCase();
  const zoneKeywords = {
    1:  ['stare miasto', 'rynek główny', 'floriańska'],
    2:  ['kazimierz', 'szeroka', 'józefa'],
    3:  ['podgórze', 'wielicka', 'kalwaryjska'],
    4:  ['krowodrza', 'słowackiego', 'manifestu'],
    5:  ['grzegórzki', 'dietla', 'dąbrowskiego'],
    6:  ['prądnik', 'opolska', 'rakowicka'],
    7:  ['nowa huta', 'powstańców', 'bieńczycka'],
    8:  ['salwator', 'kościuszki', 'zwierzyniecka'],
    9:  ['dębniki', 'zakrzówek', 'tyniecka'],
    10: ['mistrzejowice', 'os. tysiąclecia'],
    11: ['bieńczyce', 'igołomska'],
    12: ['jagiellońska', 'mogilska', 'botaniczna'],
  };
  for (const [zoneNum, keywords] of Object.entries(zoneKeywords)) {
    if (keywords.some(kw => addr.includes(kw))) return parseInt(zoneNum);
  }
  return null;
}

export function nowPolish() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const marchLast = new Date(Date.UTC(year, 2, 31, 2, 0, 0));
  while (marchLast.getUTCDay() !== 0) marchLast.setUTCDate(marchLast.getUTCDate() - 1);
  const octLast = new Date(Date.UTC(year, 9, 31, 3, 0, 0));
  while (octLast.getUTCDay() !== 0) octLast.setUTCDate(octLast.getUTCDate() - 1);
  const isDST = now >= marchLast && now < octLast;
  const offsetMs = (isDST ? 2 : 1) * 3600000;
  const pl = new Date(now.getTime() + offsetMs);
  const p = (n) => String(n).padStart(2, '0');
  return `${pl.getUTCFullYear()}-${p(pl.getUTCMonth()+1)}-${p(pl.getUTCDate())} ${p(pl.getUTCHours())}:${p(pl.getUTCMinutes())}:${p(pl.getUTCSeconds())}`;
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
