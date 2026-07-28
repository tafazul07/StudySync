/**
 * Voice Control Floating Widget
 * Provides visual feedback and controls for the voice control system
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  HelpCircle,
  ChevronUp,
  ChevronDown,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useVoiceControl } from '../hooks/useVoiceControl';
import { VOICE_STATES } from '../services/voiceControl';
import { getAvailableCommands } from '../services/voiceCommands';
import voiceControl from '../services/voiceControl';
import { isSpeechRecognitionAvailable } from '../services/audioFeedback';

export default function VoiceWidget() {
  const navigate = useNavigate();
  const {
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
    history,
  } = useVoiceControl({
    onAction: useCallback((action, data) => {
      switch (action) {
        case 'navigate':
          if (data.route) {
            navigate(data.route);
            return true;
          }
          break;
        case 'upload':
          // Always handle upload navigation first if targetRoute is specified
          if (data.targetRoute) {
            if (window.location.pathname !== data.targetRoute) {
              navigate(data.targetRoute);
              // Store pending upload action for new page to handle
              sessionStorage.setItem('pendingVoiceUpload', JSON.stringify(data));
              return true; // Mark as handled - prevent other handlers
            } else {
              // Already on target page, let page handler handle it
              return false;
            }
          }
          // No target route specified, let page handler handle it
          return false;
        case 'help':
          setShowHelp(true);
          return true;
        default:
          return false;
      }
    }, [navigate]),
  });

  const [showPanel, setShowPanel] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [supported, setSupported] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);

  useEffect(() => {
    setSupported(isSpeechRecognitionAvailable());
  }, []);

  // Keyboard shortcut: Ctrl+Space to toggle
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  const toggleTTS = () => {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    voiceControl.setTTSEnabled(next);
  };

  if (!supported) return null;

  const getStateColor = () => {
    switch (state) {
      case VOICE_STATES.WAKE_LISTENING: return 'from-blue-500 to-cyan-500';
      case VOICE_STATES.COMMAND_LISTENING: return 'from-purple-500 to-pink-500';
      case VOICE_STATES.PROCESSING: return 'from-amber-500 to-orange-500';
      case VOICE_STATES.ERROR: return 'from-red-500 to-rose-500';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  const getStateLabel = () => {
    switch (state) {
      case VOICE_STATES.WAKE_LISTENING: return 'Listening...';
      case VOICE_STATES.COMMAND_LISTENING: return 'Give a command...';
      case VOICE_STATES.PROCESSING: return 'Processing...';
      case VOICE_STATES.ERROR: return 'Not understood';
      default: return 'Voice Control';
    }
  };

  const getStateIcon = () => {
    if (isProcessing) return <Loader2 className="w-5 h-5 animate-spin" />;
    if (state === VOICE_STATES.ERROR) return <AlertCircle className="w-5 h-5" />;
    if (isListening) return <Mic className="w-5 h-5" />;
    if (enabled) return <Mic className="w-5 h-5" />;
    return <MicOff className="w-5 h-5" />;
  };

  const availableCommands = getAvailableCommands();

  return (
    <div className="fixed bottom-[80px] right-6 z-50 flex flex-col items-end gap-3">
      {/* Help Panel */}
      {showHelp && (
        <div className="w-80 glass-card rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-2xl animate-scale-in overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200/50 dark:border-gray-700/50">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-primary-500" />
              Voice Commands
            </h3>
            <button
              onClick={() => setShowHelp(false)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Say <span className="font-semibold text-primary-600 dark:text-primary-400">"Hey StudySync"</span> then a command, or say commands directly:
            </p>
            {availableCommands.map((group) => (
              <div key={group.category}>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {group.category}
                </h4>
                <div className="space-y-1.5">
                  {group.commands.map((cmd, i) => (
                    <p key={i} className="text-sm text-gray-600 dark:text-gray-300 pl-2 border-l-2 border-primary-500/30">
                      {cmd}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50">
            <p className="text-xs text-gray-400 text-center">
              Shortcut: <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">Ctrl+Space</kbd> to toggle
            </p>
          </div>
        </div>
      )}

      {/* Status Panel (shows when active) */}
      {enabled && showPanel && (
        <div className="w-72 glass-card rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-2xl animate-scale-in overflow-hidden">
          <div className="p-4">
            {/* Current State */}
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getStateColor()} flex items-center justify-center text-white`}>
                {getStateIcon()}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{getStateLabel()}</p>
                <p className="text-xs text-gray-400">
                  {enabled ? 'Ctrl+Space to toggle' : 'Click mic to start'}
                </p>
              </div>
            </div>

            {/* Live Transcript */}
            {transcript && (
              <div className="mb-3 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <p className="text-xs text-gray-400 mb-1">Heard:</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 italic">"{transcript}"</p>
              </div>
            )}

            {/* Last Command */}
            {lastCommand && (
              <div className="mb-3 p-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200/50 dark:border-primary-700/50">
                <p className="text-xs text-primary-500 mb-1">Last command:</p>
                <p className="text-sm text-primary-700 dark:text-primary-300">{lastCommand.raw}</p>
              </div>
            )}

            {/* Error */}
            {error && state === VOICE_STATES.ERROR && (
              <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200/50 dark:border-red-700/50">
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Didn't understand. Try "help".
                </p>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTTS}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  ttsEnabled
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                }`}
              >
                {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                Voice Reply
              </button>
              <button
                onClick={() => { setShowHelp(true); setShowPanel(false); }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Help
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Mic Button */}
      <div className="flex items-center gap-2">
        {/* Help Button */}
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="w-10 h-10 rounded-full glass-card border border-gray-200/50 dark:border-gray-700/50 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-primary-500 hover:border-primary-300 dark:hover:border-primary-600 transition-all shadow-lg hover:shadow-xl"
          title="Voice commands help"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Toggle Panel Button */}
        {enabled && (
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="w-10 h-10 rounded-full glass-card border border-gray-200/50 dark:border-gray-700/50 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-primary-500 transition-all shadow-lg"
            title={showPanel ? 'Hide panel' : 'Show panel'}
          >
            {showPanel ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        )}

        {/* Main Mic Button */}
        <button
          onClick={toggle}
          className={`relative w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-300 hover:scale-110 ${
            enabled
              ? `bg-gradient-to-br ${getStateColor()} hover:shadow-lg`
              : 'bg-gradient-to-br from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600'
          }`}
          title={enabled ? 'Disable voice control (Ctrl+Space)' : 'Enable voice control (Ctrl+Space)'}
        >
          {/* Pulse animation when listening */}
          {isListening && (
            <>
              <span className={`absolute inset-0 rounded-full bg-gradient-to-br ${getStateColor()} animate-ping opacity-20`} />
              <span className={`absolute -inset-1 rounded-full bg-gradient-to-br ${getStateColor()} opacity-10 animate-pulse`} />
            </>
          )}

          {/* Icon */}
          <span className="relative z-10">
            {enabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </span>
        </button>
      </div>

      {/* Status Text */}
      {enabled && (
        <div className="glass-card rounded-full px-3 py-1 border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${getStateColor()} ${isListening ? 'animate-pulse' : ''}`} />
            {getStateLabel()}
          </p>
        </div>
      )}
    </div>
  );
}
