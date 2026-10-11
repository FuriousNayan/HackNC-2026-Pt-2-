import type { SafetyCategory } from '../contracts';
export const SAFETY_PATTERNS: Record<SafetyCategory, RegExp[]> = {
  threat: [
    /\b(?:kill|hurt|shoot|stab|beat|attack)\s+(?:you|him|her|them|my|your)\b/i,
    /\bmake\s+(?:you|him|her|them)\s+(?:pay|regret)\b/i,
    /\b(?:bomb|death threat|bring a gun)\b/i,
  ],
  harassment: [
    /\b(?:stalk(?:ing|s|ed)?|blackmail|doxx?(?:ing|ed)?|harass(?:ment|ing|ed)?)\b/i,
    /\b(?:texting|calling|following|contacting)\b.{0,100}\b(?:told|asked)\b.{0,40}\bstop\b/i,
    /\b(?:won't|will not|wont) leave me alone\b/i,
    /\b(?:hit|hits|hitting|abuses|abusing) me\b/i,
  ],
  self_harm: [
    /\b(?:suicid(?:e|al)|self[- ]harm|kill myself|end my life|want to die|cut myself)\b/i,
  ],
  other: [
    /\b(?:rape|raped|sexual assault|child porn|molest(?:ed|ing)?|nudes|pornography)\b/i,
    /\bminor\b.{0,40}\b(?:danger|sex|abuse)\b/i,
  ],
};
export const REDACTION_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /(?:https?:\/\/|www\.)[^\s<>]+/gi,
  /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|edu|gov|io|co|app|dev|me|us|uk)(?:\/[^\s<>]*)?\b/gi,
  /(?<!\w)(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?:\s*(?:ext\.?|x)\s*\d+)?(?!\w)/gi,
  /\b\d{1,6}\s+(?:[A-Z0-9.'-]+\s+){1,6}(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|court|ct|way|place|pl|terrace|ter|circle|cir)\b(?:\.?\s*(?:apt|unit|suite|#)\s*[A-Z0-9-]+)?/gi,
  /(?<![\w@])@[A-Z0-9_][A-Z0-9_.-]*/gi,
];
