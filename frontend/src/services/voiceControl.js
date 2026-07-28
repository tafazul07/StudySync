/**
 * Voice Control Service
 * Core speech recognition engine with wake word detection and command dispatching
 */

import { parseCommand, resolveModule } from './voiceCommands.js';
import {
  playWakeTone,
  playConfirmTone,
  playErrorTone,
  playSuccessTone,
  playStopTone,
  speak,
} from './audioFeedback.js';

// Voice control states
export const VOICE_STATES = {
  IDLE: 'idle',               // Not listening (disabled)
  WAKE_LISTENING: 'wake',     // Listening for wake word
  COMMAND_LISTENING: 'command', // Listening for a command (after wake word)
  PROCESSING: 'processing',   // Processing a recognized command
  ERROR: 'error',             // Error state
};

// Wake word configuration
const WAKE_WORDS = [
  'hey study sync',
  'hey studysync',
  'study sync',
  'ok study sync',
];

class VoiceControlService {
  constructor() {
    this.recognition = null;
    this.state = VOICE_STATES.IDLE;
    this.enabled = false;
    this.commandHistory = [];
    this.listeners = new Set();
    this.actionHandlers = new Map();
    this.lastTranscript = '';
    this.restartTimeout = null;
    this.commandTimeout = null;
    this.ttsEnabled = true;
    this.soundEnabled = true;

    this._initRecognition();
  }

  /**
   * Initialize the SpeechRecognition instance
   */
  _initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 3;

