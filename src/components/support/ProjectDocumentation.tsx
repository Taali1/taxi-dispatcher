import React, { useState } from 'react';
import { FileCode, Folder, Search, Box, Database, Cog, FileType, Layers, Copy, Check, Server, Globe } from 'lucide-react';

interface FileInfo {
  path: string;
  name: string;
  description: string;
}

interface Category {
  name: string;
  icon: React.ReactNode;
  color: string;
  files: FileInfo[];
}

const ProjectDocumentation: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const copyToClipboard = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const categories: Category[] = [
    {
      name: 'Aplikacja — wejście',
      icon: <Globe className="w-5 h-5" />,
      color: 'bg-gray-600',
      files: [
        {
          path: 'src/main.tsx',
          name: 'main',
          description: 'Punkt wejścia aplikacji React — renderuje <App /> do DOM, importuje style globalne'
        },
        {
          path: 'src/App.tsx',
          name: 'App',
          description: 'Główny komponent z definicją tras (React Router) — routing do paneli: dispatcher, driver, admin, support, accounting'
        },
        {
          path: 'src/vite-env.d.ts',
          name: 'vite-env',
          description: 'Deklaracje typów dla zmiennych środowiskowych Vite (import.meta.env)'
        }
      ]
    },
    {
      name: 'Contexts',
      icon: <Layers className="w-5 h-5" />,
      color: 'bg-purple-600',
      files: [
        {
          path: 'src/contexts/AuthContext.tsx',
          name: 'AuthContext',
          description: 'Zarządzanie stanem autoryzacji — logowanie, wylogowanie, sesja użytkownika, role (admin/dispatcher/driver/support/accounting)'
        },
        {
          path: 'src/contexts/ThemeContext.tsx',
          name: 'ThemeContext',
          description: 'Zarządzanie motywem aplikacji (jasny/ciemny) z persystencją w localStorage'
        }
      ]
    },
    {
      name: 'Pages',
      icon: <Globe className="w-5 h-5" />,
      color: 'bg-violet-600',
      files: [
        {
          path: 'src/pages/HomePage.tsx',
          name: 'HomePage',
          description: 'Strona główna — przekierowanie do odpowiedniego panelu na podstawie roli zalogowanego użytkownika'
        },
        {
          path: 'src/pages/LoginPageByRole.tsx',
          name: 'LoginPageByRole',
          description: 'Strona logowania z wyborem roli użytkownika przed uwierzytelnieniem'
        },
        {
          path: 'src/pages/MapPage.tsx',
          name: 'MapPage',
          description: 'Pełnoekranowa strona mapy OpenStreetMap — podgląd lokalizacji kierowców i stref w czasie rzeczywistym'
        }
      ]
    },
    {
      name: 'Hooks',
      icon: <Database className="w-5 h-5" />,
      color: 'bg-pink-600',
      files: [
        {
          path: 'src/hooks/useConnectionStatus.ts',
          name: 'useConnectionStatus',
          description: 'Hook monitorujący stan połączenia z serwerem API i bazą danych'
        },
        {
          path: 'src/hooks/useDriverLocation.ts',
          name: 'useDriverLocation',
          description: 'Hook do śledzenia lokalizacji GPS kierowcy w czasie rzeczywistym z obsługą błędów'
        },
        {
          path: 'src/hooks/useNotificationSound.ts',
          name: 'useNotificationSound',
          description: 'Hook odtwarzający dźwięki powiadomień przy nowych zleceniach i zdarzeniach systemowych'
        }
      ]
    },
    {
      name: 'Constants',
      icon: <Box className="w-5 h-5" />,
      color: 'bg-gray-500',
      files: [
        {
          path: 'src/constants/driverColors.ts',
          name: 'driverColors',
          description: 'Mapowanie kolorów dla stanów kierowców (wolna, zajęta, dojazd, kursem) używane na mapie i w tabelach'
        }
      ]
    },
    {
      name: 'Services',
      icon: <Cog className="w-5 h-5" />,
      color: 'bg-blue-600',
      files: [
        {
          path: 'src/services/dataSourceService.ts',
          name: 'dataSourceService',
          description: 'Główny serwis komunikacji z backendem — wysyła zapytania SQL przez API (/api/query), auto-konwersja snake_case → camelCase, auto-parsowanie JSON'
        },
        {
          path: 'src/services/orderService.ts',
          name: 'orderService',
          description: 'Tworzenie i zarządzanie zleceniami — createOrder(), dispatchOrderToDriver(), pola: adresy, telefon, kategoria pojazdu, metoda płatności, preferencje'
        },
        {
          path: 'src/services/preferencesService.ts',
          name: 'preferencesService',
          description: 'Pobieranie i zarządzanie preferencjami stałymi klientów — getAll(), interfejs Preference {id, name, color}'
        },
        {
          path: 'src/services/zoneService.ts',
          name: 'zoneService',
          description: 'Pobieranie stref taksówkowych z bazy — dane poligonów dla wykrywania GPS i kolejkowania kierowców'
        },
        {
          path: 'src/services/dispatcherZoneService.ts',
          name: 'dispatcherZoneService',
          description: 'Serwis stref dla dyspozytora — wykrywanie strefy na podstawie adresu odbioru, integracja z kolejką'
        },
        {
          path: 'src/services/driverQueueService.ts',
          name: 'driverQueueService',
          description: 'Zarządzanie kolejką kierowców — wejście/wyjście ze strefy, zmiana statusu, pobieranie kolejki dla strefy'
        },
        {
          path: 'src/services/driverLocationService.ts',
          name: 'driverLocationService',
          description: 'Aktualizacja pozycji GPS kierowcy na serwerze, polling lokalizacji wszystkich kierowców'
        },
        {
          path: 'src/services/driverAnalyticsService.ts',
          name: 'driverAnalyticsService',
          description: 'Analityka kierowców — historia kursów, statystyki aktywności, czas pracy'
        },
        {
          path: 'src/services/orderAssignmentService.ts',
          name: 'orderAssignmentService',
          description: 'Logika przydzielania zleceń kierowcom — priorytetyzacja na podstawie kolejki, strefy i dostępności'
        },
        {
          path: 'src/services/chatService.ts',
          name: 'chatService',
          description: 'Obsługa czatu wewnętrznego — wysyłanie i pobieranie wiadomości między dyspozytorami a kierowcami'
        },
        {
          path: 'src/services/settingsService.ts',
          name: 'settingsService',
          description: 'Pobieranie ustawień systemowych (domyślna kategoria pojazdu, metoda płatności, inne konfiguracje globalne)'
        },
        {
          path: 'src/services/regionService.ts',
          name: 'regionService',
          description: 'Zarządzanie regionami — hierarchia powyżej stref, przypisywanie cen i reguł do regionów'
        },
        {
          path: 'src/services/userService.ts',
          name: 'userService',
          description: 'Operacje na kontach użytkowników — tworzenie, aktualizacja, pobieranie danych dla wszystkich ról'
        },
        {
          path: 'src/services/databaseService.ts',
          name: 'databaseService',
          description: 'Legacy serwis bazy danych — ogólne operacje CRUD (zastąpiony przez dataSourceService w nowych komponentach)'
        },
        {
          path: 'src/services/realtimeService.ts',
          name: 'realtimeService',
          description: 'Obsługa aktualizacji w czasie rzeczywistym (polling lub WebSocket) — odświeżanie list zleceń i stanów kierowców'
        },
        {
          path: 'src/services/mysqlSchemaGenerator.ts',
          name: 'mysqlSchemaGenerator',
          description: 'Generator schematu MySQL — tworzy i eksportuje definicje tabel na podstawie aktualnej struktury bazy'
        },
        {
          path: 'src/services/supabase.ts',
          name: 'supabase',
          description: 'Klient Supabase (legacy) — zachowany dla kompatybilności wstecznej, aktywna baza to MySQL'
        },
        {
          path: 'src/services/supabaseUserService.ts',
          name: 'supabaseUserService',
          description: 'Legacy serwis użytkowników oparty na Supabase — nieużywany po migracji do MySQL'
        }
      ]
    },
    {
      name: 'Utils',
      icon: <Box className="w-5 h-5" />,
      color: 'bg-green-600',
      files: [
        {
          path: 'src/utils/zoneDetection.ts',
          name: 'zoneDetection',
          description: 'Algorytm Ray-Casting do wykrywania czy punkt GPS znajduje się wewnątrz poligonu strefy — używany przez kolejkę i mapę'
        },
        {
          path: 'src/utils/orderAssignment.ts',
          name: 'orderAssignment',
          description: 'Pomocnicze funkcje przydzielania zleceń — kalkulacja priorytetów, filtrowanie kierowców według kryteriów'
        }
      ]
    },
    {
      name: 'Types',
      icon: <FileType className="w-5 h-5" />,
      color: 'bg-orange-600',
      files: [
        {
          path: 'src/types/index.ts',
          name: 'index',
          description: 'Główne definicje typów TypeScript — Order, Driver, Zone, Preference i inne interfejsy używane w całej aplikacji'
        },
        {
          path: 'src/types/database.ts',
          name: 'database',
          description: 'Typy dla modeli bazy danych — mapowanie kolumn MySQL na interfejsy TypeScript'
        },
        {
          path: 'src/types/users.ts',
          name: 'users',
          description: 'Typy dla ról użytkowników — Administrator, Dispatcher, Driver, Support, Accounting z polami uprawnień'
        },
        {
          path: 'src/types/driverHistory.ts',
          name: 'driverHistory',
          description: 'Typy dla historii aktywności kierowcy — wpisy logu, zmiany statusu, zdarzenia kolejkowania'
        }
      ]
    },
    {
      name: 'Components — Admin',
      icon: <Folder className="w-5 h-5" />,
      color: 'bg-red-600',
      files: [
        {
          path: 'src/components/admin/AdminPanel.tsx',
          name: 'AdminPanel',
          description: 'Główny panel administracyjny — nawigacja boczna (AdminSidebar) i routowanie do modułów'
        },
        {
          path: 'src/components/admin/AdminSidebar.tsx',
          name: 'AdminSidebar',
          description: 'Boczne menu panelu admina z ikonami i linkami do wszystkich modułów administracyjnych'
        },
        {
          path: 'src/components/admin/AdminDashboard.tsx',
          name: 'AdminDashboard',
          description: 'Dashboard z kafelkami modułów, statystykami systemu i szybkim dostępem do najważniejszych funkcji'
        },
        {
          path: 'src/components/admin/UserManagement.tsx',
          name: 'UserManagement',
          description: 'Zarządzanie wszystkimi typami kont — przegląd, edycja, aktywacja/deaktywacja użytkowników'
        },
        {
          path: 'src/components/admin/ZoneManagement.tsx',
          name: 'ZoneManagement',
          description: 'Rysowanie i edycja stref taksówkowych na mapie OpenStreetMap z Leaflet Draw'
        },
        {
          path: 'src/components/admin/MapManagement.tsx',
          name: 'MapManagement',
          description: 'Konfiguracja mapy i zarządzanie niestandardowymi adresami (custom pins)'
        },
        {
          path: 'src/components/admin/PricingManagement.tsx',
          name: 'PricingManagement',
          description: 'Zarządzanie cennikiem — stawki za km, opłaty startowe, przedziały cenowe, promocje'
        },
        {
          path: 'src/components/admin/PreferencesManagement.tsx',
          name: 'PreferencesManagement',
          description: 'Zarządzanie preferencjami stałymi klientów — dodawanie, edycja, przypisywanie kolorów i ikon'
        },
        {
          path: 'src/components/admin/AssignmentRules.tsx',
          name: 'AssignmentRules',
          description: 'Konfiguracja reguł automatycznego przydzielania zleceń — priorytety, strefy, kategorie pojazdów'
        },
        {
          path: 'src/components/admin/GieldaSettings.tsx',
          name: 'GieldaSettings',
          description: 'Ustawienia giełdy zleceń — czas oczekiwania, zasady wystawiania, widoczność dla kierowców'
        },
        {
          path: 'src/components/admin/TaxiCodeManagement.tsx',
          name: 'TaxiCodeManagement',
          description: 'Zarządzanie kodami taksówek — przypisywanie kodów do kierowców, pulę dostępnych kodów'
        },
        {
          path: 'src/components/admin/AsteriskManagement.tsx',
          name: 'AsteriskManagement',
          description: 'Integracja z centralą VoIP Asterisk — konfiguracja, kanały SIP, CDR (rejestry połączeń)'
        },
        {
          path: 'src/components/admin/SystemSettings.tsx',
          name: 'SystemSettings',
          description: 'Globalne ustawienia systemu — domyślne wartości formularzy, parametry kolejki, konfiguracja API'
        },
        {
          path: 'src/components/admin/ReportsStats.tsx',
          name: 'ReportsStats',
          description: 'Raporty i statystyki — liczba kursów, przychody, czas oczekiwania, aktywność kierowców'
        },
        {
          path: 'src/components/admin/IconPicker.tsx',
          name: 'IconPicker',
          description: 'Komponent wyboru ikony (z zestawu Lucide) używany w PreferencesManagement i innych modułach'
        }
      ]
    },
    {
      name: 'Components — Admin / Użytkownicy',
      icon: <Folder className="w-5 h-5" />,
      color: 'bg-red-500',
      files: [
        {
          path: 'src/components/admin/users/AdministratorManagement.tsx',
          name: 'AdministratorManagement',
          description: 'Zarządzanie kontami administratorów — tworzenie, edycja, poziomy dostępu (super/standard/limited), uprawnienia modułowe'
        },
        {
          path: 'src/components/admin/users/DriverManagement.tsx',
          name: 'DriverManagement',
          description: 'Zarządzanie kierowcami — kody taksówek, numery rejestracyjne, przypisanie stref, statusy aktywności'
        },
        {
          path: 'src/components/admin/users/DispatcherManagement.tsx',
          name: 'DispatcherManagement',
          description: 'Zarządzanie dyspozytorami — konta, uprawnienia do modułów, dostęp do funkcji panelu'
        },
        {
          path: 'src/components/admin/users/SupportManagement.tsx',
          name: 'SupportManagement',
          description: 'Zarządzanie kontami supportu technicznego — dostęp do bazy danych i narzędzi diagnostycznych'
        },
        {
          path: 'src/components/admin/users/AccountingManagement.tsx',
          name: 'AccountingManagement',
          description: 'Zarządzanie kontami księgowymi — dostęp do raportów finansowych i eksportu danych'
        }
      ]
    },
    {
      name: 'Components — Dispatcher',
      icon: <Folder className="w-5 h-5" />,
      color: 'bg-indigo-600',
      files: [
        {
          path: 'src/components/dispatcher/DispatcherPanel.tsx',
          name: 'DispatcherPanel',
          description: 'Główny panel dyspozytora — zakładki: Giełda, Aktywne, Terminowe, Kolejka, Taksówki, Klienci, Czat, Mapa. Obsługuje modal zlecenia ("Obsługa zlecenia")'
        },
        {
          path: 'src/components/dispatcher/OrderForm.tsx',
          name: 'OrderForm',
          description: 'Formularz tworzenia zlecenia (wersja 1) — telefon, nazwa klienta, adresy, preferencje, kategoria pojazdu, metoda płatności. Zawiera przycisk Info → ClientPreviewModal'
        },
        {
          path: 'src/components/dispatcher/OrderForm2.tsx',
          name: 'OrderForm2',
          description: 'Alternatywny formularz zlecenia (wersja 2) — uproszczony układ, inne rozmieszczenie pól'
        },
        {
          path: 'src/components/dispatcher/OrderForm3.tsx',
          name: 'OrderForm3',
          description: 'Alternatywny formularz zlecenia (wersja 3) — kompaktowy design z grupowaniem pól'
        },
        {
          path: 'src/components/dispatcher/KlienciTab.tsx',
          name: 'KlienciTab',
          description: 'Zakładka klientów w panelu dyspozytora — tabela klientów z wyszukiwaniem, sortowaniem i przyciskiem Info (InfoLg) otwierającym ClientPreviewModal. SELECT obejmuje: email, company_name, street, city, postal_code, nip'
        },
        {
          path: 'src/components/dispatcher/ClientPreviewModal.tsx',
          name: 'ClientPreviewModal',
          description: 'Modal podglądu klienta — zakładki: Informacje podstawowe (3-kolumnowa siatka: email, firma, adres, NIP, uwagi), Adresy (top pickup/destination), Historia zleceń. Interfejs ClientPreviewData zawiera nowe pola: email, companyName, street, city, postalCode, nip'
        },
        {
          path: 'src/components/dispatcher/ClientInfoModal.tsx',
          name: 'ClientInfoModal',
          description: 'Stary modal informacji o kliencie (legacy) — zastąpiony przez ClientPreviewModal w OrderForm.tsx'
        },
        {
          path: 'src/components/dispatcher/DriverInfoModal.tsx',
          name: 'DriverInfoModal',
          description: 'Modal szczegółów kierowcy — status, lokalizacja, aktywne zlecenie, historia aktywności'
        },
        {
          path: 'src/components/dispatcher/OrderList.tsx',
          name: 'OrderList',
          description: 'Lista zleceń z filtrowaniem po statusie, wyszukiwaniem i kolorowymi oznaczeniami statusów'
        },
        {
          path: 'src/components/dispatcher/AddressAutocomplete.tsx',
          name: 'AddressAutocomplete',
          description: 'Autouzupełnianie adresów przez Nominatim API (OpenStreetMap) z obsługą niestandardowych adresów (CustomPin)'
        },
        {
          path: 'src/components/dispatcher/AddressPinMap.tsx',
          name: 'AddressPinMap',
          description: 'Mapa do ręcznego pinowania adresu odbioru/docelowego — wybór punktu kliknięciem'
        },
        {
          path: 'src/components/dispatcher/MapPickerModal.tsx',
          name: 'MapPickerModal',
          description: 'Modal z mapą do wyboru lokalizacji — używany przy ręcznym ustawianiu adresu'
        },
        {
          path: 'src/components/dispatcher/DriverSuggestion.tsx',
          name: 'DriverSuggestion',
          description: 'Podpowiedzi kierowców do przydzielenia — ranking na podstawie kolejki, strefy i dostępności'
        },
        {
          path: 'src/components/dispatcher/CostCalculator.tsx',
          name: 'CostCalculator',
          description: 'Kalkulator kosztu kursu na podstawie odległości (Haversine) i aktywnego cennika'
        },
        {
          path: 'src/components/dispatcher/TaxiQueue.tsx',
          name: 'TaxiQueue',
          description: 'Widok kolejki taksówek w poszczególnych strefach — lista kierowców z ich pozycją i statusem'
        },
        {
          path: 'src/components/dispatcher/TaxiTab.tsx',
          name: 'TaxiTab',
          description: 'Zakładka taksówek — lista wszystkich kierowców z kolorowym statusem, GPS, kodem i strefą'
        },
        {
          path: 'src/components/dispatcher/DispatcherRejonTab.tsx',
          name: 'DispatcherRejonTab',
          description: 'Zakładka rejonów — widok kierowców pogrupowanych według przypisanych stref/rejonów'
        },
        {
          path: 'src/components/dispatcher/DriversMapView.tsx',
          name: 'DriversMapView',
          description: 'Widok mapy w panelu dyspozytora — markery kierowców z kolorami statusów i tooltipami'
        },
        {
          path: 'src/components/dispatcher/DispatcherMiniMap.tsx',
          name: 'DispatcherMiniMap',
          description: 'Miniaturowa mapa w formularzu zlecenia — pokazuje lokalizację odbioru i docelową'
        },
        {
          path: 'src/components/dispatcher/DispatcherChat.tsx',
          name: 'DispatcherChat',
          description: 'Zakładka czatu wewnętrznego — wiadomości między dyspozytorami a kierowcami w czasie rzeczywistym'
        },
        {
          path: 'src/components/dispatcher/DispatcherEvents.tsx',
          name: 'DispatcherEvents',
          description: 'Log zdarzeń systemowych dla dyspozytora — nowe zlecenia, zmiany statusów, alarmy'
        },
        {
          path: 'src/components/dispatcher/ZoneDisplayCompact.tsx',
          name: 'ZoneDisplayCompact',
          description: 'Kompaktowy wyświetlacz strefy — pokazuje wykrytą strefę dla adresu odbioru'
        }
      ]
    },
    {
      name: 'Components — Driver',
      icon: <Folder className="w-5 h-5" />,
      color: 'bg-teal-600',
      files: [
        {
          path: 'src/components/driver/DriverApp.tsx',
          name: 'DriverApp',
          description: 'Główna aplikacja kierowcy — wrapper zarządzający stanem połączenia, GPS i powiadomieniami'
        },
        {
          path: 'src/components/driver/DriverPanel.tsx',
          name: 'DriverPanel',
          description: 'Panel główny kierowcy — nawigacja między zakładkami (Zlecenia, Kolejka, Mapa, Czat, Raport, Ustawienia)'
        },
        {
          path: 'src/components/driver/DriverMapPage.tsx',
          name: 'DriverMapPage',
          description: 'Pełnoekranowa mapa kierowcy z live GPS, wykrywaniem strefy i przyciskiem kolejkowania'
        },
        {
          path: 'src/components/driver/DriverMap.tsx',
          name: 'DriverMap',
          description: 'Komponent mapy Leaflet z markerem pozycji kierowcy, granicami stref i oznaczeniem aktywnej strefy'
        },
        {
          path: 'src/components/driver/DriverStatus.tsx',
          name: 'DriverStatus',
          description: 'Przełącznik statusu kierowcy (wolna/dojazd/zajęta/kursem) z kolorowym oznaczeniem'
        },
        {
          path: 'src/components/driver/DriverStatusDisplay.tsx',
          name: 'DriverStatusDisplay',
          description: 'Wyświetlacz aktualnego statusu kierowcy — pasek z kolorem i etykietą stanu'
        },
        {
          path: 'src/components/driver/DriverQueueTab.tsx',
          name: 'DriverQueueTab',
          description: 'Zakładka kolejki kierowcy — pozycja w kolejce strefy, przyciski wejście/wyjście z kolejki'
        },
        {
          path: 'src/components/driver/TaxiTab.tsx',
          name: 'TaxiTab (Driver)',
          description: 'Zakładka taksówek w aplikacji kierowcy — widok innych kierowców w tej samej strefie'
        },
        {
          path: 'src/components/driver/OrdersList.tsx',
          name: 'OrdersList',
          description: 'Lista przypisanych zleceń dla kierowcy z detalami (adres, status, czas)'
        },
        {
          path: 'src/components/driver/OrderNotification.tsx',
          name: 'OrderNotification',
          description: 'Powiadomienie o nowym zleceniu — popup z adresem odbioru, opcją akceptacji i odliczaniem czasu'
        },
        {
          path: 'src/components/driver/DriverQueryPopup.tsx',
          name: 'DriverQueryPopup',
          description: 'Popup zapytania od dyspozytora — kierowca może odpowiedzieć na wiadomość/pytanie'
        },
        {
          path: 'src/components/driver/DriverReport.tsx',
          name: 'DriverReport',
          description: 'Raport dzienny kierowcy — liczba kursów, sumaryczny przychód, czas pracy'
        },
        {
          path: 'src/components/driver/DriverSettings.tsx',
          name: 'DriverSettings',
          description: 'Ustawienia kierowcy — powiadomienia dźwiękowe, preferencje wyświetlania'
        },
        {
          path: 'src/components/driver/DriverChat.tsx',
          name: 'DriverChat',
          description: 'Czat kierowcy z dyspozytorem — lista wiadomości i pole do wysyłania'
        },
        {
          path: 'src/components/driver/MessagePopup.tsx',
          name: 'MessagePopup',
          description: 'Popup nowej wiadomości od dyspozytora — wyświetla treść i umożliwia odczytanie'
        },
        {
          path: 'src/components/driver/GPSStatusIndicator.tsx',
          name: 'GPSStatusIndicator',
          description: 'Wskaźnik stanu GPS — ikona z kolorem sygnalizującym jakość sygnału i dokładność lokalizacji'
        },
        {
          path: 'src/components/driver/StatusBar.tsx',
          name: 'StatusBar',
          description: 'Pasek statusu aplikacji kierowcy — GPS, połączenie z serwerem, strefa, bieżący status'
        },
        {
          path: 'src/components/driver/NumericKeypad.tsx',
          name: 'NumericKeypad',
          description: 'Klawiatura numeryczna na ekranie — używana do wpisywania kodów i numerów w interfejsie dotykowym'
        },
        {
          path: 'src/components/driver/ConnectionIndicator.tsx',
          name: 'ConnectionIndicator (Driver)',
          description: 'Wskaźnik połączenia w aplikacji kierowcy — kółko z kolorem (zielony/czerwony/żółty)'
        },
        {
          path: 'src/components/driver/DebugConsole.tsx',
          name: 'DebugConsole',
          description: 'Konsola debugowania dla kierowcy — logi GPS, odpowiedzi API, zdarzenia kolejki (ukrywana w produkcji)'
        }
      ]
    },
    {
      name: 'Components — Accounting',
      icon: <Folder className="w-5 h-5" />,
      color: 'bg-yellow-600',
      files: [
        {
          path: 'src/components/accounting/AccountingPanel.tsx',
          name: 'AccountingPanel',
          description: 'Panel księgowości z dostępem do raportów finansowych i eksportu danych'
        },
        {
          path: 'src/components/accounting/FinancialSummary.tsx',
          name: 'FinancialSummary',
          description: 'Podsumowanie finansowe — przychody, koszty, bilans za wybrany okres'
        },
        {
          path: 'src/components/accounting/InvoiceManagement.tsx',
          name: 'InvoiceManagement',
          description: 'Zarządzanie fakturami — generowanie, eksport PDF, archiwizacja dokumentów'
        },
        {
          path: 'src/components/accounting/PaymentReports.tsx',
          name: 'PaymentReports',
          description: 'Raporty płatności — transakcje według metody (gotówka/karta/bezgotówka), rozliczenia kierowców'
        }
      ]
    },
    {
      name: 'Components — Support',
      icon: <Folder className="w-5 h-5" />,
      color: 'bg-cyan-600',
      files: [
        {
          path: 'src/components/support/SupportPanel.tsx',
          name: 'SupportPanel',
          description: 'Główny panel wsparcia technicznego — zakładki: Bazy Danych, Administratorzy, Symulator, Dokumentacja, Instalacja'
        },
        {
          path: 'src/components/support/DatabaseManagement.tsx',
          name: 'DatabaseManagement',
          description: 'Zarządzanie bazą danych — podzakładki: Status MySQL, Tabele (podgląd), Historia Kierowców, Wgraj SQL'
        },
        {
          path: 'src/components/support/DatabaseStatus.tsx',
          name: 'DatabaseStatus',
          description: 'Status połączenia z bazą MySQL — parametry połączenia, liczba rekordów w tabelach, test połączenia'
        },
        {
          path: 'src/components/support/TableViewer.tsx',
          name: 'TableViewer',
          description: 'Przeglądarka zawartości tabel bazy danych — grid z danymi, paginacja, filtrowanie'
        },
        {
          path: 'src/components/support/SqlUpload.tsx',
          name: 'SqlUpload',
          description: 'Upload i wykonywanie plików SQL na bazie danych — import schematów i migracji'
        },
        {
          path: 'src/components/support/DriverHistoryViewer.tsx',
          name: 'DriverHistoryViewer',
          description: 'Podgląd historii aktywności kierowców — logi zdarzeń, zmiany statusów, wejścia/wyjścia ze strefy'
        },
        {
          path: 'src/components/support/AdminAccountManagement.tsx',
          name: 'AdminAccountManagement',
          description: 'Zarządzanie kontami administratorów z poziomu supportu — tworzenie, edycja, uprawnienia, statusy'
        },
        {
          path: 'src/components/support/VirtualDriverSimulator.tsx',
          name: 'VirtualDriverSimulator',
          description: 'Symulator wirtualnego kierowcy — testowanie zachowania kolejki, GPS i zleceń bez fizycznego urządzenia'
        },
        {
          path: 'src/components/support/ProjectDocumentation.tsx',
          name: 'ProjectDocumentation',
          description: 'Ten plik — rejestr wszystkich plików projektu z opisami, wyszukiwaniem i kopiowaniem ścieżek'
        },
        {
          path: 'src/components/support/InstallationGuide.tsx',
          name: 'InstallationGuide',
          description: 'Przewodnik instalacji aplikacji na Ubuntu — 11 kroków: Node.js, MySQL, PM2, Nginx, SSL, DNS, firewall. Skopiowalne bloki kodu'
        },
        {
          path: 'src/components/support/Modal.tsx',
          name: 'Modal',
          description: 'Bazowy komponent modal używany wewnątrz panelu supportu — overlay, zamykanie przez ESC i kliknięcie tła'
        },
        {
          path: 'src/components/support/ChatInterface.tsx',
          name: 'ChatInterface',
          description: 'Interfejs czatu wsparcia — podgląd wiadomości systemowych i komunikacji użytkowników'
        },
        {
          path: 'src/components/support/TicketList.tsx',
          name: 'TicketList',
          description: 'Lista zgłoszeń technicznych — zarządzanie ticketami, priorytety, statusy rozwiązania'
        }
      ]
    },
    {
      name: 'Components — Auth',
      icon: <Folder className="w-5 h-5" />,
      color: 'bg-slate-600',
      files: [
        {
          path: 'src/components/auth/LoginPage.tsx',
          name: 'LoginPage',
          description: 'Strona logowania — formularz email/hasło z obsługą ról, przekierowanie po autentykacji'
        }
      ]
    },
    {
      name: 'Components — Common',
      icon: <Folder className="w-5 h-5" />,
      color: 'bg-gray-600',
      files: [
        {
          path: 'src/components/common/Layout.tsx',
          name: 'Layout',
          description: 'Wspólny layout aplikacji — nagłówek z nazwą użytkownika, przełącznik motywu, slot na headerActions, wylogowanie'
        },
        {
          path: 'src/components/common/ColorLegend.tsx',
          name: 'ColorLegend',
          description: 'Legenda kolorów statusów kierowców — wyświetlana na mapie i w listach (wolna/dojazd/zajęta/kursem)'
        },
        {
          path: 'src/components/common/ConnectionIndicator.tsx',
          name: 'ConnectionIndicator',
          description: 'Globalny wskaźnik połączenia z API — wyświetlany w nagłówku Layout gdy serwer niedostępny'
        }
      ]
    },
    {
      name: 'Backend — Server',
      icon: <Server className="w-5 h-5" />,
      color: 'bg-emerald-700',
      files: [
        {
          path: 'server.js',
          name: 'server',
          description: 'Główny serwer Node.js/Express — obsługuje wszystkie endpointy /api/*, pool połączeń MySQL (15 conn), auto-reconnect, health-check co 4s. Port: 3001 (API_PORT)'
        },
        {
          path: 'queue/queueController.js',
          name: 'queueController',
          description: 'Kontroler HTTP kolejki kierowców — endpointy: POST /enter-zone, POST /state, POST /leave-zone, GET /zone/:n, GET /all'
        },
        {
          path: 'queue/queueService.js',
          name: 'queueService',
          description: 'Logika biznesowa kolejki — enterZone(), changeDriverState(), leaveZone(), getQueueForZone(), getAllQueues(). Używa algorytmu Ray-Casting do walidacji GPS'
        },
        {
          path: 'queue/queueRepository.js',
          name: 'queueRepository',
          description: 'Warstwa dostępu do danych kolejki — CRUD na tabelach drivers i driver_queue, transakcje, przeliczanie pozycji'
        }
      ]
    }
  ];

  const filteredCategories = categories.map(category => ({
    ...category,
    files: category.files.filter(file =>
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.path.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(category => category.files.length > 0);

  const totalFiles = categories.reduce((sum, cat) => sum + cat.files.length, 0);
  const filteredFilesCount = filteredCategories.reduce((sum, cat) => sum + cat.files.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Dokumentacja Struktury Projektu</h2>
        <p className="text-slate-400">
          Pełny wykaz wszystkich plików projektu z wyjaśnieniem ich funkcji
        </p>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center space-x-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Szukaj plików po nazwie, ścieżce lub opisie..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="text-slate-300 text-sm whitespace-nowrap">
            {searchQuery ? (
              <span>Znaleziono: <span className="font-bold text-blue-400">{filteredFilesCount}</span> plików</span>
            ) : (
              <span>Łącznie: <span className="font-bold text-blue-400">{totalFiles}</span> plików</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {filteredCategories.map((category) => (
          <div key={category.name} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className={`${category.color} px-6 py-4 flex items-center justify-between`}>
              <div className="flex items-center space-x-3">
                {category.icon}
                <h3 className="text-lg font-semibold text-white">{category.name}</h3>
              </div>
              <span className="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium">
                {category.files.length} {category.files.length === 1 ? 'plik' : 'plików'}
              </span>
            </div>

            <div className="p-6">
              <div className="space-y-3">
                {category.files.map((file) => (
                  <div
                    key={file.path}
                    className="bg-slate-700 rounded-lg p-4 border border-slate-600 hover:border-slate-500 transition-colors duration-200"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-3 flex-1">
                        <FileCode className="w-5 h-5 text-blue-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-medium">{file.name}</h4>
                          <code className="text-xs text-slate-400 font-mono break-all">{file.path}</code>
                        </div>
                      </div>
                      <button
                        onClick={() => copyToClipboard(file.path)}
                        className="ml-2 p-2 text-slate-400 hover:text-white hover:bg-slate-600 rounded-lg transition-colors duration-200 shrink-0"
                        title="Kopiuj ścieżkę"
                      >
                        {copiedPath === file.path ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      {file.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredCategories.length === 0 && (
        <div className="bg-slate-800 rounded-xl p-12 border border-slate-700 text-center">
          <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Brak wyników</h3>
          <p className="text-slate-400">
            Nie znaleziono plików pasujących do zapytania: <span className="font-mono text-blue-400">{searchQuery}</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default ProjectDocumentation;
