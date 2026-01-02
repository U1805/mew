import { useUIStore } from '../stores/uiStore';

// 单例模式，避免重复创建 AudioContext
let audioContext: AudioContext | null = null;

export const playMessageSound = async (volume: number = 0.5) => {
  try {
    // 兼容性处理
    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;

    if (!audioContext) audioContext = new AudioContextCtor();
    
    // 浏览器策略：如果 AudioContext 被挂起（通常是因为没有用户交互），则恢复它
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    // --- 声音合成配置 (仿 Discord) ---
    
    // 1. 波形：正弦波最接近 Discord 那种圆润的数字音效
    osc.type = 'sine';

    // 2. 频率包络 (Pitch Envelope): 模拟 "Bloop" 的上扬感
    // 从约 800Hz 快速滑向 1600Hz-2000Hz (一个八度以上的跳跃)
    osc.frequency.setValueAtTime(880, now); 
    // 在 0.08秒内指数滑升到 1800Hz，制造清脆的 "提" 声
    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.08);

    // 3. 音量包络 (Volume Envelope/ADSR): 快速起音，快速衰减
    const v = Math.max(0, Math.min(1, volume)); // 限制音量 0-1
    
    // 防止爆音，从 0 开始
    gain.gain.setValueAtTime(0, now);
    // Attack (起音): 极快达到峰值 (0.01s)
    gain.gain.linearRampToValueAtTime(0.4 * v, now + 0.01);
    // Decay (衰减): 快速回落，模拟敲击感 (到 0.1s 处)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    // Release (释放): 彻底静音
    gain.gain.linearRampToValueAtTime(0, now + 0.2);

    // --- 连接节点 ---
    osc.connect(gain);
    gain.connect(audioContext.destination);

    // --- 播放 ---
    osc.start(now);
    // 稍微多留一点时间防止尾音被切断
    osc.stop(now + 0.25);

  } catch (e) {
    // 忽略错误：通常是浏览器阻止自动播放，或者页面未获得焦点
    console.debug('Failed to play message sound', e);
  }
};

export const requestDesktopNotificationPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (typeof window === 'undefined' || !(window as any).Notification) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return Notification.permission;
  return Notification.requestPermission();
};

export const showDesktopNotification = (input: {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  data?: any;
}) => {
  if (typeof window === 'undefined' || !(window as any).Notification) return;
  if (Notification.permission !== 'granted') return;

  // 使用 try-catch 包裹 Notification 实例化，防止移动端或特殊环境报错
  try {
    const n = new Notification(input.title, {
      body: input.body,
      icon: input.icon, // 建议传入 Discord 风格的 logo url
      tag: input.tag,
      data: input.data,
      silent: true, // 重要：禁用系统默认提示音，因为我们已经播放了合成声音
    });

    n.onclick = () => {
      try {
        window.focus();
        const { serverId, channelId } = (n as any).data || {};
        if (channelId) {
          if (serverId) useUIStore.getState().setCurrentServer(serverId);
          useUIStore.getState().setCurrentChannel(channelId);
        }
      } catch (e) {
        console.error('Notification click handler error:', e);
      } finally {
        n.close();
      }
    };
  } catch (e) {
    console.error('Failed to create notification:', e);
  }
};
