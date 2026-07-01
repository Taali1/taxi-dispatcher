import React, { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { LogOut, User, ChevronDown, Sun, Moon } from 'lucide-react';
import { useState } from 'react';

interface Tab {
  id: string;
  label: string;
  hasNotification?: boolean;
}

interface LayoutProps {
  children: ReactNode;
  title: string;
  headerActions?: ReactNode;
  hideTitle?: boolean;
  hideUserInfo?: boolean;
  noPadding?: boolean;
  tabs?: Tab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  headerStyle?: React.CSSProperties;
  /** Wymusza ciemny motyw niezależnie od globalnego ustawienia (np. panel admina) */
  forceLight?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, title, headerActions, hideTitle, hideUserInfo, noPadding, tabs, activeTab, onTabChange, headerStyle, forceLight = false }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const hasTabs = tabs && tabs.length > 0;

  // Kolory zależne od trybu
  const clr = forceLight
    ? {
        outerBg:  'bg-[#0f0f0f]',
        headerBg: 'bg-[#141414]',
        headerBdr:'border-[#6a6a6a]',
        btnText:  'text-gray-300 hover:text-white',
        btnHover: 'hover:bg-[#383838]',
        userName: 'text-white',
        userRole: 'text-gray-500',
        dropdownBg: 'bg-[#272727] border-[#333333]',
        dropdownItem: 'text-gray-300 hover:text-white hover:bg-[#383838] border-[#6a6a6a]',
      }
    : {
        outerBg:  'bg-[#202020]',
        headerBg: 'bg-[#272727]',
        headerBdr:'border-[#6a6a6a]',
        btnText:  'text-gray-200 hover:text-white',
        btnHover: 'hover:bg-[#383838]',
        userName: 'text-white',
        userRole: 'text-gray-400',
        dropdownBg: 'bg-[#2d2d2d] border-[#6a6a6a]',
        dropdownItem: 'text-gray-200 hover:text-white hover:bg-[#383838] border-[#6a6a6a]',
      };

  // Otwiera wewnętrzną stronę mapy aplikacji
  const handleOpenMap = () => {
    setIsDropdownOpen(false);
    window.open('/map', '_blank', 'width=1200,height=800');
  };

  return (
    <div className={`h-screen overflow-hidden flex flex-col ${clr.outerBg}`}>
      <header className={`shrink-0 ${headerStyle ? '' : clr.headerBg} ${hasTabs ? 'hidden' : `border-b ${clr.headerBdr}`}`} style={headerStyle}>
        {!hasTabs && (
          <div className="px-6 py-2 flex justify-between items-center">
            <div className="flex items-center space-x-4">
              {!hideTitle && <h1 className="text-2xl font-bold text-gray-900">{title}</h1>}
              {headerActions}
            </div>

            {!hideUserInfo && <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`flex items-center space-x-2 ${clr.btnText} transition-colors duration-200 px-3 py-2 rounded-lg ${clr.btnHover}`}
              >
                <User className="w-5 h-5" />
                <span className={`text-sm ${clr.userName}`}>{user?.name}</span>
                <span className={`text-sm ${clr.userRole}`}>({user?.role})</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className={`absolute right-0 mt-2 w-48 border rounded-lg shadow-lg z-50 ${clr.dropdownBg}`}>
                  <div className="py-1">
                    <button
                      onClick={handleOpenMap}
                      className={`w-full flex items-center space-x-2 px-4 py-2 transition-colors duration-200 border-b ${clr.dropdownItem}`}
                    >
                      <span className="text-sm">Otworz mape</span>
                    </button>
                    <button
                      onClick={() => {
                        toggleTheme();
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full flex items-center space-x-2 px-4 py-2 transition-colors duration-200 border-b ${clr.dropdownItem}`}
                    >
                      {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                      <span className="text-sm">{theme === 'light' ? 'Motyw ciemny' : 'Motyw jasny'}</span>
                    </button>
                    <button
                      onClick={() => {
                        logout();
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full flex items-center space-x-2 px-4 py-2 transition-colors duration-200 ${clr.dropdownItem}`}
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="text-sm">Wyloguj</span>
                    </button>
                  </div>
                </div>
              )}
            </div>}
          </div>
        )}

      </header>

      <main className={`flex-1 min-h-0 flex flex-col ${noPadding ? 'overflow-hidden' : 'overflow-auto'}`}>
        <div className={`flex-1 min-h-0 ${noPadding ? 'overflow-hidden' : 'overflow-auto px-3 pb-3 pt-3'}`}>
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
