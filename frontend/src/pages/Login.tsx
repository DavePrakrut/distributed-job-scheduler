import React, { useState } from 'react';
import { ApiClient } from '../services/api';
import { LogIn, Key, Mail, ShieldAlert } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: any, org: any) => void;
  onNavigateToRegister: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, onNavigateToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError(null);

    const response = await ApiClient.request<{
      accessToken: string;
      refreshToken: string;
      user: any;
      organization: any;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    setLoading(false);

    if (response.error) {
      setError(response.error);
    } else if (response.data) {
      const { accessToken, refreshToken, user, organization } = response.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('organization', JSON.stringify(organization));
      onLoginSuccess(user, organization);
    }
  };

  return (
    <div className="min-h-screen grid-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center p-3 bg-cyber-indigo/10 border border-cyber-indigo/25 rounded-2xl mb-4 neon-glow-indigo">
          <LogIn className="h-10 w-10 text-cyber-cyan animate-pulse-glow" />
        </div>
        <h2 className="font-display text-4xl font-extrabold tracking-tight text-white bg-gradient-to-r from-white via-gray-200 to-cyber-cyan bg-clip-text text-transparent">
          Welcome Back
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          Enter credentials to access the job scheduler console
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="glassmorphism py-8 px-4 shadow-2xl rounded-2xl sm:px-10 border border-white/5 mx-4 sm:mx-0">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-start space-x-3 text-sm animate-fade-in">
                <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-400"
              >
                Email Address
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 bg-cyber-dark/65 border border-cyber-border rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyber-cyan/50 focus:border-cyber-cyan transition duration-200"
                  placeholder="admin@organization.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-400"
              >
                Password
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Key className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 bg-cyber-dark/65 border border-cyber-border rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyber-cyan/50 focus:border-cyber-cyan transition duration-200"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-bold text-cyber-dark bg-gradient-to-r from-cyber-cyan to-cyber-blue hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-cyber-dark focus:ring-cyber-cyan cursor-pointer transition duration-200 disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={onNavigateToRegister}
              className="text-sm font-semibold text-cyber-cyan hover:text-cyber-cyan/85 transition duration-150 cursor-pointer"
            >
              Don't have an account? Register Organization
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
