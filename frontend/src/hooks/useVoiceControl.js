/**
 * React hook for Voice Control integration
 * Provides voice state, commands, and action handling to components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import voiceControl, { VOICE_STATES } from '../services/voiceControl';

/**
 * Hook to access voice control state and actions
 * @param {object} options
 * @param {function} options.onAction - Handler for voice actions (action, data) => boolean
 * @returns {object} Voice control state and methods
 */
export function useVoiceControl(options = {}) {
  const { onAction } = options;
  const [state, setState] = useState(voiceControl.getState());
  const [enabled, setEnabled] = useState(voiceControl.isEnabled());
  const [transcript, setTranscript] = useState('');
  const [lastCommand, setLastCommand] = useState(null);
  const [error, setError] = useState(null);
  const handlerKeyRef = useRef(null);

  useEffect(() => {
    // Subscribe to voice control events
    const unsubscribe = voiceControl.subscribe((event) => {
      switch (event.type) {
        case 'state_change':
          setState(event.state);
          break;
        case 'enabled':
          setEnabled(true);
          setError(null);
          break;
        case 'disabled':
          setEnabled(false);
          setError(null);
          setTranscript('');
          break;
        case 'interim':
          setTranscript(event.transcript);
          break;
        case 'command':
          setLastCommand(event.command);
          setTranscript('');
          break;
        case 'error':
          setError(event.error || event.transcript);
          break;
        case 'wake_detected':
          setTranscript('');
          setError(null);
          break;
        case 'timeout':
          setTranscript('');
          break;
      }
    });

    return unsubscribe;
  }, []);

  // Register action handler
  useEffect(() => {
    if (!onAction) return;

    const key = `handler_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    handlerKeyRef.current = key;

    voiceControl.registerHandler(key, (action, data) => {
      return onAction(action, data);
    });

    return () => {
      voiceControl.unregisterHandler(key);
    };
  }, [onAction]);

  const toggle = useCallback(async () => {
    await voiceControl.toggle();
  }, []);

  const enable = useCallback(async () => {
    await voiceControl.enable();
  }, []);

  const disable = useCallback(() => {
    voiceControl.disable();
  }, []);

  const isListening = state === VOICE_STATES.WAKE_LISTENING || state === VOICE_STATES.COMMAND_LISTENING;
  const isProcessing = state === VOICE_STATES.PROCESSING;
  const isCommandListening = state === VOICE_STATES.COMMAND_LISTENING;

  return {
    state,
    enabled,
    isListening,
    isProcessing,
    isCommandListening,
    transcript,
    lastCommand,
    error,
    toggle,
    enable,
    disable,
    history: voiceControl.getHistory(),
  };
}

/**
 * Hook to register a specific voice action handler
 * @param {string} actionType - The action type to handle
 * @param {function} handler - Handler function(data) => void
 */
export function useVoiceAction(actionType, handler) {
  useEffect(() => {
    const key = `action_${actionType}_${Date.now()}`;

    voiceControl.registerHandler(key, (action, data) => {
      if (action === actionType) {
        handler(data);
        return true;
      }
      return false;
    });

    return () => {
      voiceControl.unregisterHandler(key);
    };
  }, [actionType, handler]);
}

/**
 * Hook for voice dictation (speech-to-text input)
 * @param {object} options
 * @param {function} options.onTranscript - Called with recognized text
 * @returns {object} Dictation state and controls
 */
export function useVoiceDictation(options = {}) {
  const { onTranscript } = options;
  const [isDictating, setIsDictating] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef(null);

  const startDictation = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimText(interim);
      if (final && onTranscript) {
        onTranscript(final.trim());
      }
    };

    recognition.onend = () => {
      setIsDictating(false);
      setInterimText('');
    };

    recognition.onerror = () => {
      setIsDictating(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsDictating(true);
  }, [onTranscript]);

  const stopDictation = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsDictating(false);
    setInterimText('');
  }, []);

  return {
    isDictating,
    interimText,
    startDictation,
    stopDictation,
  };
}

export default useVoiceControl;
