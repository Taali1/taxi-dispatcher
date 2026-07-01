import { useCallback, useRef } from 'react';

export const useNotificationSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playNotificationSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;

      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const oscillator1 = ctx.createOscillator();
      const oscillator2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator1.type = 'sine';
      oscillator2.type = 'sine';

      const now = ctx.currentTime;

      oscillator1.frequency.setValueAtTime(880, now);
      oscillator1.frequency.setValueAtTime(1100, now + 0.1);

      oscillator2.frequency.setValueAtTime(660, now);
      oscillator2.frequency.setValueAtTime(880, now + 0.1);

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.02);
      gainNode.gain.linearRampToValueAtTime(0.2, now + 0.1);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.12);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.25);

      oscillator1.start(now);
      oscillator2.start(now);
      oscillator1.stop(now + 0.25);
      oscillator2.stop(now + 0.25);

      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }, []);

  return { playNotificationSound };
};
