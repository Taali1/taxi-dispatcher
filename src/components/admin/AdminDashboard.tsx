import React from 'react';
import { Link } from 'react-router-dom';
import { Users, MapPin, DollarSign, Settings, BarChart, Map, ListChecks, Phone, Store, SlidersHorizontal, BookMarked, ScrollText } from 'lucide-react';

const AdminDashboard: React.FC = () => {
  const adminModules = [
    {
      title: 'Zarządzanie użytkownikami',
      description: 'Dodawaj i zarządzaj administratorami, kierowcami, dyspozytorami i innymi kontami',
      icon: Users,
      link: '/admin/users',
      color: 'bg-blue-600',
    },
    {
      title: 'Zarządzanie rejonami',
      description: 'Definiuj strefy na mapie i przypisuj do nich kierowców',
      icon: MapPin,
      link: '/admin/zones',
      color: 'bg-green-600',
    },
    {
      title: 'Cennik kursów',
      description: 'Ustaw stawki za kilometr, opłaty startowe i taryfy',
      icon: DollarSign,
      link: '/admin/pricing',
      color: 'bg-orange-600',
    },
    {
      title: 'Reguły przydziału',
      description: 'Konfiguruj zasady i kolejność przydzielania zleceń kierowcom',
      icon: Settings,
      link: '/admin/rules',
      color: 'bg-purple-600',
    },
    {
      title: 'Adresy',
      description: 'Konfiguruj mapę OpenStreetMap i zarządzaj niestandardowymi pinezkami adresów',
      icon: Map,
      link: '/admin/map',
      color: 'bg-teal-600',
    },
    {
      title: 'Preferencje',
      description: 'Zarządzaj preferencjami i tagami przypisywanymi kierowcom',
      icon: ListChecks,
      link: '/admin/preferences',
      color: 'bg-pink-600',
    },
    {
      title: 'Giełda',
      description: 'Ustawienia giełdy zleceń — reguły widoczności i dostępu dla kierowców',
      icon: Store,
      link: '/admin/gielda',
      color: 'bg-amber-600',
    },
    {
      title: 'Statystyki i raporty',
      description: 'Przeglądaj liczby zleceń, przychody i analizy wydajności',
      icon: BarChart,
      link: '/admin/reports',
      color: 'bg-red-600',
    },
    {
      title: 'Ustawienia systemowe',
      description: 'Konfiguruj miasto bazowe, styl pinów, auto-dispatch i inne parametry systemu',
      icon: SlidersHorizontal,
      link: '/admin/settings',
      color: 'bg-violet-600',
    },
    {
      title: 'Asterisk (VoIP/SIP)',
      description: 'Instalacja, konfiguracja i zarządzanie centralą telefoniczną Asterisk',
      icon: Phone,
      link: '/admin/asterisk',
      color: 'bg-emerald-600',
    },
    {
      title: 'Baza adresów',
      description: 'Lokalna baza ulic podpowiadana dyspozytorowi przed OpenStreetMap — z fuzzy matchingiem',
      icon: BookMarked,
      link: '/admin/local-addresses',
      color: 'bg-sky-600',
    },
    {
      title: 'Logi systemowe',
      description: 'Historia logowań, wylogowań i akcji administracyjnych w systemie',
      icon: ScrollText,
      link: '/admin/logs',
      color: 'bg-indigo-600',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {adminModules.map((module) => {
          const Icon = module.icon;

          return (
            <Link
              key={module.title}
              to={module.link}
              className="bg-[#1e1e1e] rounded-xl p-6 border border-[#3d3d3d] hover:border-blue-300 hover:shadow-md transition-all duration-200 hover:transform hover:scale-105 group"
            >
              <div className="flex items-center space-x-4 mb-4">
                <div className={`${module.color} w-12 h-12 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold group-hover:text-blue-600 transition-colors duration-200">
                    {module.title}
                  </h3>
                </div>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed">
                {module.description}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default AdminDashboard;
