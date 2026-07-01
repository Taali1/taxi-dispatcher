import React, { useState, useEffect } from 'react';
import { useAuth, UserRole } from '../contexts/AuthContext';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { Shield, Headphones, Calculator, Users, X, AlertTriangle } from 'lucide-react';

const LoginPageByRole: React.FC = () => {
  const { role } = useParams<{ role: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [displayedTitle, setDisplayedTitle] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [suspendedModal, setSuspendedModal] = useState<{ show: boolean; until: string }>({
    show: false,
    until: '',
  });

  const { login } = useAuth();
  const navigate = useNavigate();

  const roles = [
    { id: 'admin' as UserRole, name: 'Administrator', icon: Shield, color: 'bg-red-600' },
    { id: 'dispatcher' as UserRole, name: 'Dyspozytor', icon: Users, color: 'bg-blue-600' },
    { id: 'support' as UserRole, name: 'Wsparcie', icon: Headphones, color: 'bg-teal-600' },
    { id: 'accounting' as UserRole, name: 'Księgowość', icon: Calculator, color: 'bg-orange-600' },
  ];

  const validRole = role as UserRole;

  // Validate role
  if (!validRole || !['admin', 'dispatcher', 'support', 'accounting', 'driver'].includes(validRole)) {
    return <Navigate to="/" />;
  }

  const getRoleName = () => {
    switch (validRole) {
      case 'admin':
        return 'Administrator';
      case 'dispatcher':
        return 'Dyspozytor';
      case 'support':
        return 'Wsparcie';
      case 'accounting':
        return 'Księgowość';
      case 'driver':
        return 'Kierowca';
      default:
        return 'Dyspozytor';
    }
  };

  useEffect(() => {
    const targetText = getRoleName();
    setDisplayedTitle('');
    setIsTyping(true);

    let currentIndex = 0;
    const typingInterval = setInterval(() => {
      if (currentIndex <= targetText.length) {
        setDisplayedTitle(targetText.slice(0, currentIndex));
        currentIndex++;
      } else {
        setIsTyping(false);
        clearInterval(typingInterval);
      }
    }, 100);

    return () => clearInterval(typingInterval);
  }, [validRole]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const result = await login(email, password, validRole);

    if (result.success) {
      if (validRole === 'driver') {
        navigate('/driver-app');
      } else {
        navigate(`/${validRole}`);
      }
    } else if (result.error === 'suspended' && result.suspendedUntil) {
      setSuspendedModal({ show: true, until: result.suspendedUntil });
    } else {
      setError('Nieprawidłowe dane logowania');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="bg-[#f6f6f6] dark:bg-slate-800 rounded-2xl shadow-2xl w-full p-8 border border-gray-300 dark:border-slate-700">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-black dark:text-white mb-2 min-h-[2.5rem]">
              {displayedTitle}
              {isTyping && <span className="animate-pulse">|</span>}
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Login
              </label>
              <div className="flex">
                <div className="bg-gray-200 dark:bg-slate-600 border border-r-0 border-gray-300 dark:border-slate-600 rounded-l-lg px-3 py-2 flex items-center">
                  <Users className="w-4 h-4 text-black dark:text-slate-300" />
                </div>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-r-lg text-black dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Wprowadz login lub email"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Hasło
              </label>
              <div className="flex">
                <div className="bg-gray-200 dark:bg-slate-600 border border-r-0 border-gray-300 dark:border-slate-600 rounded-l-lg px-3 py-2 flex items-center">
                  <Shield className="w-4 h-4 text-black dark:text-slate-300" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-r-lg text-black dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Wprowadź hasło"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-medium py-3 rounded-lg transition-colors duration-200"
            >
              {isLoading ? 'Logowanie...' : 'Zaloguj się'}
            </button>
          </form>

          {/* Home Link */}
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/')}
              className="text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 transition"
            >
              ← Wróć na stronę główną
            </button>
          </div>
        </div>
      </div>

      {/* Suspended Account Modal */}
      {suspendedModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-red-500 max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-red-600 rounded-full p-2">
                    <AlertTriangle className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Konto Zawieszone</h3>
                </div>
                <button
                  onClick={() => setSuspendedModal({ show: false, until: '' })}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-slate-300">
                  Twoje konto zostało zawieszone przez administratora.
                </p>

                <div className="bg-red-900/30 border border-red-600 rounded-lg p-4">
                  <p className="text-red-200 font-medium">Zawieszone do:</p>
                  <p className="text-red-100 text-lg font-bold mt-1">
                    {suspendedModal.until ? new Date(suspendedModal.until).toLocaleDateString('pl-PL', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : 'Nieokreślony'}
                  </p>
                </div>

                <p className="text-slate-400 text-sm">
                  Skontaktuj się z administratorem w celu uzyskania dodatkowych informacji.
                </p>

                <button
                  onClick={() => setSuspendedModal({ show: false, until: '' })}
                  className="w-full bg-slate-600 hover:bg-slate-700 text-white font-medium py-3 rounded-lg transition-colors duration-200"
                >
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPageByRole;
