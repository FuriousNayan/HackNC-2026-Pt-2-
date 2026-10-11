// Shared, tuneable values for Hung Jury. Nothing outside this file should
// hard-code a number, enum string, route, color, or env variable name.
// To change a value: edit here first, then open one small PR that all four
// parts approve.

export const CONFIG = {
  app: {
    name: 'Hung Jury',
    judgeName: 'Judge Hollis Gavel',
    disclaimer: 'For entertainment only. Not legal advice.',
    redactionToken: '[redacted]',
  },
  tone: {
    start: 0.5,
    floor: 0.35,
    ceiling: 1,
    smoothing: 0.6, // dial = smoothing * previous + (1 - smoothing) * toneScore
    bands: {
      leaning_serious: [0.35, 0.45],
      medium: [0.45, 0.65],
      silly: [0.65, 0.85],
      absurd: [0.85, 1],
    },
  },
  timers: {
    openingSec: 20,
    statementSec: 60,
    answerSec: 45,
    rebuttalSec: 30,
    closingSec: 30,
    voteCountdownSec: 15,
    disconnectGraceSec: 30,
  },
  limits: {
    grievanceChars: 500,
    statementChars: 500,
    answerChars: 300,
    followUpsPerSide: 2,
    jurySeats: 12,
    reactionCooldownMs: 2000,
    filingsPerHour: 3,
    reportsToClose: 3, // from different people; one report from an arguer also closes
    judgeSpeechMaxSentences: 4,
    precedentsPerCall: 5,
    habitualOffenderGuilty: 3,
  },
  voice: {
    settingsByBand: [
      { upTo: 0.45, stability: 0.65, style: 0.1, speed: 0.95 },
      { upTo: 0.65, stability: 0.5, style: 0.3, speed: 1.0 },
      { upTo: 0.85, stability: 0.35, style: 0.55, speed: 1.05 },
      { upTo: 1, stability: 0.25, style: 0.8, speed: 1.1 },
    ],
    ttsTimeoutMs: 5000, // after this the judge event goes out with audioUrl: null
  },
  avatar: { headSizePx: 256 },
  card: { portrait: [1080, 1350] as [number, number], square: [1080, 1080] as [number, number] },
  channel: (caseId: string) => `case:${caseId}`,
} as const;

// Demo constants (Globals, "Demo constants" table)
export const DEMO = {
  groupName: 'The Kitchen',
  caseTitle: 'The Case of the Missing Oat Milk',
  plaintiffHandle: 'dave',
  defendantHandle: 'maya',
  seededPrecedentTitle: 'Dave v. The Missing Pizza',
  transcriptFixture: 'fixtures/transcripts/oat-milk.json',
  recordedTrialFixture: 'fixtures/trials/oat-milk.json',
} as const;

// Proposed shared additions from the Part 3/4 handoff: review with the team
// before changing them. Preserved verbatim from their contracts/config.ts.
export const JUDGE_CONFIG = {
  timeoutMs: 12000,
  attempts: 2,
  maxOutputTokens: 1600,
  temperature: 0.65,
  maxTranscriptMessages: 40,
  maxTitleChars: 120,
  maxHandleChars: 40,
  maxSpeechChars: 1200,
  maxFindingChars: 280,
  maxSentenceChars: 300,
  maxHeadlineChars: 120,
  maxSummaryChars: 500,
  maxGuiltyHandles: 100,
  devBodyBytes: 64000,
  devCallsPerMinute: 20,
  devConcurrentCalls: 2,
  neutralScore: CONFIG.tone.start,
  memoryPageSize: 500,
  phases: ['opening', 'statements', 'cross', 'rebuttal', 'closing', 'verdict'],
  outputPhases: ['opening', 'reaction', 'question', 'interjection', 'verdict'],
  faces: ['neutral', 'amused', 'shocked', 'stern', 'speaking'],
  effects: ['none', 'gavel', 'gasp', 'drumroll', 'laugh'],
  rulings: ['guilty', 'not_guilty', 'partly_guilty', 'hung'],
  roles: ['plaintiff', 'defendant', 'juror'],
  targets: ['plaintiff', 'defendant', 'room'],
  messageKinds: ['statement', 'answer', 'closing'],
  env: { apiKey: 'GEMINI_API_KEY', model: 'GEMINI_MODEL', demo: 'DEMO_MODE' },
  demo: {
    caseTitle: 'The Case of the Missing Oat Milk',
    plaintiff: 'dave',
    defendant: 'maya',
    group: 'The Kitchen',
  },
  devEndpoint: '/api/dev/judge',
} as const;

// Part 4 additions proposed for shared contracts. No secrets here.
export const MEDIA_CONFIG = {
  routes: { avatar: '/api/avatar', tts: '/api/tts' },
  maxUploadBytes: 5 * 1024 * 1024,
  maxImagePixels: 16_000_000,
  maxSpeechChars: 2000,
  providerTimeoutMs: 15_000,
  signedUrlSeconds: 3600,
  cropPadding: 1.45,
  wasmUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm',
  faceModelUrl:
    'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
  privacyNotice:
    'Everyone in the room will see this face. Choose a preset avatar to keep your photo private.',
  env: {
    key: 'ELEVENLABS_API_KEY',
    voice: 'ELEVENLABS_VOICE_ID',
    fast: 'ELEVENLABS_MODEL_FAST',
    verdict: 'ELEVENLABS_MODEL_VERDICT',
    supabaseUrl: 'NEXT_PUBLIC_SUPABASE_URL',
    serviceKey: 'SUPABASE_SERVICE_ROLE_KEY',
    bucket: 'SUPABASE_MEDIA_BUCKET',
    visionKey: 'GOOGLE_VISION_API_KEY',
    demo: 'DEMO_MODE',
  },
  models: { quick: 'eleven_flash_v2_5', verdict: 'eleven_multilingual_v2' },
} as const;

// Safety copy (Globals, "Shared copy")
export const SAFETY_COPY = {
  threatOrAbuseMessage:
    "This case has been closed. What you described sounds serious, and it is not something a mock court should decide. If you or someone else is in danger, please contact local emergency services. Support is listed below.",
  resources: [
    { category: 'Immediate danger', resource: 'Call 911' },
    { category: 'Suicide or self-harm', resource: '988 Suicide and Crisis Lifeline (call or text 988)' },
    {
      category: 'Domestic or relationship abuse',
      resource: 'National Domestic Violence Hotline, 1-800-799-7233 (text START to 88788)',
    },
    { category: 'Sexual assault', resource: 'RAINN, 1-800-656-4673' },
    { category: 'General crisis support', resource: 'Crisis Text Line (text HOME to 741741)' },
  ],
} as const;
