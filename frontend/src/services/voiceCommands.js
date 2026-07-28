/**
 * Voice Command Registry
 * Defines all supported voice commands with pattern matching and actions
 */

// Module name aliases for voice recognition
export const MODULE_ALIASES = {
  // Focus Flow (Study Planner)
  'focus flow': '/planner',
  'study planner': '/planner',
  'study plan': '/planner',
  'planner': '/planner',
  'plans': '/planner',
  'deadlines': '/planner',

  // Brain Sync (Collaboration)
  'brain sync': '/collaboration',
  'collaboration': '/collaboration',
  'collab': '/collaboration',
  'live collaboration': '/collaboration',
  'document editor': '/collaboration',
  'editor': '/collaboration',

  // Quiz Forge (Quiz Generator)
  'quiz forge': '/quiz',
  'quiz generator': '/quiz',
  'quiz': '/quiz',
  'quizzes': '/quiz',

  // Sync Vault (Secure Vault)
  'sync vault': '/vault',
  'secure vault': '/vault',
  'vault': '/vault',
  'file sharing': '/vault',

  // Sync Meet (Video Calls)
  'sync meet': '/webrtc',
  'video calls': '/webrtc',
  'video call': '/webrtc',
  'webrtc': '/webrtc',
  'meeting': '/webrtc',
  'meet': '/webrtc',

  // Doc Mind (PDF Editor)
  'doc mind': '/pdf-editor',
  'pdf editor': '/pdf-editor',
  'pdf': '/pdf-editor',
  'document editor': '/pdf-editor',

  // Paper Mind (PDF RAG)
  'paper mind': '/pdf-rag',
  'pdf rag': '/pdf-rag',
  'pdf qna': '/pdf-rag',
  'pdf search': '/pdf-rag',
  'rag': '/pdf-rag',

  // Sync AI (Chatbot)
  'sync ai': '/chatbot',
  'chatbot': '/chatbot',
  'chat': '/chatbot',
  'ai': '/chatbot',
  'assistant': '/chatbot',

  // Dashboard
  'dashboard': '/',
  'home': '/',
  'main page': '/',
};

