// Web Audio API synthesized audio alerts for barcode scanner & dispatch actions
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Pleasant double-chime for verified book dispatch
 */
export function playSuccessChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = 'sine';
  osc2.type = 'triangle';

  // Pitch progression: E5 (659Hz) -> A5 (880Hz)
  osc1.frequency.setValueAtTime(659.25, now);
  osc1.frequency.setValueAtTime(880, now + 0.08);

  osc2.frequency.setValueAtTime(1318.5, now + 0.08);

  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now + 0.08);
  osc1.stop(now + 0.3);
  osc2.stop(now + 0.3);
}

/**
 * Low warning buzz for mismatched or already dispatched code
 */
export function playErrorTone() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.linearRampToValueAtTime(160, now + 0.25);

  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.25);
}

/**
 * Celebratory 4-note fanfare when all books for an order are finished
 */
export function playOrderCompleteFanfare() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const noteStart = now + idx * 0.1;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, noteStart);

    gain.gain.setValueAtTime(0.25, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(noteStart);
    osc.stop(noteStart + 0.4);
  });
}

// Persistent array holding active utterances to prevent Chromium garbage collection bug
const activeSpeechUtterances: SpeechSynthesisUtterance[] = [];

// Cache voices once loaded
let cachedVoices: SpeechSynthesisVoice[] = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

function getBestVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.includes('IN') && (v.name.includes('India') || v.name.includes('English'))) ||
    voices.find((v) => v.lang.includes('en-IN')) ||
    voices.find((v) => v.lang.includes('en-GB')) ||
    voices.find((v) => v.lang.includes('en-US')) ||
    voices[0]
  );
}

/**
 * Ensures browser speech synthesis engine is unlocked and active
 */
function wakeSpeechSynthesis() {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }
  } catch {}
}

/**
 * Speaks a clear human voice announcement (Paytm Soundbox style)
 * e.g., "Done! Next order."
 */
export function speakVoiceAnnouncement(text: string, onEnd?: () => void) {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      wakeSpeechSynthesis();
      activeSpeechUtterances.length = 0;

      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        const preferredVoice = getBestVoice();
        if (preferredVoice) {
          utterance.voice = preferredVoice;
          utterance.lang = preferredVoice.lang;
        } else {
          utterance.lang = 'en-US';
        }

        activeSpeechUtterances.push(utterance);

        utterance.onend = () => {
          const idx = activeSpeechUtterances.indexOf(utterance);
          if (idx !== -1) activeSpeechUtterances.splice(idx, 1);
          onEnd?.();
        };

        utterance.onerror = () => {
          const idx = activeSpeechUtterances.indexOf(utterance);
          if (idx !== -1) activeSpeechUtterances.splice(idx, 1);
          wakeSpeechSynthesis();
          onEnd?.();
        };

        wakeSpeechSynthesis();
        window.speechSynthesis.speak(utterance);
        wakeSpeechSynthesis();
      }, 60);
    } else {
      onEnd?.();
    }
  } catch (e) {
    console.error('Speech synthesis error:', e);
    onEnd?.();
  }
}

/**
 * Speaks an announcement exactly 2 times with a natural pause in between,
 * and executes onAllDone ONLY after the 2nd time has completely finished speaking!
 */
export function speakVoiceTwice(
  text: string,
  onAllDone?: () => void,
  pauseMs: number = 700
) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onAllDone?.();
      return;
    }

    try {
      window.speechSynthesis.cancel();
    } catch {}
    wakeSpeechSynthesis();
    activeSpeechUtterances.length = 0;

    const preferredVoice = getBestVoice();

    let hasCompleted = false;
    const triggerComplete = () => {
      if (!hasCompleted) {
        hasCompleted = true;
        onAllDone?.();
      }
    };

    const speakIteration = (isSecond: boolean) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95; // Clear natural pacing so words are crisp
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      if (preferredVoice) {
        utterance.voice = preferredVoice;
        utterance.lang = preferredVoice.lang;
      } else {
        utterance.lang = 'en-US';
      }

      activeSpeechUtterances.push(utterance);

      utterance.onend = () => {
        const idx = activeSpeechUtterances.indexOf(utterance);
        if (idx !== -1) activeSpeechUtterances.splice(idx, 1);

        if (!isSecond) {
          // Pause between 1st and 2nd announcement
          setTimeout(() => {
            speakIteration(true);
          }, pauseMs);
        } else {
          // 2nd announcement finished speaking completely!
          setTimeout(() => {
            triggerComplete();
          }, 800);
        }
      };

      utterance.onerror = (e) => {
        console.warn('Speech synthesis error in iteration:', e);
        const idx = activeSpeechUtterances.indexOf(utterance);
        if (idx !== -1) activeSpeechUtterances.splice(idx, 1);
        wakeSpeechSynthesis();

        if (!isSecond) {
          setTimeout(() => speakIteration(true), pauseMs);
        } else {
          triggerComplete();
        }
      };

      wakeSpeechSynthesis();
      window.speechSynthesis.speak(utterance);
      wakeSpeechSynthesis();
    };

    setTimeout(() => {
      speakIteration(false);
    }, 100);
  } catch (e) {
    console.error('Speech synthesis error in speakVoiceTwice:', e);
    onAllDone?.();
  }
}

/**
 * Speaks an error alert message clearly, stripping emoji characters
 */
export function speakErrorMessage(rawMessage: string) {
  try {
    let clean = (rawMessage || '')
      .replace(/[❌⚠️❗🚫]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) {
      clean = 'Wrong barcode scanned. Please verify.';
    } else {
      const lower = clean.toLowerCase();
      if (!lower.startsWith('warning') && !lower.startsWith('wrong') && !lower.startsWith('error')) {
        clean = `Warning! ${clean}`;
      }
    }

    speakVoiceAnnouncement(clean);
  } catch (e) {
    console.error('Error speaking error message:', e);
  }
}
