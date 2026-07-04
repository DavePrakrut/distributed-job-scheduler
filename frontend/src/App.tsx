import { useState, useEffect } from 'react';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { ApiClient } from './services/api';

type AuthPage = 'login' | 'register' | 'dashboard';

function App() {
  const [page, setPage] = useState<AuthPage>('login');
  const [user, setUser] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);

  // Check login status on startup
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const storedOrg = localStorage.getItem('organization');
    const token = localStorage.getItem('accessToken');

    if (token && storedUser && storedOrg) {
      setUser(JSON.parse(storedUser));
      setOrg(JSON.parse(storedOrg));
      setPage('dashboard');
    } else {
      setPage('login');
    }
  }, []);

  const handleAuthSuccess = (authUser: any, authOrg: any) => {
    setUser(authUser);
    setOrg(authOrg);
    setPage('dashboard');
  };

  const handleLogout = () => {
    ApiClient.clearTokens();
    setUser(null);
    setOrg(null);
    setPage('login');
  };

  if (page === 'login') {
    return (
      <Login onLoginSuccess={handleAuthSuccess} onNavigateToRegister={() => setPage('register')} />
    );
  }

  if (page === 'register') {
    return (
      <Register onRegisterSuccess={handleAuthSuccess} onNavigateToLogin={() => setPage('login')} />
    );
  }

  if (page === 'dashboard' && user && org) {
    return <Dashboard user={user} org={org} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-cyber-dark flex items-center justify-center text-gray-500">
      Loading...
    </div>
  );
}

export default App;