    this.recognition.onresult = this._handleResult.bind(this);
    this.recognition.onerror = this._handleError.bind(this);
    this.recognition.onend = this._handleEnd.bind(this);
    this.recognition.onstart = this._handleStart.bind(this);
  }

  /**
   * Handle speech recognition results
   */
  _handleResult(event) {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript + ' ';
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    // Notify listeners of interim results (for live display)
    if (interimTranscript) {
      this._notify({ type: 'interim', transcript: interimTranscript });
    }

    // Process final results
    if (finalTranscript) {
      this.lastTranscript = finalTranscript.trim();
      this._processTranscript(this.lastTranscript);
    }
  }

  /**
   * Process a finalized transcript
   */
  _processTranscript(transcript) {
    const lower = transcript.toLowerCase().trim();

    if (this.state === VOICE_STATES.WAKE_LISTENING) {
      // Check for wake word
      const wakeDetected = WAKE_WORDS.some(wake => lower.includes(wake));
      if (wakeDetected) {
        this._onWakeWordDetected();
        return;
      }

      // Also check if the entire transcript is a direct command (no wake word needed)
      // This allows "go to dashboard" without saying "hey studysync" first
      const directCommand = parseCommand(transcript);
      if (directCommand && directCommand.type !== 'dictate') {
        this._onWakeWordDetected();
        this._executeCommand(directCommand);
        return;
      }
    }

    if (this.state === VOICE_STATES.COMMAND_LISTENING) {
      this._setState(VOICE_STATES.PROCESSING);
      const command = parseCommand(transcript);

      if (command) {
        this._executeCommand(command);
      } else {
        this._onCommandFailed(transcript);
      }
    }
  }

  /**
   * Wake word detected - switch to command listening
   */
  _onWakeWordDetected() {
    if (this.soundEnabled) playWakeTone();
    this._setState(VOICE_STATES.COMMAND_LISTENING);
    this._notify({ type: 'wake_detected' });

    if (this.ttsEnabled) {
      speak('Yes?', { volume: 0.5 });
    }

    // Auto-timeout after 8 seconds if no command received
    clearTimeout(this.commandTimeout);
    this.commandTimeout = setTimeout(() => {
      if (this.state === VOICE_STATES.COMMAND_LISTENING) {
        this._setState(VOICE_STATES.WAKE_LISTENING);
        this._notify({ type: 'timeout' });
      }
    }, 8000);
  }

  /**
   * Execute a parsed command
   */
  _executeCommand(command) {
    clearTimeout(this.commandTimeout);

    // Add to history
    this.commandHistory.unshift({
      ...command,
      timestamp: Date.now(),
    });
    // Keep only last 50 commands
    if (this.commandHistory.length > 50) {
      this.commandHistory = this.commandHistory.slice(0, 50);
    }

    this._notify({ type: 'command', command });

    // Handle built-in commands
    switch (command.type) {
      case 'navigate': {
        const route = resolveModule(command.target);
        if (route) {
          this._dispatchAction('navigate', { route });
          if (this.soundEnabled) playSuccessTone();
          if (this.ttsEnabled) speak(`Going to ${command.target}`, { volume: 0.5 });
        } else {
          this._onCommandFailed(command.raw);
          return;
        }
        break;
      }

      case 'upload': {
        const targetRoute = resolveModule(command.target);
        this._dispatchAction('upload', {
          filename: command.filename,
          targetRoute: targetRoute,
          targetName: command.target,
        });
        if (this.soundEnabled) playConfirmTone();
        break;
      }

      case 'generate_quiz':
        this._dispatchAction('generate_quiz', { topic: command.topic });
        if (this.soundEnabled) playConfirmTone();
        if (this.ttsEnabled) speak(`Generating quiz about ${command.topic}`, { volume: 0.5 });
        break;

      case 'create_plan':
        this._dispatchAction('create_plan', { subject: command.subject });
        if (this.soundEnabled) playConfirmTone();
        break;

      case 'show_deadlines':
        this._dispatchAction('show_deadlines', {});
        if (this.soundEnabled) playConfirmTone();
        break;

      case 'new_document':
        this._dispatchAction('new_document', {});
        if (this.soundEnabled) playConfirmTone();
        break;

      case 'new_chat':
        this._dispatchAction('new_chat', {});
        if (this.soundEnabled) playConfirmTone();
        break;

      case 'ask_ai':
        this._dispatchAction('ask_ai', { question: command.question });
        if (this.soundEnabled) playConfirmTone();
        break;

      case 'create_vault':
        this._dispatchAction('create_vault', { name: command.name });
        if (this.soundEnabled) playConfirmTone();
        break;

      case 'help':
        this._dispatchAction('help', {});
        if (this.soundEnabled) playConfirmTone();
        break;

      case 'stop_listening':
        this.disable();
        if (this.soundEnabled) playStopTone();
        if (this.ttsEnabled) speak('Voice control disabled', { volume: 0.5 });
        return;

      case 'start_listening':
        // Already enabled if we got here
        if (this.soundEnabled) playConfirmTone();
        if (this.ttsEnabled) speak('Voice control active', { volume: 0.5 });
        break;

      case 'dictate':
        this._dispatchAction('dictate', { text: command.text });
        if (this.soundEnabled) playConfirmTone();
        break;

      default:
        // Try to dispatch to registered handlers
        const handled = this._dispatchAction(command.type, command);
        if (!handled) {
          this._onCommandFailed(command.raw);
          return;
        }
        if (this.soundEnabled) playSuccessTone();
    }

    // Return to wake listening after command
    setTimeout(() => {
      this._setState(VOICE_STATES.WAKE_LISTENING);
    }, 1500);
  }

  /**
   * Handle command that couldn't be parsed
   */
  _onCommandFailed(transcript) {
    if (this.soundEnabled) playErrorTone();
    this._setState(VOICE_STATES.ERROR);
    this._notify({ type: 'error', transcript });

    if (this.ttsEnabled) {
      speak("I didn't understand that. Say help for commands.", { volume: 0.5 });
    }

    setTimeout(() => {
      this._setState(VOICE_STATES.WAKE_LISTENING);
    }, 2000);
  }

  /**
   * Handle speech recognition errors
   */
  _handleError(event) {
    // Don't treat 'no-speech' or 'aborted' as errors
    if (event.error === 'no-speech' || event.error === 'aborted') {
      return;
    }

    console.warn('Speech recognition error:', event.error);
    this._notify({ type: 'error', error: event.error });

    // Auto-restart on recoverable errors
    if (this.enabled && this.state !== VOICE_STATES.IDLE) {
      this._restartRecognition();
    }
  }

  /**
   * Handle recognition end event
   */
  _handleEnd() {
    // Auto-restart if still enabled
    if (this.enabled && this.state !== VOICE_STATES.IDLE) {
      this._restartRecognition();
    }
  }

  /**
   * Handle recognition start event
   */
  _handleStart() {
    this._notify({ type: 'started' });
  }

  /**
   * Restart recognition after a short delay
   */
  _restartRecognition() {
    clearTimeout(this.restartTimeout);
    this.restartTimeout = setTimeout(() => {
      if (this.enabled && this.recognition) {
        try {
          this.recognition.start();
        } catch (e) {
          // Already started, ignore
        }
      }
    }, 300);
  }

  /**
   * Set state and notify listeners
   */
  _setState(newState) {
    this.state = newState;
    this._notify({ type: 'state_change', state: newState });
  }

  /**
   * Notify all listeners
   */
  _notify(event) {
    this.listeners.forEach(fn => {
      try { fn(event); } catch (e) {}
    });
  }

  /**
   * Dispatch action to registered handlers
   */
  _dispatchAction(action, data) {
    let handled = false;
    this.actionHandlers.forEach((handler, key) => {
      try {
        const result = handler(action, data);
        if (result) handled = true;
      } catch (e) {}
    });
    return handled;
  }

  // === Public API ===

  /**
   * Enable voice control and start listening for wake word
   */
  async enable() {
    if (!this.recognition) {
      this._notify({ type: 'error', error: 'not_supported' });
      return false;
    }

    try {
      this.enabled = true;
      this._setState(VOICE_STATES.WAKE_LISTENING);
      this.recognition.start();
      this._notify({ type: 'enabled' });
      return true;
    } catch (e) {
      // Already started
      this.enabled = true;
      this._setState(VOICE_STATES.WAKE_LISTENING);
      return true;
    }
  }

  /**
   * Disable voice control completely
   */
  disable() {
    this.enabled = false;
    clearTimeout(this.restartTimeout);
    clearTimeout(this.commandTimeout);

    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }

    this._setState(VOICE_STATES.IDLE);
    this._notify({ type: 'disabled' });
  }

  /**
   * Toggle voice control on/off
   */
  async toggle() {
    if (this.enabled) {
      this.disable();
    } else {
      await this.enable();
    }
    return this.enabled;
  }

  /**
   * Register an action handler
   * @param {string} key - Unique key for the handler
   * @param {function} handler - Function(action, data) => boolean
   */
  registerHandler(key, handler) {
    this.actionHandlers.set(key, handler);
  }

  /**
   * Unregister an action handler
   */
  unregisterHandler(key) {
    this.actionHandlers.delete(key);
  }

  /**
   * Subscribe to voice control events
   * @param {function} listener - Event listener function
   * @returns {function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Check if enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get command history
   */
  getHistory() {
    return [...this.commandHistory];
  }

  /**
   * Clear command history
   */
  clearHistory() {
    this.commandHistory = [];
  }

  /**
   * Set TTS enabled
   */
  setTTSEnabled(enabled) {
    this.ttsEnabled = enabled;
  }

  /**
   * Set sound effects enabled
   */
  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
  }

  /**
   * Get last recognized transcript
   */
  getLastTranscript() {
    return this.lastTranscript;
  }
}

// Singleton instance
const voiceControl = new VoiceControlService();

export default voiceControl;
