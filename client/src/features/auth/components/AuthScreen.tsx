import { useEffect, useMemo, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { Icon } from '@iconify/react';
import { authApi } from '../../../shared/services/api';
import { useAuthStore } from '../../../shared/stores/authStore';
import { getApiErrorMessage } from '../../../shared/utils/apiError';
import { parseAuthPathname, navigateAuth } from '../../../shared/router/authRoute';
import { addNavigationListener } from '../../../shared/router/history';
import { getBrowserLocale, translateWithLocale } from '../../../shared/i18n';

export const AuthScreen = () => {
  const browserLocale = useMemo(() => getBrowserLocale(), []);
  const t = (key: string) => translateWithLocale(browserLocale, key);
  const [isLogin, setIsLogin] = useState(true);
  const [allowRegistration, setAllowRegistration] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const setUser = useAuthStore((state) => state.setUser);
  const hydrate = useAuthStore((state) => state.hydrate);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    const syncFromPath = () => {
      const mode = parseAuthPathname(window.location.pathname);
      if (mode === 'register') setIsLogin(false);
      if (mode === 'login') setIsLogin(true);
    };

    syncFromPath();
    return addNavigationListener(syncFromPath);
  }, []);

  useEffect(() => {
    let mounted = true;

    authApi
      .getConfig()
      .then((res) => {
        if (!mounted) return;
        const raw = res.data?.allowUserRegistration;
        if (typeof raw === 'boolean') setAllowRegistration(raw);
        else setAllowRegistration(true);
      })
      .catch(() => {
        if (!mounted) return;
        setAllowRegistration(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (allowRegistration === false && !isLogin) {
      setIsLogin(true);
      navigateAuth('login', { replace: true });
    }
  }, [allowRegistration, isLogin]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    try {
      if (isLogin) {
        const res = await authApi.login({ email, password, rememberMe: rememberMe });
        const user = res.data.user ?? null;
        if (user) setUser(user);
        else await hydrate();
      } else {
        if (allowRegistration === false) {
          setIsLogin(true);
          navigateAuth('login', { replace: true });
          setError(t('auth.registrationDisabled'));
          return;
        }
        const res = await authApi.register({ email, username, password });
        const user = res.data.user ?? null;

        if (user) setUser(user);
        else await hydrate();
      }
    } catch (err: any) {
      const message = getApiErrorMessage(err, t('auth.genericError'));
      const status = err?.response?.status as number | undefined;

      if (!isLogin && status === 403) {
        setIsLogin(true);
        setError(message || t('auth.registrationDisabled'));
        return;
      }

      setError(message);
      if (isLogin) void logout();
    }
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-[url('https://picsum.photos/1920/1080?blur=5')] bg-cover">
      <div className="bg-[#313338] p-8 rounded shadow-2xl w-full max-w-md animate-fade-in-up">
        <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white mb-1">{t('auth.welcomeBack')}</h2>
            <p className="text-mew-textMuted">{t('auth.welcomeSubtitle')}</p>
        </div>
        
        {error && <div className="bg-red-500/10 border border-red-500 text-red-500 text-sm p-2 rounded mb-4">{error}</div>}
        {notice && <div className="bg-green-500/10 border border-green-500 text-green-500 text-sm p-2 rounded mb-4">{notice}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-mew-textMuted uppercase mb-1">{t('auth.username')}</label>
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
            <label htmlFor="email" className="block text-xs font-bold text-mew-textMuted uppercase mb-1">{t('auth.email')}</label>
            <input id="email"
              type="email"
              required
              className="w-full bg-[#1E1F22] border-none rounded p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-mew-accent transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-bold text-mew-textMuted uppercase mb-1">{t('auth.password')}</label>
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
                      <span className="text-xs text-mew-textMuted select-none group-hover:text-mew-text">{t('auth.rememberMe')}</span>
                  </div>
                  <div className="text-xs text-mew-accent hover:underline cursor-pointer">{t('auth.forgotPassword')}</div>
              </div>
          )}

          <button
            type="submit"
            className="w-full bg-mew-accent hover:bg-mew-accentHover text-white font-medium py-2.5 rounded transition-colors"
          >
            {isLogin ? t('auth.logIn') : t('auth.register')}
          </button>
        </form>

        <div className="mt-4 text-sm text-mew-textMuted flex gap-1">
          {allowRegistration ? (
            <>
              {isLogin ? t('auth.needAccount') : t('auth.alreadyHaveAccount')}
              <button
                type="button"
                onClick={() => {
                  const nextIsLogin = !isLogin;
                  setIsLogin(nextIsLogin);
                  navigateAuth(nextIsLogin ? 'login' : 'register');
                  setError('');
                  setNotice('');
                }}
                className="text-mew-accent hover:underline"
              >
                {isLogin ? t('auth.register') : t('auth.logInLink')}
              </button>
            </>
          ) : allowRegistration === false ? (
            <span></span>
          ) : (
            <span />
          )}
        </div>
      </div>
    </div>
  );
};

