/* ============================================================
   Password Change Assistant – script.js
   All client-side logic: validation, scoring, generation,
   suggestions, clipboard, and UI wiring.
   Converted from Chrome Extension popup.js to standalone web app.
   ============================================================ */

'use strict';

// ── Common word / pattern lists ──────────────────────────────────
const COMMON_WORDS = [
  'password','keysight', 'admin', 'welcome', 'user', 'login', 'master',
  'letmein', 'dragon', 'monkey', 'shadow', 'sunshine', 'princess',
  'football', 'charlie', 'access', 'hello', 'trustno1', 'iloveyou',
  'batman', 'superman', 'michael', 'jennifer', 'hunter', 'thomas',
  'robert', 'daniel', 'joshua', 'andrew', 'jessica', 'harley',
  'jordan', 'pepper', 'ginger', 'ranger', 'buster', 'nicole',
  'secret', 'summer', 'flower', 'buttercup', 'passw0rd', 'qwerty',
  'abc123', 'computer', 'internet', 'server', 'system', 'default',
  'pass', 'test', 'guest', 'root', 'newpass', 'change', 'temp',
  'sample', 'example', 'company', 'corporate', 'office', 'work',
  'home', 'personal', 'private', 'secure', 'safety', 'protect',
  'magic', 'love', 'baby', 'angel', 'baseball', 'soccer', 'hockey',
  'dallas', 'chicago', 'london', 'paris', 'india', 'america',
  'january', 'february', 'march', 'april', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'
];

const COMMON_PATTERNS = [
    '123456', '12345678', '123456789', '1234567890', '12345','0123',
    '1234','2345', '3456', '4567', '5678', '6789','7890',
    '0987', '9876', '8765', '7654', '6543', '5432', '4321', '3210',
    'abcdef', 'abcdefgh', 'qwerty', 'qwertyuiop',
    'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm',
    '111111', '000000', '222222', '333333', '999999',
    'aaaaaa', 'abc123', 'password1', 'letmein', '1q2w3e',
    'iloveyou', '1qaz2wsx', '11111111', 'sunshine', 'princess'
];

// Leet-speak mappings
const LEET_MAP     = { a: '@', i: '1', s: '$', o: '0', e: '3', t: '7' };
const REVERSE_LEET = { '@': 'a', '1': 'i', '$': 's', '0': 'o', '3': 'e', '7': 't' };

const SPECIALS = '!@#$%^&*';

// ── DOM References ───────────────────────────────────────────────
const elUsername       = document.getElementById('username');
const elPassword       = document.getElementById('password');
const elToggleBtn      = document.getElementById('toggle-password');
const elEyeOpen        = document.getElementById('eye-open');
const elEyeClosed      = document.getElementById('eye-closed');
const elValidationSec  = document.getElementById('validation-section');
const elValidationList = document.getElementById('validation-list');
const elStrengthSec    = document.getElementById('strength-section');
const elStrengthBar    = document.getElementById('strength-bar');
const elStrengthLabel  = document.getElementById('strength-label');
const elStrengthPill   = document.getElementById('strength-score-pill');
const elStrengthTrack  = document.getElementById('strength-track');
const elSuggestionsSec = document.getElementById('suggestions-section');
const elSuggestionsList= document.getElementById('suggestions-list');
const elBtnGenerate    = document.getElementById('btn-generate');
const elGeneratedOut   = document.getElementById('generated-output');
const elGeneratedPwd   = document.getElementById('generated-password');
const elBtnCopyGen     = document.getElementById('btn-copy-generated');
const elBtnSaveGen     = document.getElementById('btn-save-generated');
const elToast          = document.getElementById('toast');
const elPassCountBadge = document.getElementById('pass-count-badge');
const elEmptyState     = document.getElementById('empty-state');

// ── Show / Hide Password Toggle ──────────────────────────────────
elToggleBtn.addEventListener('click', () => {
  const isHidden = elPassword.type === 'password';
  elPassword.type      = isHidden ? 'text' : 'password';
  elEyeOpen.style.display   = isHidden ? 'none'  : '';
  elEyeClosed.style.display = isHidden ? ''      : 'none';
  elToggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
});

// ── Utility Helpers ──────────────────────────────────────────────