// Command patterns with regex matchers
export const COMMAND_PATTERNS = [
  // === Navigation Commands ===
  {
    id: 'navigate',
    patterns: [
      /(?:go|navigate)\s+(?:to\s+)?(.+)/i,
      /(?:open|show|switch\s+to)\s+(.+)/i,
      /(?:take\s+me\s+to|bring\s+me\s+to)\s+(.+)/i,
    ],
    extract: (match) => ({ type: 'navigate', target: match[1]?.trim() }),
  },

  // === Go Home / Back ===
  {
    id: 'go_home',
    patterns: [
      /(?:go\s+)?(?:home|back\s+to\s+dashboard|back\s+to\s+home)/i,
      /dashboard/i,
    ],
    extract: () => ({ type: 'navigate', target: '/' }),
  },

  // === Upload File Commands ===
  {
    id: 'upload_file',
    patterns: [
      /(?:upload|import|add)\s+(?:a\s+)?(?:file|document)(?:\s+named?\s+)?(?:\s+)?(.+?)\s+(?:to|in|into)\s+(.+)/i,
      /(?:upload|import)\s+(?:to\s+)?(.+)/i,
      /(?:upload|import)\s+(?:a\s+)?(?:file|document)/i,
    ],
    extract: (match, patternIndex) => {
      if (patternIndex === 0) {
        return { type: 'upload', filename: match[1]?.trim(), target: match[2]?.trim() };
      }
      if (patternIndex === 1) {
        return { type: 'upload', filename: null, target: match[1]?.trim() };
      }
      return { type: 'upload', filename: null, target: null };
    },
  },

  // === Quiz Generation Commands ===
  {
    id: 'generate_quiz',
    patterns: [
      /(?:generate|create|make)\s+(?:a\s+)?quiz\s+(?:on|about|for|of)\s+(.+)/i,
      /(?:generate|create|make)\s+(?:a\s+)?(?:mcq|multiple\s+choice)\s+(?:on|about)\s+(.+)/i,
    ],
    extract: (match) => ({ type: 'generate_quiz', topic: match[1]?.trim() }),
  },

  // === Study Plan Commands ===
  {
    id: 'create_plan',
    patterns: [
      /(?:create|make|start|new)\s+(?:a\s+)?(?:study\s+)?plan\s+(?:for|on|about)\s+(.+)/i,
      /(?:create|make|start)\s+(?:a\s+)?(?:study\s+)?plan/i,
    ],
    extract: (match, patternIndex) => ({
      type: 'create_plan',
      subject: patternIndex === 0 ? match[1]?.trim() : null,
    }),
  },

  // === Deadline Commands ===
  {
    id: 'show_deadlines',
    patterns: [
      /(?:show|display|list)\s+(?:my\s+)?deadlines/i,
      /(?:what\s+are\s+)?(?:my\s+)?deadlines/i,
      /(?:upcoming|pending)\s+(?:tasks|deadlines|assignments)/i,
    ],
    extract: () => ({ type: 'show_deadlines' }),
  },

  // === Collaboration Commands ===
  {
    id: 'new_document',
    patterns: [
      /(?:create|make|start|new)\s+(?:a\s+)?(?:new\s+)?document/i,
      /(?:create|make|start)\s+(?:a\s+)?(?:new\s+)?collaboration/i,
    ],
    extract: () => ({ type: 'new_document' }),
  },

  // === Chat Commands ===
  {
    id: 'new_chat',
    patterns: [
      /(?:new|start|create)\s+(?:a\s+)?(?:new\s+)?chat/i,
      /(?:new|start)\s+(?:a\s+)?conversation/i,
    ],
    extract: () => ({ type: 'new_chat' }),
  },
  {
    id: 'ask_ai',
    patterns: [
      /(?:ask|tell)\s+(?:sync\s+ai|the\s+ai|assistant)\s+(.+)/i,
      /(?:ask|question)\s+(.+)/i,
    ],
    extract: (match) => ({ type: 'ask_ai', question: match[1]?.trim() }),
  },

  // === Vault Commands ===
  {
    id: 'create_vault',
    patterns: [
      /(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?vault(?:\s+named?\s+(.+))?/i,
    ],
    extract: (match) => ({ type: 'create_vault', name: match[1]?.trim() || null }),
  },

  // === Help Command ===
  {
    id: 'help',
    patterns: [
      /(?:help|what\s+can\s+you\s+do|commands|what\s+are\s+the\s+commands)/i,
    ],
    extract: () => ({ type: 'help' }),
  },

  // === Stop/Disable Commands ===
  {
    id: 'stop_listening',
    patterns: [
      /(?:stop|disable|turn\s+off)\s+(?:listening|voice)/i,
      /(?:goodbye|bye|stop|shut\s+down)/i,
      /(?:go\s+to\s+sleep|sleep)/i,
    ],
    extract: () => ({ type: 'stop_listening' }),
  },

  // === Start/Enable Commands ===
  {
    id: 'start_listening',
    patterns: [
      /(?:start|enable|turn\s+on)\s+(?:listening|voice)/i,
      /(?:wake\s+up|activate)/i,
    ],
    extract: () => ({ type: 'start_listening' }),
  },

  // === Dictation (fallback - treat entire input as text) ===
  {
    id: 'dictate',
    patterns: [
      /(?:type|write|dictate|say)\s+(.+)/i,
    ],
    extract: (match) => ({ type: 'dictate', text: match[1]?.trim() }),
  },
];

/**
 * Parse a voice command string into an action object
 * @param {string} text - The recognized speech text
 * @returns {object|null} - Parsed command or null if not recognized
 */
export function parseCommand(text) {
  if (!text || typeof text !== 'string') return null;

  const cleaned = text.trim().replace(/\s+/g, ' ');

  for (let i = 0; i < COMMAND_PATTERNS.length; i++) {
    const cmd = COMMAND_PATTERNS[i];
    for (const pattern of cmd.patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        try {
          const action = cmd.extract(match, i);
          if (action) {
            return { ...action, raw: cleaned, commandId: cmd.id };
          }
        } catch (e) {
          continue;
        }
      }
    }
  }

  return null;
}

/**
 * Resolve a module name to its route path
 * @param {string} name - Module name spoken by user
 * @returns {string|null} - Route path or null
 */
export function resolveModule(name) {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  return MODULE_ALIASES[normalized] || null;
}

/**
 * Get list of all available commands for help display
 */
export function getAvailableCommands() {
  return [
    { category: 'Navigation', commands: [
      '"Go to [module]" - Navigate to a module',
      '"Go home" - Return to dashboard',
      '"Show me Quiz Forge" - Open Quiz Forge',
    ]},
    { category: 'File Operations', commands: [
      '"Upload file to Quiz Forge" - Upload a file',
      '"Import [filename] to Brain Sync" - Import specific file',
    ]},
    { category: 'Quiz Forge', commands: [
      '"Generate quiz about [topic]" - Create a quiz',
      '"Start quiz" - Begin a quiz attempt',
    ]},
    { category: 'Focus Flow', commands: [
      '"Create study plan for [subject]" - New study plan',
      '"Show my deadlines" - View deadlines',
    ]},
    { category: 'Brain Sync', commands: [
      '"Create new document" - Start collaboration',
    ]},
    { category: 'Sync AI', commands: [
      '"New chat" - Start new conversation',
      '"Ask [question]" - Ask AI a question',
    ]},
    { category: 'Sync Vault', commands: [
      '"Create vault [name]" - Create a new vault',
      '"Upload file to Sync Vault" - Upload to vault',
    ]},
    { category: 'General', commands: [
      '"Help" - Show this help',
      '"Stop listening" - Disable voice control',
      '"Start listening" - Enable voice control',
    ]},
  ];
}

export default {
  MODULE_ALIASES,
  COMMAND_PATTERNS,
  parseCommand,
  resolveModule,
  getAvailableCommands,
};
