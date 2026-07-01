import React, { useState } from 'react';
import {
  CheckCircle, Copy, Check, Server, Database, Globe, Shield,
  Terminal, Package, Settings, Key, RefreshCw, Layers, Monitor,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CodeBlockProps {
  code: string;
  lang?: string;
}

interface Step {
  id: string;
  number: number;
  title: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  content: React.ReactNode;
}

// ─── CodeBlock ────────────────────────────────────────────────────────────────

const CodeBlock: React.FC<CodeBlockProps> = ({ code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group mt-2 mb-3">
      <pre className="bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-sm text-green-400 font-mono overflow-x-auto whitespace-pre leading-relaxed">
        {code.trim()}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-400 hover:text-white transition-all opacity-0 group-hover:opacity-100"
        title="Kopiuj"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};

// ─── Note ─────────────────────────────────────────────────────────────────────

const Note: React.FC<{ children: React.ReactNode; type?: 'info' | 'warn' | 'tip' }> = ({ children, type = 'info' }) => {
  const styles = {
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
    warn: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    tip:  'bg-green-500/10 border-green-500/30 text-green-300',
  };
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm my-3 leading-relaxed ${styles[type]}`}>
      {children}
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const InstallationGuide: React.FC = () => {
  const [openStep, setOpenStep] = useState<string | null>('ssh_windows');

  const toggle = (id: string) => setOpenStep(prev => prev === id ? null : id);

  const steps: Step[] = [
    {
      id: 'ssh_windows',
      number: 1,
      title: 'Połączenie SSH z Windowsa',
      icon: <Monitor className="w-5 h-5" />,
      color: 'bg-cyan-700',
      description: 'Windows Terminal, PuTTY, WinSCP — połączenie z VPS jako root',
      content: (
        <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
          <Note type="tip">
            Wszystkie poniższe komendy wykonujesz jako <strong>root</strong> — możesz pomijać prefiks <code className="bg-black/30 px-1 rounded">sudo</code> w każdym kroku tego poradnika.
          </Note>

          {/* Opcja A — Windows Terminal */}
          <p className="font-semibold text-white">Opcja A — Windows Terminal / PowerShell (wbudowany SSH)</p>
          <p>Windows 10/11 mają wbudowanego klienta SSH. Otwórz <strong>Windows Terminal</strong> lub <strong>PowerShell</strong> i połącz się:</p>
          <CodeBlock code={`ssh root@IP_TWOJEGO_SERWERA`} />
          <p>Przy pierwszym połączeniu pojawi się pytanie o akceptację odcisku klucza — wpisz <code className="bg-gray-800 px-1.5 py-0.5 rounded text-green-400">yes</code>.</p>
          <p>Jeśli chcesz zalogować się bez hasła (klucz SSH), wygeneruj parę kluczy na Windowsie:</p>
          <CodeBlock code={`# W PowerShell na swoim Windowsie:
ssh-keygen -t ed25519 -C "vps-key"
# Klucz zostanie zapisany domyślnie w C:\Users\TY\.ssh\id_ed25519

# Skopiuj klucz publiczny na serwer:
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@IP_SERWERA "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"`} />

          {/* Opcja B — PuTTY */}
          <p className="font-semibold text-white mt-4">Opcja B — PuTTY (klient GUI)</p>
          <p>Pobierz bezpłatnie z <span className="text-blue-400">putty.org</span>. Konfiguracja połączenia:</p>
          <div className="bg-gray-950 border border-gray-700 rounded-lg overflow-hidden my-2">
            <table className="w-full text-xs font-mono">
              <tbody className="text-green-400">
                <tr className="border-b border-gray-800"><td className="px-4 py-2 text-gray-400 w-40">Host Name</td><td className="px-4 py-2">IP_TWOJEGO_SERWERA</td></tr>
                <tr className="border-b border-gray-800"><td className="px-4 py-2 text-gray-400">Port</td><td className="px-4 py-2">22</td></tr>
                <tr className="border-b border-gray-800"><td className="px-4 py-2 text-gray-400">Connection type</td><td className="px-4 py-2">SSH</td></tr>
                <tr><td className="px-4 py-2 text-gray-400">Login as</td><td className="px-4 py-2">root</td></tr>
              </tbody>
            </table>
          </div>

          {/* WinSCP */}
          <p className="font-semibold text-white mt-4">Transfer plików — WinSCP (SFTP)</p>
          <p>
            Pobierz bezpłatnie z <span className="text-blue-400">winscp.net</span>. WinSCP umożliwia przeciąganie plików z Windowsa na serwer (i odwrotnie) przez graficzny menedżer plików.
          </p>
          <div className="bg-gray-950 border border-gray-700 rounded-lg overflow-hidden my-2">
            <table className="w-full text-xs font-mono">
              <tbody className="text-green-400">
                <tr className="border-b border-gray-800"><td className="px-4 py-2 text-gray-400 w-40">Protocol</td><td className="px-4 py-2">SFTP</td></tr>
                <tr className="border-b border-gray-800"><td className="px-4 py-2 text-gray-400">Host name</td><td className="px-4 py-2">IP_TWOJEGO_SERWERA</td></tr>
                <tr className="border-b border-gray-800"><td className="px-4 py-2 text-gray-400">Port</td><td className="px-4 py-2">22</td></tr>
                <tr className="border-b border-gray-800"><td className="px-4 py-2 text-gray-400">User name</td><td className="px-4 py-2">root</td></tr>
                <tr><td className="px-4 py-2 text-gray-400">Password</td><td className="px-4 py-2">(hasło root VPS)</td></tr>
              </tbody>
            </table>
          </div>
          <Note type="info">WinSCP pozwala też otworzyć sesję PuTTY jednym kliknięciem (przycisk <strong>Open in PuTTY</strong>) — wygodne, jeśli chcesz mieć oba narzędzia jednocześnie.</Note>
        </div>
      ),
    },
    {
      id: 'requirements',
      number: 2,
      title: 'Wymagania systemowe',
      icon: <Server className="w-5 h-5" />,
      color: 'bg-slate-600',
      description: 'Ubuntu 22.04 LTS, min. 1 GB RAM, dostęp root',
      content: (
        <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
          <p>Minimalne wymagania serwera:</p>
          <ul className="space-y-1.5 ml-4 list-disc text-gray-400">
            <li>System: <strong className="text-white">Ubuntu 22.04 LTS</strong> (lub 20.04)</li>
            <li>RAM: minimum <strong className="text-white">1 GB</strong> (zalecane 2 GB)</li>
            <li>Dysk: minimum <strong className="text-white">10 GB</strong> wolnego miejsca</li>
            <li>Dostęp SSH z uprawnieniami <strong className="text-white">root</strong></li>
            <li>Publiczny adres IP (dla domeny i certyfikatu SSL)</li>
          </ul>
          <p className="mt-2">Zaktualizuj system przed instalacją (jako root nie potrzebujesz sudo):</p>
          <CodeBlock code={`apt update && apt upgrade -y`} />
        </div>
      ),
    },
    {
      id: 'nodejs',
      number: 3,
      title: 'Node.js 20 LTS',
      icon: <Package className="w-5 h-5" />,
      color: 'bg-green-700',
      description: 'Instalacja środowiska Node.js przez NodeSource',
      content: (
        <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
          <p>Zainstaluj Node.js 20 LTS przez oficjalne repozytorium NodeSource:</p>
          <CodeBlock code={`curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs`} />
          <p>Sprawdź wersję:</p>
          <CodeBlock code={`node -v   # powinno pokazać v20.x.x
npm -v`} />
        </div>
      ),
    },
    {
      id: 'mysql',
      number: 4,
      title: 'MySQL Server',
      icon: <Database className="w-5 h-5" />,
      color: 'bg-orange-700',
      description: 'Instalacja, zabezpieczenie i konfiguracja bazy danych',
      content: (
        <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
          <p>Zainstaluj MySQL Server:</p>
          <CodeBlock code={`apt install -y mysql-server`} />
          <p>Zabezpiecz instalację (ustaw hasło root MySQL, usuń testowe dane):</p>
          <CodeBlock code={`mysql_secure_installation`} />
          <p>Utwórz bazę danych i użytkownika aplikacji:</p>
          <CodeBlock code={`mysql -u root -p

CREATE DATABASE duocab CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'duocab'@'localhost' IDENTIFIED BY 'TWOJE_HASLO';
GRANT ALL PRIVILEGES ON duocab.* TO 'duocab'@'localhost';
FLUSH PRIVILEGES;
EXIT;`} />
          <Note type="warn">Zmień <strong>TWOJE_HASLO</strong> na silne, unikalne hasło i zapisz je — będzie potrzebne w pliku .env</Note>
          <p>Zaimportuj schemat bazy danych:</p>
          <CodeBlock code={`mysql -u duocab -p duocab < /var/www/app/db_schema_fixed.sql`} />
          <p>Opcjonalnie — zaimportuj migrację nowych kolumn klientów:</p>
          <CodeBlock code={`mysql -u duocab -p duocab < /var/www/app/alter_clients_add_columns.sql`} />
        </div>
      ),
    },
    {
      id: 'project',
      number: 5,
      title: 'Pliki projektu',
      icon: <Layers className="w-5 h-5" />,
      color: 'bg-purple-700',
      description: 'Upload plików przez WinSCP lub SCP, instalacja zależności i build',
      content: (
        <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
          <p>Utwórz katalog aplikacji na serwerze:</p>
          <CodeBlock code={`mkdir -p /var/www/app`} />

          <p className="font-semibold text-white">Opcja A — WinSCP (zalecane dla Windowsa)</p>
          <p>
            Połącz się przez WinSCP (dane z kroku 1). W lewym panelu otwórz folder projektu na swoim Windowsie,
            w prawym panel nawiguj do <code className="bg-gray-800 px-1.5 py-0.5 rounded text-green-400">/var/www/app</code>.
            Zaznacz wszystkie pliki i przeciągnij na serwer.
          </p>
          <Note type="info">WinSCP automatycznie pomija pliki z <strong>.gitignore</strong> — możesz też użyć filtrów, żeby nie przesyłać folderu <strong>node_modules/</strong> (który i tak trzeba zainstalować na serwerze).</Note>

          <p className="font-semibold text-white mt-2">Opcja B — SCP z PowerShell</p>
          <CodeBlock code={`# W PowerShell na Windowsie (z folderu projektu):
scp -r ./* root@IP_SERWERA:/var/www/app/`} />

          <p className="font-semibold text-white mt-2">Opcja C — git clone na serwerze</p>
          <CodeBlock code={`cd /var/www/app
git clone https://github.com/twoje-repo/projekt.git .`} />

          <p>Zainstaluj zależności Node.js:</p>
          <CodeBlock code={`cd /var/www/app
npm install`} />
          <p>Zbuduj frontend (React → statyczne pliki do katalogu dist/):</p>
          <CodeBlock code={`npm run build`} />
          <Note type="tip">Katalog <strong>dist/</strong> zawiera gotowy frontend — Nginx będzie go serwować bezpośrednio.</Note>
        </div>
      ),
    },
    {
      id: 'env',
      number: 6,
      title: 'Plik .env',
      icon: <Key className="w-5 h-5" />,
      color: 'bg-yellow-700',
      description: 'Zmienne środowiskowe — baza danych, porty, klucze',
      content: (
        <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
          <p>Utwórz plik <code className="bg-gray-800 px-1.5 py-0.5 rounded text-green-400">.env</code> w katalogu aplikacji:</p>
          <CodeBlock code={`nano /var/www/app/.env`} />
          <p>Wklej i uzupełnij następującą konfigurację:</p>
          <CodeBlock code={`# ── Baza danych (backend) ──────────────────────
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=duocab
MYSQL_PASSWORD=TWOJE_HASLO
MYSQL_DATABASE=duocab

# ── Baza danych (frontend Vite) ────────────────
VITE_MYSQL_HOST=localhost
VITE_MYSQL_PORT=3306
VITE_MYSQL_USER=duocab
VITE_MYSQL_PASSWORD=TWOJE_HASLO
VITE_MYSQL_DATABASE=duocab

# ── Serwer API ─────────────────────────────────
API_PORT=3001`} />
          <Note type="warn">Plik .env zawiera hasła — upewnij się, że jest w <strong>.gitignore</strong> i ma odpowiednie uprawnienia:</Note>
          <CodeBlock code={`chmod 600 /var/www/app/.env`} />
          <Note type="tip">Plik .env możesz też wygodnie edytować z poziomu WinSCP — kliknij plik prawym przyciskiem → <strong>Edit</strong>, edytuj w notatniku i zapisz.</Note>
        </div>
      ),
    },
    {
      id: 'pm2',
      number: 7,
      title: 'PM2 — menadżer procesów',
      icon: <RefreshCw className="w-5 h-5" />,
      color: 'bg-blue-700',
      description: 'Uruchomienie backendu jako usługi systemowej',
      content: (
        <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
          <p>Zainstaluj PM2 globalnie:</p>
          <CodeBlock code={`npm install -g pm2`} />
          <p>Uruchom backend aplikacji:</p>
          <CodeBlock code={`cd /var/www/app
pm2 start server.js --name "taxi-api"`} />
          <p>Skonfiguruj PM2 do automatycznego startu po restarcie systemu:</p>
          <CodeBlock code={`pm2 startup systemd
# Skopiuj i wykonaj komendę wyświetloną przez powyższe polecenie, np.:
# env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

pm2 save`} />
          <p>Podstawowe komendy PM2:</p>
          <CodeBlock code={`pm2 status          # status procesów
pm2 logs taxi-api   # logi na żywo
pm2 restart taxi-api
pm2 stop taxi-api`} />
        </div>
      ),
    },
    {
      id: 'nginx',
      number: 8,
      title: 'Nginx — reverse proxy',
      icon: <Globe className="w-5 h-5" />,
      color: 'bg-teal-700',
      description: 'Konfiguracja serwera HTTP, obsługa /api i frontendu',
      content: (
        <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
          <p>Zainstaluj Nginx:</p>
          <CodeBlock code={`apt install -y nginx`} />
          <p>Utwórz konfigurację dla aplikacji:</p>
          <CodeBlock code={`nano /etc/nginx/sites-available/taxi`} />
          <p>Wklej poniższą konfigurację (zastąp <strong>twoja-domena.pl</strong> swoją domeną):</p>
          <CodeBlock code={`server {
    listen 80;
    server_name twoja-domena.pl www.twoja-domena.pl;

    # Frontend (pliki statyczne React)
    root /var/www/app/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API (Node.js na porcie 3001)
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3001;
    }
}`} />
          <p>Aktywuj konfigurację i uruchom Nginx:</p>
          <CodeBlock code={`ln -s /etc/nginx/sites-available/taxi /etc/nginx/sites-enabled/
nginx -t          # sprawdź poprawność konfiguracji
systemctl restart nginx
systemctl enable nginx`} />
        </div>
      ),
    },
    {
      id: 'domain',
      number: 9,
      title: 'Domena — DNS',
      icon: <Globe className="w-5 h-5" />,
      color: 'bg-indigo-700',
      description: 'Wpisy DNS kierujące domenę na serwer',
      content: (
        <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
          <p>W panelu DNS swojego rejestratora domeny (np. OVH, Cloudflare, nazwa.pl) dodaj wpisy:</p>
          <div className="bg-gray-950 border border-gray-700 rounded-lg overflow-hidden my-2">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left px-4 py-2">Typ</th>
                  <th className="text-left px-4 py-2">Nazwa</th>
                  <th className="text-left px-4 py-2">Wartość</th>
                  <th className="text-left px-4 py-2">TTL</th>
                </tr>
              </thead>
              <tbody className="text-green-400">
                <tr className="border-b border-gray-800">
                  <td className="px-4 py-2">A</td>
                  <td className="px-4 py-2">@</td>
                  <td className="px-4 py-2">IP_TWOJEGO_SERWERA</td>
                  <td className="px-4 py-2">3600</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">A</td>
                  <td className="px-4 py-2">www</td>
                  <td className="px-4 py-2">IP_TWOJEGO_SERWERA</td>
                  <td className="px-4 py-2">3600</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>Sprawdź publiczny adres IP serwera:</p>
          <CodeBlock code={`curl ifconfig.me`} />
          <p>Weryfikacja propagacji DNS (może zająć do 24h):</p>
          <CodeBlock code={`nslookup twoja-domena.pl
# lub
dig twoja-domena.pl A`} />
          <Note type="info">Certbot z kroku 10 wymaga, żeby domena już wskazywała na serwer — poczekaj na propagację DNS przed instalacją SSL.</Note>
        </div>
      ),
    },
    {
      id: 'ssl',
      number: 10,
      title: 'SSL — certyfikat HTTPS (Certbot)',
      icon: <Shield className="w-5 h-5" />,
      color: 'bg-green-800',
      description: 'Darmowy certyfikat Let\'s Encrypt z automatycznym odnawianiem',
      content: (
        <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
          <p>Zainstaluj Certbot:</p>
          <CodeBlock code={`apt install -y certbot python3-certbot-nginx`} />
          <p>Wygeneruj certyfikat SSL dla domeny (Certbot automatycznie zaktualizuje konfigurację Nginx):</p>
          <CodeBlock code={`certbot --nginx -d twoja-domena.pl -d www.twoja-domena.pl`} />
          <p>Sprawdź automatyczne odnawianie certyfikatu:</p>
          <CodeBlock code={`certbot renew --dry-run`} />
          <Note type="tip">Certbot automatycznie doda cron do odnawiania certyfikatu co 90 dni. Nginx zostanie skonfigurowany do przekierowania HTTP → HTTPS.</Note>
          <p>Sprawdź status Nginx po konfiguracji SSL:</p>
          <CodeBlock code={`nginx -t && systemctl reload nginx`} />
        </div>
      ),
    },
    {
      id: 'firewall',
      number: 11,
      title: 'Firewall (UFW)',
      icon: <Terminal className="w-5 h-5" />,
      color: 'bg-red-800',
      description: 'Otwieranie portów HTTP, HTTPS i SSH',
      content: (
        <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
          <p>Skonfiguruj zaporę sieciową UFW:</p>
          <CodeBlock code={`ufw allow OpenSSH
ufw allow 'Nginx Full'   # otwiera porty 80 (HTTP) i 443 (HTTPS)
ufw enable
ufw status`} />
          <Note type="warn">Port 3001 (backend Node.js) <strong>nie powinien być otwarty</strong> publicznie — dostęp do niego jest tylko przez Nginx jako reverse proxy.</Note>
          <p>Sprawdź poprawność całej konfiguracji:</p>
          <CodeBlock code={`# Status PM2
pm2 status

# Status Nginx
systemctl status nginx

# Status MySQL
systemctl status mysql

# Test endpointu API
curl http://localhost:3001/health`} />
        </div>
      ),
    },
    {
      id: 'env2',
      number: 12,
      title: 'Zmienne VITE_ a produkcja',
      icon: <Settings className="w-5 h-5" />,
      color: 'bg-gray-600',
      description: 'Ważna uwaga o zmiennych VITE_ i buildzie produkcyjnym',
      content: (
        <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
          <Note type="warn">
            <strong>Uwaga!</strong> Zmienne z prefiksem <code className="bg-black/30 px-1 rounded">VITE_</code> są wbudowywane do frontendu podczas <code className="bg-black/30 px-1 rounded">npm run build</code> — nie są odczytywane dynamicznie w runtime. Po zmianie .env należy przebudować frontend.
          </Note>
          <p>Po każdej zmianie zmiennych środowiskowych lub kodu:</p>
          <CodeBlock code={`cd /var/www/app

# Przebuduj frontend
npm run build

# Zrestartuj backend
pm2 restart taxi-api

# Przeładuj Nginx (jeśli zmieniono konfigurację)
systemctl reload nginx`} />
          <p>Upewnij się, że backend odpytuje bazę przez zmienne <strong>bez prefiksu VITE_</strong> (MYSQL_HOST, MYSQL_USER itd.) — frontend korzysta z API backendu, nie bezpośrednio z MySQL.</p>
        </div>
      ),
    },
  ];

  return (
    <div className="bg-gray-900 min-h-full text-white p-6 overflow-y-auto">
      {/* Nagłówek */}
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-blue-600 rounded-lg">
            <Server className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Instalacja na serwerze Ubuntu</h1>
            <p className="text-sm text-gray-400">Pełny przewodnik wdrożenia — Ubuntu 22.04, Nginx, PM2, MySQL, SSL · połączenie z Windowsa</p>
          </div>
        </div>

        {/* Pasek postępu kroków */}
        <div className="flex items-center gap-1 my-6 flex-wrap">
          {steps.map((step, i) => (
            <React.Fragment key={step.id}>
              <button
                onClick={() => toggle(step.id)}
                className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all border-2 ${
                  openStep === step.id
                    ? 'bg-blue-600 border-blue-400 text-white scale-110'
                    : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'
                }`}
                title={step.title}
              >
                {step.number}
              </button>
              {i < steps.length - 1 && <div className="flex-1 h-0.5 bg-gray-700 min-w-[8px]" />}
            </React.Fragment>
          ))}
        </div>

        {/* Kroki */}
        <div className="space-y-2">
          {steps.map(step => (
            <div
              key={step.id}
              className="border border-gray-700 rounded-xl overflow-hidden"
            >
              {/* Nagłówek kroku */}
              <button
                onClick={() => toggle(step.id)}
                className="w-full flex items-center gap-4 px-5 py-4 bg-gray-800 hover:bg-gray-750 transition-colors text-left"
              >
                <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${step.color} shrink-0`}>
                  {step.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-500">#{step.number}</span>
                    <span className="font-semibold text-white">{step.title}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{step.description}</p>
                </div>
                <CheckCircle className={`w-5 h-5 shrink-0 transition-colors ${openStep === step.id ? 'text-blue-400' : 'text-gray-700'}`} />
              </button>

              {/* Treść kroku */}
              {openStep === step.id && (
                <div className="px-5 py-4 bg-gray-900 border-t border-gray-700">
                  {step.content}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Stopka */}
        <div className="mt-6 p-4 bg-gray-800 border border-gray-700 rounded-xl text-center">
          <p className="text-sm text-gray-400">
            Po ukończeniu wszystkich kroków aplikacja jest dostępna pod adresem{' '}
            <span className="text-blue-400 font-mono">https://twoja-domena.pl</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default InstallationGuide;