/** Split a full name into meaningful parts (>= 3 chars long) */
function getNameParts(name) {
  if (!name || !name.trim()) return [];
  return name.toLowerCase()
    .split(/[\s._\-,]+/)
    .filter(p => p.length >= 3);
}

/** Check for repeated characters (4+ in a row) */
function hasRepeatedChars(pwd) {
  return /(.)(\1){3,}/.test(pwd);
}

/** Reverse leet-speak a string */
function deLeet(str) {
  return str.split('').map(c => REVERSE_LEET[c] || c).join('');
}

/** Find any common English word in the password (includes de-leet check) */
function findCommonWord(pwd) {
  const lower   = pwd.toLowerCase();
  const deleeted = deLeet(lower);
  for (const word of COMMON_WORDS) {
    if (lower.includes(word) || deleeted.includes(word)) return word;
  }
  return null;
}

/** Find any common sequential pattern */
function findCommonPattern(pwd) {
  const lower = pwd.toLowerCase();
  for (const pat of COMMON_PATTERNS) {
    if (lower.includes(pat)) return pat;
  }
  return null;
}

// ── Validation Engine ────────────────────────────────────────────

/**
 * Validates password against all security rules.
 * @returns {Array<{pass: boolean, message: string}>}
 */
function validate(password, username) {
  const results   = [];
  const nameParts = getNameParts(username);

  // Rule 1 – Minimum length
  results.push({
    id: 'length',
    pass: password.length >= 12,
    message: password.length >= 12
      ? 'At least 12 characters'
      : `At least 12 characters (currently ${password.length})`
  });

  // Rule 2 – Uppercase letter
  results.push({
    id: 'uppercase',
    pass: /[A-Z]/.test(password),
    message: 'Contains an uppercase letter'
  });

  // Rule 3 – Lowercase letter
  results.push({
    id: 'lowercase',
    pass: /[a-z]/.test(password),
    message: 'Contains a lowercase letter'
  });

  // Rule 4 – Digit
  results.push({
    id: 'digit',
    pass: /[0-9]/.test(password),
    message: 'Contains a number'
  });

  // Rule 5 – Special character
  results.push({
    id: 'special',
    pass: /[^A-Za-z0-9]/.test(password),
    message: 'Contains a special character (e.g. !@#$%)'
  });

  // Rule 6 – Full name check
  if (username && username.trim().length > 0) {
    const fullLower   = username.trim().toLowerCase();
    const pwdLower    = password.toLowerCase();
    const deLeetPwd   = deLeet(pwdLower);
    const containsFull = pwdLower.includes(fullLower) || deLeetPwd.includes(fullLower);
    results.push({
      id: 'fullname',
      pass: !containsFull,
      message: containsFull
        ? `Contains your full name "${username.trim()}"`
        : 'Does not contain your full name'
    });
  }

  // Rule 7 – Name parts check
  if (nameParts.length > 0) {
    const pwdLower  = password.toLowerCase();
    const deLeetPwd = deLeet(pwdLower);
    let foundPart   = null;
    for (const part of nameParts) {
      if (pwdLower.includes(part) || deLeetPwd.includes(part)) {
        foundPart = part;
        break;
      }
    }
    results.push({
      id: 'namepart',
      pass: !foundPart,
      message: foundPart
        ? `Contains part of your name: "${foundPart}"`
        : 'Does not contain parts of your name'
    });
  }

  // Rule 8 – Common words
  const commonWord = findCommonWord(password);
  results.push({
    id: 'commonword',
    pass: !commonWord,
    message: commonWord
      ? `Contains a common word: "${commonWord}"`
      : 'No common dictionary words detected'
  });

  // Rule 9 – Common patterns
  const commonPat = findCommonPattern(password);
  results.push({
    id: 'pattern',
    pass: !commonPat,
    message: commonPat
      ? `Contains a common pattern: "${commonPat}"`
      : 'No common sequential patterns'
  });

  // Rule 10 – Repeated characters
  const repeated = hasRepeatedChars(password);
  results.push({
    id: 'repeated',
    pass: !repeated,
    message: repeated
      ? 'Contains repeated characters (4 or more in a row)'
      : 'No consecutive repeated characters'
  });

  return results;
}

// ── Strength Scoring ─────────────────────────────────────────────

