// Text to the phoneme ids the tiny-tts model reads. A TypeScript port of tiny-tts 5.0.1's
// JavaScript pipeline (Apache-2.0, github.com/tronghieuit/tiny-tts): words are looked up in the
// CMU Pronouncing Dictionary, unknown ones go through the g2p_en neural model (a small GRU
// encoder–decoder), the phonemes map to the model's symbol table with their stress as a tone,
// and blanks are interleaved. Numbers and times are spelled out first. Pure.

/** The model's symbol table: an exact copy of tiny-tts's symbols.py (219 symbols). */
export const SYMBOLS = ["_","\"","(",")","*","/",":","AA","E","EE","En","N","OO","Q","V","[","\\","]","^","a","a:","aa","ae","ah","ai","an","ang","ao","aw","ay","b","by","c","ch","d","dh","dy","e","e:","eh","ei","en","eng","er","ey","f","g","gy","h","hh","hy","i","i0","i:","ia","ian","iang","iao","ie","ih","in","ing","iong","ir","iu","iy","j","jh","k","ky","l","m","my","n","ng","ny","o","o:","ong","ou","ow","oy","p","py","q","r","ry","s","sh","t","th","ts","ty","u","u:","ua","uai","uan","uang","uh","ui","un","uo","uw","v","van","ve","vn","w","x","y","z","zh","zy","~","\u00e6","\u00e7","\u00f0","\u00f8","\u014b","\u0153","\u0250","\u0251","\u0252","\u0254","\u0255","\u0259","\u025b","\u025c","\u0261","\u0263","\u0265","\u0266","\u026a","\u026b","\u026c","\u026d","\u026f","\u0272","\u0275","\u0278","\u0279","\u027e","\u0281","\u0283","\u028a","\u028c","\u028e","\u028f","\u0291","\u0292","\u029d","\u02b2","\u02c8","\u02cc","\u02d0","\u0303","\u0329","\u03b2","\u03b8","\u1100","\u1101","\u1102","\u1103","\u1104","\u1105","\u1106","\u1107","\u1108","\u1109","\u110a","\u110b","\u110c","\u110d","\u110e","\u110f","\u1110","\u1111","\u1112","\u1161","\u1162","\u1163","\u1164","\u1165","\u1166","\u1167","\u1168","\u1169","\u116a","\u116b","\u116c","\u116d","\u116e","\u116f","\u1170","\u1171","\u1172","\u1173","\u1174","\u1175","\u11a8","\u11ab","\u11ae","\u11af","\u11b7","\u11b8","\u11bc","\u3138","!","?","\u2026",",",".","'","-","\u00bf","\u00a1","SP","UNK"];
const SYM = new Map(SYMBOLS.map((s, i) => [s, i]));

export const LANG_ID = 2;
export const TONE_OFFSET = 7;
export const SAMPLE_RATE = 44100;

export type CmuDict = Record<string, string[]>;

/** The g2p_en weights, decoded. */
export interface G2pModel {
  encEmb: Float32Array[];
  encWih: Float32Array[];
  encWhh: Float32Array[];
  encBih: Float32Array;
  encBhh: Float32Array;
  decEmb: Float32Array[];
  decWih: Float32Array[];
  decWhh: Float32Array[];
  decBih: Float32Array;
  decBhh: Float32Array;
  fcW: Float32Array[];
  fcB: Float32Array;
  hidden: number;
  g2idx: Map<string, number>;
  phonemes: string[];
}

function b64ToFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4));
}

