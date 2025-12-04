import React, { useState } from 'react';
import clsx from 'clsx';
import { Icon } from '@iconify/react';
import { authApi } from '../../../shared/services/api';
import { useAuthStore } from '../../../shared/stores/store';

export const AuthScreen: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        // 1. Login to get Token
        const res = await authApi.login({ email, password });
        const token = res.data.token;
        
        // 2. Set temporary token to allow the next request to pass interceptor
        // Pass rememberMe preference
        setAuth(token, null, rememberMe); 

        // 3. Fetch full User Profile
        try {
            const userRes = await authApi.getMe();
            setAuth(token, userRes.data, rememberMe);
        } catch (userErr) {
            console.error("Failed to fetch user profile", userErr);
            // Fallback if getMe fails
            setAuth(token, { _id: 'temp', username: 'User', email, isBot: false, createdAt: new Date().toISOString() }, rememberMe);
        }
      } else {
        await authApi.register({ email, username, password });
        setIsLogin(true); // Switch to login
        setError('');
        alert('Registration successful! Please login.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'An error occurred');
      // If login failed, ensure auth is cleared
      setAuth('', null);
    }
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-[url('https://picsum.photos/1920/1080?blur=5')] bg-cover">
      <div className="bg-[#313338] p-8 rounded shadow-2xl w-full max-w-md animate-fade-in-up">
        <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white mb-1">Welcome back!</h2>
            <p className="text-mew-textMuted">We&rsquo;re so excited to see you again!</p>
        </div>
        
        {error && <div className="bg-red-500/10 border border-red-500 text-red-500 text-sm p-2 rounded mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-mew-textMuted uppercase mb-1">Username</label>
              <input
                type="text"
                required
                className="w-full bg-[#1E1F22] border-none rounded p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-mew-accent transition-all"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-mew-textMuted uppercase mb-1">Email</label>
            <input id="email"
              type="email"
              required
              className="w-full bg-[#1E1F22] border-none rounded p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-mew-accent transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-bold text-mew-textMuted uppercase mb-1">Password</label>
            <input id="password"
              type="password"
              required
              className="w-full bg-[#1E1F22] border-none rounded p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-mew-accent transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {isLogin && (
              <div className="flex items-center justify-between">
                  <div 
                    className="flex items-center cursor-pointer group"
                    onClick={() => setRememberMe(!rememberMe)}
                  >
                      <div className={clsx(
                          "w-5 h-5 rounded border flex items-center justify-center mr-2 transition-colors",
                          rememberMe ? "bg-mew-accent border-mew-accent" : "border-[#1E1F22] bg-[#1E1F22] group-hover:border-mew-textMuted"
                      )}>
                          {rememberMe && <Icon icon="mdi:check" className="text-white text-xs" />}
                      </div>
                      <span className="text-xs text-mew-textMuted select-none group-hover:text-mew-text">Remember Me</span>
                  </div>
                  <div className="text-xs text-mew-accent hover:underline cursor-pointer">Forgot your password?</div>
              </div>
          )}

          <button
            type="submit"
            className="w-full bg-mew-accent hover:bg-mew-accentHover text-white font-medium py-2.5 rounded transition-colors"
          >
            {isLogin ? 'Log In' : 'Register'}
          </button>
        </form>

        <div className="mt-4 text-sm text-mew-textMuted flex gap-1">
          {isLogin ? "Need an account?" : "Already have an account?"}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-mew-accent hover:underline"
          >
            {isLogin ? 'Register' : 'Log in'}
          </button>
        </div>
      </div>
    </div>
  );
};