function computeStrength(password, validationResults) {
  let score = 0;

  // Points from passed rules (max 60)
  const passed = validationResults.filter(r => r.pass).length;
  score += Math.round((passed / validationResults.length) * 60);

  // Bonus for extra length beyond minimum (max 20)
  const extraLen = Math.max(0, password.length - 12);
  score += Math.min(20, extraLen * 3);

  // Bonus for character diversity (max 20)
  const unique = new Set(password).size;
  score += Math.min(20, Math.round((unique / Math.max(password.length, 1)) * 20));

  score = Math.min(100, Math.max(0, score));

  let level  = 'Weak';
  if (score >= 80)      level = 'Strong';
  else if (score >= 50) level = 'Medium';

  return { score, level };
}

// ── Suggestions Engine ───────────────────────────────────────────

function generateSuggestions(password, username) {
  const nameParts   = getNameParts(username);
  const suggestions = [];

  function mutate(base) {
    let pwd = base;

    // Strip name parts
    for (const part of nameParts) {
      pwd = pwd.replace(new RegExp(part, 'gi'), () =>
        SPECIALS[Math.floor(Math.random() * SPECIALS.length)] +
        Math.floor(Math.random() * 10)
      );
    }

    // Ensure uppercase
    if (!/[A-Z]/.test(pwd)) {
      const idx = pwd.search(/[a-z]/);
      if (idx !== -1) pwd = pwd.slice(0, idx) + pwd[idx].toUpperCase() + pwd.slice(idx + 1);
    }

    // Ensure lowercase
    if (!/[a-z]/.test(pwd)) pwd += 'x';

    // Ensure digit
    if (!/[0-9]/.test(pwd)) pwd += Math.floor(Math.random() * 90 + 10);

    // Ensure special char
    if (!/[^A-Za-z0-9]/.test(pwd)) {
      const pos = Math.floor(pwd.length / 2);
      pwd = pwd.slice(0, pos) + SPECIALS[Math.floor(Math.random() * SPECIALS.length)] + pwd.slice(pos);
    }

    // Pad to 12 chars minimum
    while (pwd.length < 12) {
      pwd += SPECIALS[Math.floor(Math.random() * SPECIALS.length)] +
             String.fromCharCode(65 + Math.floor(Math.random() * 26));
    }

    return pwd;
  }

  // Strategy 1: Leet substitutions
  let s1 = password;
  for (const [letter, sub] of Object.entries(LEET_MAP)) {
    s1 = s1.replace(new RegExp(letter, 'gi'), () =>
      Math.random() > 0.4 ? sub : letter.toUpperCase()
    );
  }
  suggestions.push(mutate(s1));

  // Strategy 2: Every 3rd char capitalised, special inserted at midpoint
  let s2  = password.split('').map((c, i) => i % 3 === 0 ? c.toUpperCase() : c).join('');
  const mid = Math.floor(s2.length / 2);
  s2 = s2.slice(0, mid) + '#' + s2.slice(mid);
  suggestions.push(mutate(s2));

  // Strategy 3: Reversed + special suffix
  let s3 = password.split('').reverse().join('');
  s3 += SPECIALS[Math.floor(Math.random() * SPECIALS.length)] +
        String.fromCharCode(65 + Math.floor(Math.random() * 26));
  suggestions.push(mutate(s3));

  // Filter to only those that actually pass all rules
  const valid = [...new Set(suggestions)].filter(s =>
    validate(s, username).every(r => r.pass)
  );

  // Fallback: generate more until we have 3
  let attempts = 0;
  while (valid.length < 3 && attempts < 40) {
    const fb = mutate(
      password +
      SPECIALS[Math.floor(Math.random() * SPECIALS.length)] +
      Math.floor(Math.random() * 900 + 100) +
      String.fromCharCode(65 + Math.floor(Math.random() * 26))
    );
    if (validate(fb, username).every(r => r.pass) && !valid.includes(fb)) {
      valid.push(fb);
    }
    attempts++;
  }

  return valid.slice(0, 3);
}

// ── Creative Name Variation Helpers ──────────────────────────────

/** Double random consonants in a word: rishika → rishhika */
function doubleConsonants(word) {
  const consonants = 'bcdfghjklmnpqrstvwxyz';
  let result = '';
  let doubled = false;
  for (const c of word) {
    result += c;
    if (!doubled && consonants.includes(c.toLowerCase()) && Math.random() > 0.5) {
      result += c;
      doubled = true;
    }
  }
  return result;
}