/** Decode g2p_model.json (as tiny-tts ships it). */
export function loadG2p(raw: any): G2pModel {
  const t = (name: string) => {
    const { shape, data } = raw[name];
    const flat = b64ToFloat32(data);
    if (shape.length !== 2) return flat;
    const rows: Float32Array[] = [];
    for (let i = 0; i < shape[0]; i++) rows.push(flat.subarray(i * shape[1], (i + 1) * shape[1]));
    return rows;
  };
  const m = {
    encEmb: t('enc_emb') as Float32Array[],
    encWih: t('enc_w_ih') as Float32Array[],
    encWhh: t('enc_w_hh') as Float32Array[],
    encBih: t('enc_b_ih') as Float32Array,
    encBhh: t('enc_b_hh') as Float32Array,
    decEmb: t('dec_emb') as Float32Array[],
    decWih: t('dec_w_ih') as Float32Array[],
    decWhh: t('dec_w_hh') as Float32Array[],
    decBih: t('dec_b_ih') as Float32Array,
    decBhh: t('dec_b_hh') as Float32Array,
    fcW: t('fc_w') as Float32Array[],
    fcB: t('fc_b') as Float32Array,
    hidden: raw.enc_w_hh.shape[1],
    g2idx: new Map<string, number>((raw.graphemes as string[]).map((g, i) => [g, i])),
    phonemes: raw.phonemes as string[],
  };
  return m;
}

function gru(x: Float32Array, h: Float32Array, wih: Float32Array[], whh: Float32Array[], bih: Float32Array, bhh: Float32Array, n: number): Float32Array {
  const ih = new Float32Array(3 * n);
  const hh = new Float32Array(3 * n);
  for (let i = 0; i < 3 * n; i++) {
    let a = bih[i];
    const r = wih[i];
    for (let j = 0; j < x.length; j++) a += x[j] * r[j];
    ih[i] = a;
    let b = bhh[i];
    const q = whh[i];
    for (let j = 0; j < h.length; j++) b += h[j] * q[j];
    hh[i] = b;
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = 1 / (1 + Math.exp(-(ih[i] + hh[i])));
    const z = 1 / (1 + Math.exp(-(ih[n + i] + hh[n + i])));
    const c = Math.tanh(ih[2 * n + i] + r * hh[2 * n + i]);
    out[i] = (1 - z) * c + z * h[i];
  }
  return out;
}

/** g2p_en's neural guess for a word the dictionary doesn't know. */
export function predict(m: G2pModel, word: string): string[] {
  const n = m.hidden;
  const unk = m.g2idx.get('<unk>') ?? 1;
  let h: Float32Array<ArrayBufferLike> = new Float32Array(n);
  for (const ch of [...word.split(''), '</s>']) h = gru(m.encEmb[m.g2idx.get(ch) ?? unk], h, m.encWih, m.encWhh, m.encBih, m.encBhh, n);
  let dec: Float32Array<ArrayBufferLike> = m.decEmb[2];
  const out: string[] = [];
  for (let step = 0; step < 20; step++) {
    h = gru(dec, h, m.decWih, m.decWhh, m.decBih, m.decBhh, n);
    let best = -Infinity;
    let idx = 0;
    for (let j = 0; j < m.fcW.length; j++) {
      let v = m.fcB[j];
      const r = m.fcW[j];
      for (let k = 0; k < n; k++) v += h[k] * r[k];
      if (v > best) {
        best = v;
        idx = j;
      }
    }
    if (idx === 3) break;
    out.push(m.phonemes[idx] ?? '<unk>');
    dec = m.decEmb[idx];
  }
  return out;
}

// ── Spelling out numbers and times ──

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberWords(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n < 0) return `minus ${numberWords(-n)}`;
  n = Math.floor(n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ''}`;
  if (n < 1_000_000) return `${numberWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${numberWords(n % 1000)}` : ''}`;
  return String(n).split('').map((d) => ONES[Number(d)]).join(' ');
}

