/**
 * Audio Feedback System for Voice Control
 * Uses Web Audio API for tone generation and SpeechSynthesis for TTS
 */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * Play a tone with given frequency and duration
 */
function playTone(frequency, duration, type = 'sine', volume = 0.3) {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    // Silently fail if audio context is not available
  }
}

/**
 * Short ascending beep - wake word detected
 */
export function playWakeTone() {
  playTone(587, 0.1, 'sine', 0.2);
  setTimeout(() => playTone(784, 0.15, 'sine', 0.2), 100);
  setTimeout(() => playTone(988, 0.2, 'sine', 0.15), 200);
}

/**
 * Confirmation tone - command recognized
 */
export function playConfirmTone() {
  playTone(880, 0.08, 'sine', 0.15);
  setTimeout(() => playTone(1100, 0.12, 'sine', 0.12), 80);
}

/**
 * Error tone - command not understood
 */
export function playErrorTone() {
  playTone(400, 0.15, 'square', 0.1);
  setTimeout(() => playTone(300, 0.2, 'square', 0.08), 150);
}

/**
 * Success tone - action completed
 */
export function playSuccessTone() {
  playTone(523, 0.1, 'sine', 0.15);
  setTimeout(() => playTone(659, 0.1, 'sine', 0.15), 100);
  setTimeout(() => playTone(784, 0.15, 'sine', 0.12), 200);
}

/**
 * Listening tone - started listening for command
 */
export function playListeningTone() {
  playTone(660, 0.12, 'sine', 0.1);
}

/**
 * Stop tone - voice control disabled
 */
export function playStopTone() {
  playTone(784, 0.1, 'sine', 0.12);
  setTimeout(() => playTone(523, 0.15, 'sine', 0.1), 100);
}

/**
 * Speak text using SpeechSynthesis API
 */
export function speak(text, options = {}) {
  if (!('speechSynthesis' in window)) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate || 1.0;
  utterance.pitch = options.pitch || 1.0;
  utterance.volume = options.volume || 0.7;
  utterance.lang = options.lang || 'en-US';

  if (options.onEnd) {
    utterance.onend = options.onEnd;
  }

  window.speechSynthesis.speak(utterance);
}

/**
 * Stop any ongoing speech
 */
export function stopSpeaking() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Check if speech synthesis is available
 */
export function isTTSAvailable() {
  return 'speechSynthesis' in window;
}

/**
 * Check if speech recognition is available
 */
export function isSpeechRecognitionAvailable() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export default {
  playWakeTone,
  playConfirmTone,
  playErrorTone,
  playSuccessTone,
  playListeningTone,
  playStopTone,
  speak,
  stopSpeaking,
  isTTSAvailable,
  isSpeechRecognitionAvailable,
};