/** Double vowels in a word: rishika → riishikaa */
function doubleVowels(word) {
  const vowels = 'aeiou';
  let result = '';
  for (const c of word) {
    result += c;
    if (vowels.includes(c.toLowerCase()) && Math.random() > 0.45) {
      result += c;
    }
  }
  return result;
}

/** Reverse a word */
function reverseWord(word) {
  return word.split('').reverse().join('');
}

/** Shuffle the middle of a word, keep first and last */
function shuffleMiddle(word) {
  if (word.length <= 3) return word;
  const mid = word.slice(1, -1).split('');
  for (let i = mid.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mid[i], mid[j]] = [mid[j], mid[i]];
  }
  return word[0] + mid.join('') + word[word.length - 1];
}

/** Apply creative variation to a name part */
function creativeVariation(word) {
  const strategies = [
    () => doubleConsonants(word),
    () => doubleVowels(word),
    () => reverseWord(word),
    () => shuffleMiddle(word),
    () => word + word.slice(-2),        // rishika → rishikaka
    () => word[0].toUpperCase() + word.slice(1) + word[0], // rishika → Rishikar
  ];
  return strategies[Math.floor(Math.random() * strategies.length)]();
}

// ── Smart Password Generator ─────────────────────────────────────

function smartGenerate(username) {
  const nameParts = getNameParts(username);
  let seedParts   = [];

  // Use creative variations of name parts
  if (nameParts.length > 0) {
    seedParts = nameParts.map(p => creativeVariation(p));
  }

  if (seedParts.length === 0) seedParts = ['secure', 'key'];

  // Build base with leet substitution + random caps
  let base = seedParts.map((word, idx) => {
    let w = word.split('').map(c => {
      const lower = c.toLowerCase();
      if (LEET_MAP[lower] && Math.random() > 0.55) return LEET_MAP[lower];
      return Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase();
    }).join('');
    if (idx < seedParts.length - 1) {
      w += SPECIALS[Math.floor(Math.random() * SPECIALS.length)];
    }
    return w;
  }).join('');

  // Ensure all character classes present
  if (!/[A-Z]/.test(base)) base = base[0].toUpperCase() + base.slice(1);
  if (!/[0-9]/.test(base)) base += Math.floor(Math.random() * 90 + 10);
  if (!/[^A-Za-z0-9]/.test(base)) {
    const pos = Math.floor(base.length / 2);
    base = base.slice(0, pos) + SPECIALS[Math.floor(Math.random() * SPECIALS.length)] + base.slice(pos);
  }
  if (!/[a-z]/.test(base)) base += 'x';

  // Pad to minimum length
  while (base.length < 12) {
    base += SPECIALS[Math.floor(Math.random() * SPECIALS.length)] +
            String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }

  // Iteratively fix any remaining issues
  let attempts = 0;
  while (attempts < 25) {
    const v = validate(base, username);
    if (v.every(r => r.pass)) break;

    // Remove name parts if still present
    for (const part of nameParts) {
      base = base.replace(new RegExp(part, 'gi'), () =>
        SPECIALS[Math.floor(Math.random() * SPECIALS.length)] + Math.floor(Math.random() * 10)
      );
    }
    for (const word of COMMON_WORDS) {
      if (base.toLowerCase().includes(word)) {
        base = base.replace(new RegExp(word, 'gi'), () =>
          SPECIALS[Math.floor(Math.random() * SPECIALS.length)] + Math.floor(Math.random() * 10)
        );
      }
    }
    while (base.length < 12) {
      base += String.fromCharCode(65 + Math.floor(Math.random() * 26));
    }
    attempts++;
  }

  return base;
}

// ── UI Rendering ─────────────────────────────────────────────────

function renderValidation(results) {
  elValidationList.innerHTML = '';
  const passedCount = results.filter(r => r.pass).length;

  // Update badge
  elPassCountBadge.textContent = `${passedCount} / ${results.length}`;
  elPassCountBadge.classList.toggle('all-pass', passedCount === results.length);

  results.forEach((r, i) => {
    const li = document.createElement('li');
    li.className = r.pass ? 'pass' : 'fail';
    li.style.animationDelay = `${i * 0.04}s`;

    // Icon
    const iconDiv = document.createElement('div');
    iconDiv.className = 'v-icon';
    iconDiv.setAttribute('aria-hidden', 'true');
    iconDiv.innerHTML = r.pass
      ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
      : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    // Message
    const msg = document.createElement('span');
    msg.className = 'v-msg';
    msg.textContent = r.message;

    li.appendChild(iconDiv);
    li.appendChild(msg);
    elValidationList.appendChild(li);
  });
}

