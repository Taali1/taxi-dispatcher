import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Users, MapPin, DollarSign, Settings, BarChart, Map, Home, SlidersHorizontal, Store, ListChecks, Phone, ScrollText, BookMarked } from 'lucide-react';

interface AdminSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({ isOpen, onToggle }) => {
  const location = useLocation();

  const menuItems = [
    { title: 'Panel główny', icon: Home, link: '/admin', color: 'text-gray-300' },
    { title: 'Zarządzanie użytkownikami', icon: Users, link: '/admin/users', color: 'text-blue-400' },
    { title: 'Zarządzanie rejonami', icon: MapPin, link: '/admin/zones', color: 'text-green-400' },
    { title: 'Cennik kursów', icon: DollarSign, link: '/admin/pricing', color: 'text-orange-400' },
    { title: 'Reguły przydziału', icon: Settings, link: '/admin/rules', color: 'text-purple-400' },
    { title: 'Adresy', icon: Map, link: '/admin/map', color: 'text-teal-400' },
    { title: 'Preferencje', icon: ListChecks, link: '/admin/preferences', color: 'text-pink-400' },
    { title: 'Giełda', icon: Store, link: '/admin/gielda', color: 'text-amber-400' },
    { title: 'Statystyki i raporty', icon: BarChart, link: '/admin/reports', color: 'text-red-400' },
    { title: 'Ustawienia systemowe', icon: SlidersHorizontal, link: '/admin/settings', color: 'text-purple-400' },
    { title: 'Asterisk (VoIP/SIP)', icon: Phone, link: '/admin/asterisk', color: 'text-emerald-400' },
    { title: 'Baza adresów', icon: BookMarked, link: '/admin/local-addresses', color: 'text-blue-400' },
    { title: 'Logi systemowe', icon: ScrollText, link: '/admin/logs', color: 'text-indigo-400' },
  ];

  const isActive = (link: string) => {
    if (link === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(link);
  };

  return (
    <>
      <div
        className={`fixed left-0 top-0 h-screen w-80 bg-[#0a0a0a] border-r border-[#3d3d3d] transform transition-transform duration-300 z-40 overflow-y-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="pt-16 pb-6">
          <nav className="space-y-1.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.link);

              return (
                <Link
                  key={item.title}
                  to={item.link}
                  onClick={onToggle}
                  className={`flex items-center gap-4 px-6 py-4 transition-colors duration-150 ${
                    active
                      ? 'bg-[#1e1e1e] text-white border-y border-[#3d3d3d]'
                      : 'text-gray-300 hover:text-white hover:bg-[#1e1e1e] rounded-md mx-3 px-5'
                  }`}
                >
                  <Icon className={`w-7 h-7 shrink-0 ${active ? item.color : ''}`} />
                  <span className="font-medium text-base">{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
};

export default AdminSidebar;
