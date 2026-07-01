import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [isDarkMode] = useState(false);

  const features = [
    {
      title: 'Zarządzanie Strefami',
      description: 'Tworzenie i konfiguracja stref, monitorowanie kierowców w czasie rzeczywistym'
    },
    {
      title: 'System Zleceń',
      description: 'Automatyczne przydzielanie zleceń kierowcom z optymalizacją tras'
    },
    {
      title: 'Raportowanie',
      description: 'Szczegółowe raporty finansowe i statystyki operacyjne'
    },
    {
      title: 'Zarządzanie Użytkownikami',
      description: 'Administracja kierowcami, dyspozytorami i pracownikami'
    },
    {
      title: 'Bezpieczeństwo',
      description: 'Kontrola dostępu, uprawnienia i audyt operacji'
    },
    {
      title: 'Wsparcie Klienta',
      description: 'Zarządzanie ticketami i komunikacja z użytkownikami'
    }
  ];

  const roles = [
    {
      id: 'admin',
      name: 'Administrator',
      description: 'Pełna kontrola nad systemem, konfiguracja i zarządzanie',
      features: ['Zarządzanie użytkownikami', 'Konfiguracja systemu', 'Raporty', 'Uprawnienia']
    },
    {
      id: 'dispatcher',
      name: 'Dyspozytor',
      description: 'Zarządzanie zleceniami i kierowcami w strefach',
      features: ['Przydzielanie zleceń', 'Monitorowanie zleceń', 'Zarządzanie kierowcami', 'Raportowanie']
    },
    {
      id: 'driver',
      name: 'Kierowca',
      description: 'Aplikacja mobilna do akceptowania i realizacji zleceń',
      features: ['Akceptowanie zleceń', 'Nawigacja', 'Historia zleceń', 'Zarządzanie statusem']
    },
    {
      id: 'support',
      name: 'Wsparcie Klienta',
      description: 'Obsługa ticketów i komunikacja z klientami',
      features: ['Zarządzanie ticketami', 'Chat z klientami', 'Historia rozmów', 'FAQ']
    },
    {
      id: 'accounting',
      name: 'Księgowość',
      description: 'Zarządzanie finansami i rachunkowością',
      features: ['Faktury i rachunki', 'Raport finansowy', 'Płatności', 'Deklaracje podatków']
    }
  ];

  return (
    <div className={isDarkMode ? "min-h-screen bg-gray-900 text-gray-100" : "min-h-screen bg-white text-gray-900"}>
      {/* Hero Section */}
      <section className="pt-20 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-6">DuoCab</h1>
          <p className={isDarkMode ? "text-xl text-gray-400 mb-8 max-w-2xl mx-auto" : "text-xl text-gray-600 mb-8 max-w-2xl mx-auto"}>
            Kompleksowe rozwiązanie do zarządzania flotą pojazdów, kierowcami, zleceniami i finansami w jednym systemie
          </p>
          <a href="#roles" className={isDarkMode ? "inline-flex items-center space-x-2 px-8 py-3 rounded-lg bg-gray-700 text-white hover:bg-gray-600 transition transform hover:scale-105" : "inline-flex items-center space-x-2 px-8 py-3 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition transform hover:scale-105"}>
            <span>Rozpocznij pracę</span>
            <ArrowRight className="w-5 h-5" />
          </a>
        </div>
      </section>

      {/* Features Section */}
      <section className={isDarkMode ? "py-20 px-4 bg-gray-800" : "py-20 px-4 bg-gray-50"}>
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">Główne Funkcje</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              return (
                <div key={index} className={isDarkMode ? "bg-gray-700 rounded-xl p-6 border border-gray-600 hover:border-gray-500 hover:shadow-md transition" : "bg-white rounded-xl p-6 border border-gray-200 hover:border-gray-300 hover:shadow-md transition"}>
                  <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                  <p className={isDarkMode ? "text-gray-400" : "text-gray-600"}>{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Roles Section */}
      <section id="roles" className={isDarkMode ? "py-20 px-4 bg-gray-900" : "py-20 px-4 bg-white"}>
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">Panele Użytkowników</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roles.map((role) => {
              return (
                <div
                  key={role.id}
                  className={isDarkMode ? "bg-gray-800 rounded-xl overflow-hidden border border-gray-700 hover:border-gray-600 hover:shadow-lg transition" : "bg-white rounded-xl overflow-hidden border border-gray-200 hover:border-gray-300 hover:shadow-lg transition"}
                >
                  {/* Header */}
                  <div className={isDarkMode ? "bg-gray-700 p-6 border-b border-gray-600" : "bg-gray-100 p-6 border-b border-gray-200"}>
                    <h3 className="text-2xl font-bold">{role.name}</h3>
                  </div>

                  {/* Content */}
                  <div className="p-6">
                    <p className={isDarkMode ? "text-gray-400 mb-6" : "text-gray-600 mb-6"}>{role.description}</p>

                    <div className="mb-6">
                      <h4 className={isDarkMode ? "font-semibold mb-3 text-sm text-gray-400" : "font-semibold mb-3 text-sm text-gray-700"}>Możliwości:</h4>
                      <ul className="space-y-2">
                        {role.features.map((feature, idx) => (
                          <li key={idx} className="flex items-center space-x-2 text-sm">
                            <CheckCircle className={isDarkMode ? "w-4 h-4 text-gray-500 flex-shrink-0" : "w-4 h-4 text-gray-400 flex-shrink-0"} />
                            <span className={isDarkMode ? "text-gray-300" : "text-gray-700"}>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      onClick={() => navigate(role.id === 'driver' ? '/driver-app' : `/login/${role.id}`)}
                      className={isDarkMode ? "w-full py-2 px-4 rounded-lg bg-gray-700 text-white hover:bg-gray-600 transition font-semibold" : "w-full py-2 px-4 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition font-semibold"}
                    >
                      Zaloguj się
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={isDarkMode ? "bg-gray-800 border-t border-gray-700 py-8 px-4" : "bg-gray-50 border-t border-gray-200 py-8 px-4"}>
        <div className={isDarkMode ? "max-w-6xl mx-auto text-center text-gray-500" : "max-w-6xl mx-auto text-center text-gray-500"}>
          <p>&copy; 2025 DuoCab. Wszystkie prawa zastrzeżone.</p>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