function renderStrength(score, level) {
  // Update bar width & pill
  elStrengthBar.style.width     = score + '%';
  elStrengthLabel.textContent   = level;
  elStrengthPill.textContent    = `${score} / 100`;

  // Update aria role
  elStrengthTrack.setAttribute('aria-valuenow', score);

  // Update label class for colour
  elStrengthLabel.className = 'strength-level-label ' + level.toLowerCase();

  // Update card class for bar colour
  elStrengthSec.className = 'card card--strength strength-' + level.toLowerCase();
}

function renderSuggestions(suggestions) {
  elSuggestionsList.innerHTML = '';
  suggestions.forEach((s, i) => {
    const li = document.createElement('li');
    li.style.animationDelay = `${i * 0.06}s`;

    const span = document.createElement('span');
    span.className = 'sug-text';
    span.textContent = s;

    const btn = document.createElement('button');
    btn.className = 'btn-copy-sug';
    btn.setAttribute('aria-label', `Copy suggestion: ${s}`);
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy`;

    btn.addEventListener('click', () => {
      elPassword.value = s;
      copyToClipboard(s);
      onPasswordInput();
    });

    li.appendChild(span);
    li.appendChild(btn);
    elSuggestionsList.appendChild(li);
  });
}

// ── Clipboard & Toast ────────────────────────────────────────────

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('Copied to clipboard!'))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('Copied to clipboard!');
  } catch {
    showToast('Copy failed – please copy manually');
  }
  document.body.removeChild(ta);
}

let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  elToast.textContent = msg;
  elToast.classList.add('show');
  toastTimer = setTimeout(() => elToast.classList.remove('show'), 2200);
}

// ── Main update function ─────────────────────────────────────────

function onPasswordInput() {
  const pwd  = elPassword.value;
  const name = elUsername.value;

  if (!pwd) {
    // Hide all results, show empty state
    elValidationSec.style.display  = 'none';
    elStrengthSec.style.display    = 'none';
    elSuggestionsSec.style.display = 'none';
    elEmptyState.style.display     = '';
    return;
  }

  // Hide empty state, show results
  elEmptyState.style.display = 'none';
  elValidationSec.style.display = '';
  elStrengthSec.style.display   = '';

  // Run validation
  const results = validate(pwd, name);
  renderValidation(results);

  // Compute and render strength
  const { score, level } = computeStrength(pwd, results);
  renderStrength(score, level);

  // Suggestions when not all rules pass
  const allPass = results.every(r => r.pass);
  if (!allPass) {
    const suggestions = generateSuggestions(pwd, name);
    renderSuggestions(suggestions);
    elSuggestionsSec.style.display = '';
  } else {
    elSuggestionsSec.style.display = 'none';
  }
}

// ── Event Listeners ──────────────────────────────────────────────

elPassword.addEventListener('input', onPasswordInput);
elUsername.addEventListener('input', onPasswordInput);  // re-validates when name changes

// Generate button
elBtnGenerate.addEventListener('click', () => {
  const name = elUsername.value;

  // Animate button
  elBtnGenerate.disabled = true;
  elBtnGenerate.textContent = 'Generating…';

  setTimeout(() => {
    const generated = smartGenerate(name);
    elGeneratedPwd.textContent = generated;
    elGeneratedOut.style.display = '';

    elBtnGenerate.disabled = false;
    elBtnGenerate.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      Regenerate Password
    `;
  }, 300);
});

// Copy generated password button
elBtnCopyGen.addEventListener('click', () => {
  const text = elGeneratedPwd.textContent;
  if (text) copyToClipboard(text);
});

// Save button – copies to clipboard AND sets it as the current password
elBtnSaveGen.addEventListener('click', () => {
  const text = elGeneratedPwd.textContent;
  if (text) {
    elPassword.value = text;
    copyToClipboard(text);
    onPasswordInput();
    showToast('Password saved and copied!');
  }
});

// ── Init ─────────────────────────────────────────────────────────
// Show empty state on load
elEmptyState.style.display = '';