/** "3:30pm" → "three thirty p m", "45m" → "forty five minutes", "1h 30m" → "one hour thirty minutes". */
export function normalize(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/gi, (_, h, m, ap) => `${numberWords(+h)} ${+m === 0 ? '' : +m < 10 ? `oh ${numberWords(+m)}` : numberWords(+m)} ${ap.toLowerCase()} m`)
    .replace(/(\d{1,2})\s*([ap])\.?m\.?\b/gi, (_, h, ap) => `${numberWords(+h)} ${ap.toLowerCase()} m`)
    .replace(/(\d{1,2}):(\d{2})/g, (_, h, m) => `${numberWords(+h)} ${+m === 0 ? "o'clock" : +m < 10 ? `oh ${numberWords(+m)}` : numberWords(+m)}`)
    .replace(/(\d+)\s*h\s*(\d+)\s*m\b/gi, (_, h, m) => `${numberWords(+h)} ${+h === 1 ? 'hour' : 'hours'} ${numberWords(+m)} minutes`)
    .replace(/(\d+)\s*(?:h|hr|hrs)\b/gi, (_, h) => `${numberWords(+h)} ${+h === 1 ? 'hour' : 'hours'}`)
    .replace(/(\d+)\s*(?:m|min|mins)\b/gi, (_, m) => `${numberWords(+m)} ${+m === 1 ? 'minute' : 'minutes'}`)
    .replace(/(\d+)%/g, (_, n) => `${numberWords(+n)} percent`)
    .replace(/\d+/g, (d) => numberWords(+d))
    .replace(/&/g, ' and ')
    .replace(/[“”"()[\]{}*_#~`|<>]/g, ' ')
    .replace(/[—–]/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Phonemes ──

const parsePhone = (p: string): [string, number] => {
  const m = /(\d)$/.exec(p);
  return m ? [p.slice(0, -1).toLowerCase(), Number(m[1]) + 1] : [p.toLowerCase(), 0];
};

const REP: Record<string, string> = { '：': ',', '；': ',', '，': ',', '。': '.', '！': '!', '？': '?', '\n': '.', '·': ',', '、': ',', '...': '…', v: 'V' };
const mapPhoneme = (ph: string) => REP[ph] ?? (SYM.has(ph) ? ph : 'UNK');

export function toPhonemes(text: string, cmu: CmuDict, g2p: G2pModel | null): { phones: string[]; tones: number[] } {
  const phones: string[] = ['_'];
  const tones: number[] = [0];
  const push = (list: string[]) => {
    for (const raw of list) {
      const [p, t] = parsePhone(raw);
      phones.push(mapPhoneme(p));
      tones.push(t);
    }
  };
  const words = normalize(text).toLowerCase().split(/\s+/).filter(Boolean);
  for (const word of words) {
    const lead = /^[^a-z0-9]*/.exec(word)![0];
    const trail = /[^a-z0-9']*$/.exec(word)![0];
    const core = word.slice(lead.length, word.length - trail.length);
    for (const ch of lead) {
      phones.push(mapPhoneme(ch));
      tones.push(0);
    }
    if (core) {
      const parts = core.split("'");
      parts.forEach((part, i) => {
        if (i > 0) {
          phones.push("'");
          tones.push(0);
        }
        if (!part) return;
        const known = cmu[part.toUpperCase()];
        if (known) return push(known);
        const guess = g2p ? predict(g2p, part) : [];
        if (guess.length) return push(guess);
        for (const ch of part) {
          phones.push(mapPhoneme(ch));
          tones.push(0);
        }
      });
    }
    for (const ch of trail) {
      phones.push(mapPhoneme(ch));
      tones.push(0);
    }
  }
  phones.push('_');
  tones.push(0);
  return { phones, tones };
}

/** The model's inputs: phoneme, tone and language ids, with blanks between them. */
export function toIds(text: string, cmu: CmuDict, g2p: G2pModel | null): { x: number[]; tone: number[]; lang: number[] } {
  const { phones, tones } = toPhonemes(text, cmu, g2p);
  const n = phones.length;
  const x = new Array(2 * n + 1).fill(0);
  const tone = new Array(2 * n + 1).fill(0);
  const lang = new Array(2 * n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    x[1 + 2 * i] = SYM.get(phones[i]) ?? SYM.get('UNK')!;
    tone[1 + 2 * i] = tones[i] + TONE_OFFSET;
    lang[1 + 2 * i] = LANG_ID;
  }
  return { x, tone, lang };
}
