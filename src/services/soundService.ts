/**
 * SoundService — generuje dźwięki przez Web Audio API (bez plików mp3).
 */
class SoundService {
  private ctx: AudioContext | null = null;
  private disconnectLoopInterval: ReturnType<typeof setInterval> | null = null;

  private getCtx(): AudioContext | null {
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(
    freq: number,
    startAt: number,
    duration: number,
    volume = 0.4,
    type: OscillatorType = 'sine',
  ) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);
    gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);
    osc.start(ctx.currentTime + startAt);
    osc.stop(ctx.currentTime + startAt + duration + 0.05);
  }

  /** Logowanie — przyjemna rosnąca melodia powitalna */
  login() {
    this.tone(523, 0,    0.12, 0.35); // C5
    this.tone(659, 0.13, 0.12, 0.35); // E5
    this.tone(784, 0.26, 0.12, 0.35); // G5
    this.tone(1047,0.39, 0.22, 0.40); // C6
  }

  /** Wylogowanie — łagodnie opadający sygnał pożegnalny */
  logout() {
    this.tone(520, 0,    0.25, 0.38);
    this.tone(380, 0.22, 0.30, 0.38);
    this.tone(260, 0.48, 0.40, 0.32);
  }

  /** Nowa wiadomość — dwa krótkie piknięcia w górę */
  newMessage() {
    this.tone(880, 0,    0.12);
    this.tone(1100, 0.15, 0.14);
  }

  /** Zmiana pozycji w kolejce — dwa szybkie kliknięcia */
  queuePositionChange() {
    this.tone(660, 0,    0.08, 0.35, 'square');
    this.tone(660, 0.12, 0.08, 0.35, 'square');
  }

  /** Jeden impuls alarmu rozłączenia */
  private disconnectedPulse() {
    this.tone(1200, 0,    0.10, 0.55, 'square');
    this.tone(1200, 0.15, 0.10, 0.55, 'square');
    this.tone(1200, 0.30, 0.18, 0.55, 'square');
  }

  /** Rozłączenie — start pętli alarmu co 2.5s */
  startDisconnectedLoop() {
    if (this.disconnectLoopInterval !== null) return; // już gra
    this.disconnectedPulse();
    this.disconnectLoopInterval = setInterval(() => this.disconnectedPulse(), 2500);
  }

  /** Rozłączenie — zatrzymaj pętlę alarmu */
  stopDisconnectedLoop() {
    if (this.disconnectLoopInterval !== null) {
      clearInterval(this.disconnectLoopInterval);
      this.disconnectLoopInterval = null;
    }
  }

  /** Nowe zlecenie na giełdzie — głośny czterodźwięk rosnący */
  newGieldaOrder() {
    this.tone(440, 0,    0.13, 0.50); // A4
    this.tone(554, 0.15, 0.13, 0.50); // C#5
    this.tone(659, 0.30, 0.13, 0.50); // E5
    this.tone(880, 0.45, 0.25, 0.55); // A5
  }

  /** Alert dyspozytora (anulowanie / mina) — trzy ostrzegawcze impulsy opadające */
  dispatcherAlert() {
    // Pierwsza seria: trzy szybkie opadające sygnały
    this.tone(1050, 0.00, 0.14, 0.60, 'sawtooth');
    this.tone(800,  0.16, 0.14, 0.60, 'sawtooth');
    this.tone(580,  0.32, 0.18, 0.60, 'sawtooth');
    // Krótka przerwa, potem powtórzenie — żeby było słyszalne
    this.tone(1050, 0.60, 0.14, 0.55, 'sawtooth');
    this.tone(800,  0.76, 0.14, 0.55, 'sawtooth');
    this.tone(580,  0.92, 0.20, 0.55, 'sawtooth');
  }
}

export const soundService = new SoundService();
