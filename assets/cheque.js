// =====================================================================
//  Cheque renderer (3.5" × 9.5") + Thai baht text
//  Every printed element is a separate item (show/hide, x/y mm, width,
//  font size, bold …). AC crossing / bearer strike-through are shown
//  according to the crossing chosen when printing (AC or Non-AC).
// =====================================================================
import { esc } from './envelope.js';

export const CHEQUE = { w: 241.3, h: 88.9, label: 'เช็ค 3.5" × 9.5"' };
const r05 = (n) => Math.round(n * 2) / 2;

// ---------------------------------------------------------------------
//  Thai baht text  (12500.5 → "หนึ่งหมื่นสองพันห้าร้อยบาทห้าสิบสตางค์")
// ---------------------------------------------------------------------
const DIGIT = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function readGroup(str, hasHigher) {
  // str: up to 6 digits, no leading zeros required
  let out = '';
  const len = str.length;
  for (let i = 0; i < len; i++) {
    const d = Number(str[i]); const pos = len - i - 1;
    if (!d) continue;
    if (pos === 1 && d === 1) out += 'สิบ';
    else if (pos === 1 && d === 2) out += 'ยี่สิบ';
    else if (pos === 0 && d === 1 && (hasHigher || Number(str.slice(0, -1)) > 0)) out += 'เอ็ด';
    else out += DIGIT[d] + PLACE[pos];
  }
  return out;
}
function readNumber(str) {
  str = str.replace(/^0+/, '');
  if (!str) return '';
  if (str.length <= 6) return readGroup(str, false);
  const head = str.slice(0, -6); const tail = str.slice(-6);
  return readNumber(head) + 'ล้าน' + readGroup(tail.replace(/^0+/, ''), true);
}
/** Thai text for an amount in baht (2 decimals). */
export function bahtText(amount) {
  const satangTotal = Math.round(Math.abs(Number(amount) || 0) * 100);
  const baht = String(Math.floor(satangTotal / 100));
  const satang = satangTotal % 100;
  const b = readNumber(baht);
  const s = satang ? readGroup(String(satang), false) : '';
  if (!b && !s) return 'ศูนย์บาทถ้วน';
  return (b ? `${b}บาท` : '') + (s ? `${s}สตางค์` : 'ถ้วน');
}
export const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_MONTH_S = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** date 'YYYY-MM-DD' → parts for printing */
export function chequeDateParts(iso, era = 'be') {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!y) return null;
  const yy = era === 'ce' ? y : y + 543;
  return { d: String(d).padStart(2, '0'), m: String(m).padStart(2, '0'), y: String(yy), month: TH_MONTH[m - 1], monthS: TH_MONTH_S[m - 1] };
}

// ---------------------------------------------------------------------
//  Items
// ---------------------------------------------------------------------
export const CHQ_ITEMS = [
  { key: 'ac_mark', label: 'ขีดคร่อม A/C Payee Only', group: 'ขีดคร่อม / ขีดฆ่า', kind: 'crossing' },
  { key: 'bearer_strike', label: 'เส้นขีดฆ่า "หรือผู้ถือ"', group: 'ขีดคร่อม / ขีดฆ่า', kind: 'line' },
  { key: 'stub_ac_mark', label: 'ขีดคร่อม A/C ที่ต้นขั้ว', group: 'ขีดคร่อม / ขีดฆ่า', kind: 'crossing' },
  { key: 'date', label: 'วันที่', group: 'ตัวเช็ค', kind: 'date' },
  { key: 'payee', label: 'จ่าย (ชื่อผู้รับเงิน)', group: 'ตัวเช็ค', kind: 'text' },
  { key: 'amount_words', label: 'จำนวนเงิน (ตัวอักษร)', group: 'ตัวเช็ค', kind: 'text' },
  { key: 'amount_num', label: 'จำนวนเงิน (ตัวเลข)', group: 'ตัวเช็ค', kind: 'text' },
  { key: 'detail', label: 'รายการ / หมายเหตุ', group: 'อื่น ๆ', kind: 'text' },
  { key: 'cheque_no', label: 'เลขที่เช็ค', group: 'อื่น ๆ', kind: 'text' },
  { key: 'stub_date', label: 'ต้นขั้ว: วันที่', group: 'ต้นขั้ว', kind: 'date' },
  { key: 'stub_payee', label: 'ต้นขั้ว: จ่าย', group: 'ต้นขั้ว', kind: 'text' },
  { key: 'stub_amount', label: 'ต้นขั้ว: จำนวนเงิน', group: 'ต้นขั้ว', kind: 'text' },
  { key: 'stub_detail', label: 'ต้นขั้ว: รายการ', group: 'ต้นขั้ว', kind: 'text' },
];
export const chqItemDef = (key) => CHQ_ITEMS.find((d) => d.key === key) || { key, label: 'ข้อความเพิ่มเติม', group: 'ข้อความเพิ่มเติม', kind: 'custom' };

// ---------------------------------------------------------------------
//  Fonts available per item (TH SarabunPSK is the default)
// ---------------------------------------------------------------------
export const CHQ_FONTS = [
  { id: 'psk', label: 'TH SarabunPSK', family: "'TH SarabunPSK'" },
  { id: 'sarabun', label: 'TH Sarabun', family: "'TH Sarabun', 'TH SarabunPSK'" },
  { id: 'it9', label: 'TH SarabunIT๙', family: "'TH SarabunIT๙', 'TH SarabunPSK'" },
  { id: 'code39', label: 'บาร์โค้ด Code 39 (IDAutomation)', family: "'IDAutomation Code39'", barcode: 'code39' },
  { id: 'code128', label: 'บาร์โค้ด Code 128', family: "'Code 128'", barcode: 'code128' },
];
export const chqFont = (id) => CHQ_FONTS.find((f) => f.id === id) || CHQ_FONTS[0];

/** Code 39: *DATA* (A–Z 0–9 - . space $ / + %). */
export function code39(text) {
  const t = String(text ?? '').toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '');
  return t ? `*${t}*` : '';
}
/** Code 128 (font "Code 128": value v → char v+32, v ≥ 95 → v+100; value 0 → char 207). Uses set C for digit pairs. */
export function code128(text) {
  const s = String(text ?? '').replace(/[^\x20-\x7e]/g, '');
  if (!s) return '';
  const vals = [];
  let i = 0;
  const digitsAt = (k) => { let n = 0; while (k + n < s.length && /\d/.test(s[k + n])) n++; return n; };
  let set = digitsAt(0) >= 4 && digitsAt(0) % 2 === 0 ? 'C' : (digitsAt(0) === s.length && s.length >= 2 ? 'C' : 'B');
  vals.push(set === 'C' ? 105 : 104);
  while (i < s.length) {
    if (set === 'C') {
      if (digitsAt(i) >= 2) { vals.push(Number(s.substr(i, 2))); i += 2; continue; }
      vals.push(100); set = 'B'; continue;          // switch to B
    }
    const d = digitsAt(i);
    if (d >= 4 && d % 2 === 0) { vals.push(99); set = 'C'; continue; } // switch to C
    vals.push(s.charCodeAt(i) - 32); i++;
  }
  let sum = vals[0];
  for (let k = 1; k < vals.length; k++) sum += vals[k] * k;
  vals.push(sum % 103, 106);
  return vals.map((v) => String.fromCharCode(v === 0 ? 207 : v < 95 ? v + 32 : v + 100)).join('');
}

// ---------------------------------------------------------------------
//  Data for extra items: fixed text, a piece of the cheque data, or a field typed in the cheque form
// ---------------------------------------------------------------------
export const CHQ_SOURCES = [
  { id: 'date:dd', group: 'วันที่ในเช็ค', label: 'วัน (2 หลัก เช่น 09)' },
  { id: 'date:d', group: 'วันที่ในเช็ค', label: 'วัน (เช่น 9)' },
  { id: 'date:mm', group: 'วันที่ในเช็ค', label: 'เดือน (2 หลัก เช่น 03)' },
  { id: 'date:m', group: 'วันที่ในเช็ค', label: 'เดือน (เช่น 3)' },
  { id: 'date:month', group: 'วันที่ในเช็ค', label: 'เดือน (ชื่อเต็ม เช่น มีนาคม)' },
  { id: 'date:mon', group: 'วันที่ในเช็ค', label: 'เดือน (ชื่อย่อ เช่น มี.ค.)' },
  { id: 'date:yyyy', group: 'วันที่ในเช็ค', label: 'ปี พ.ศ. (4 หลัก)' },
  { id: 'date:yy', group: 'วันที่ในเช็ค', label: 'ปี พ.ศ. (2 หลัก)' },
  { id: 'date:ce', group: 'วันที่ในเช็ค', label: 'ปี ค.ศ. (4 หลัก)' },
  { id: 'payee', group: 'ข้อมูลเช็ค', label: 'ชื่อผู้รับเงิน' },
  { id: 'amount', group: 'ข้อมูลเช็ค', label: 'จำนวนเงิน (ตัวเลข 24,575.00)' },
  { id: 'amount_words', group: 'ข้อมูลเช็ค', label: 'จำนวนเงิน (ตัวอักษร)' },
  { id: 'baht', group: 'ข้อมูลเช็ค', label: 'จำนวนเงิน — เฉพาะบาท (24,575)' },
  { id: 'satang', group: 'ข้อมูลเช็ค', label: 'จำนวนเงิน — เฉพาะสตางค์ (00)' },
  { id: 'detail', group: 'ข้อมูลเช็ค', label: 'รายการ / รายละเอียด' },
  { id: 'cheque_no', group: 'ข้อมูลเช็ค', label: 'เลขที่เช็ค' },
  { id: 'book_no', group: 'ข้อมูลเช็ค', label: 'เล่มที่' },
  { id: 'account', group: 'ข้อมูลเช็ค', label: 'ชื่อบัญชี' },
  { id: 'bank', group: 'ข้อมูลเช็ค', label: 'ชื่อธนาคาร' },
  { id: 'created_by_name', group: 'ข้อมูลเช็ค', label: 'ผู้ออกเช็ค' },
  { id: 'fiscal_year', group: 'เงินงบประมาณ', label: 'ปีงบประมาณ' },
  { id: 'bill_no', group: 'เงินงบประมาณ', label: 'เลขที่ฎีกา' },
  { id: 'budget_source', group: 'เงินงบประมาณ', label: 'รหัสแหล่งเงิน' },
  { id: 'activity_code', group: 'เงินงบประมาณ', label: 'รหัสกิจกรรม' },
  { id: 'job_no', group: 'เงินงบประมาณ', label: 'รหัสงาน' },
];
export const chqSource = (id) => CHQ_SOURCES.find((x) => x.id === id) || null;
export const FIELD_TYPES = { text: 'ข้อความ', number: 'ตัวเลข', money: 'จำนวนเงิน', date: 'วันที่' };

/** Label shown in the editor for an item. */
export function chqItemLabel(key, it) {
  if (!key.startsWith('custom_')) return chqItemDef(key).label;
  if (it?.src && it.src.startsWith('field:')) return `ช่องกรอก: ${it.field?.label || it.src.slice(6)}`;
  if (it?.src && it.src !== 'text') return chqSource(it.src)?.label || it.src;
  return `ข้อความ: ${(it?.text || '(ว่าง)').slice(0, 16)}`;
}

/** Value of an extra field typed in the cheque form (cheques.extra = { key: { label, value } }). */
const extraVal = (c, key) => { const e = c.extra?.[key]; return e && typeof e === 'object' ? e.value : e; };

function fmtField(v, type) {
  if (v === null || v === undefined || v === '') return '';
  if (type === 'money') return money(v);
  if (type === 'date') { const p = chequeDateParts(v); return p ? `${Number(p.d)} ${p.month} ${p.y}` : String(v); }
  return String(v);
}

function sourceValue(it, c, opts) {
  const src = it.src || 'text';
  if (src === 'text') return String(it.text ?? '');
  if (src.startsWith('field:')) { const v = fmtField(extraVal(c, src.slice(6)), it.field?.type); return v || (opts.editor ? `[${it.field?.label || 'ช่องกรอก'}]` : ''); }
  if (src.startsWith('date:')) {
    const p = chequeDateParts(c.cheque_date, src === 'date:ce' ? 'ce' : 'be'); if (!p) return '';
    switch (src) {
      case 'date:dd': return p.d; case 'date:d': return String(Number(p.d));
      case 'date:mm': return p.m; case 'date:m': return String(Number(p.m));
      case 'date:month': return p.month; case 'date:mon': return p.monthS;
      case 'date:yy': return p.y.slice(-2); default: return p.y;
    }
  }
  const amt = Number(c.amount || 0);
  switch (src) {
    case 'payee': return c.payee || '';
    case 'amount': return money(amt);
    case 'amount_words': return bahtText(amt);
    case 'baht': return Math.trunc(amt).toLocaleString('en-US');
    case 'satang': return String(Math.round((amt - Math.trunc(amt)) * 100)).padStart(2, '0');
    case 'account': return c.account_name || '';
    case 'bank': return c.bank_name || '';
    default: { const v = c[src]; return v === null || v === undefined ? (opts.editor ? `[${chqSource(src)?.label || src}]` : '') : String(v); }
  }
}

/** Puts each character in its own box (it.cell mm wide) — for date / number boxes. */
const cellsHtml = (text, it) => `<span class="chq-cells">${[...text].map((ch) => `<span style="width:${it.cell}mm">${esc(ch)}</span>`).join('')}</span>`;

/**
 * Split the date item into separate day / month / year items that can be placed anywhere.
 * Returns the new item keys (the original item is hidden, not deleted).
 */
export function splitDateItem(layout, key) {
  const it = layout.items[key]; if (!it) return [];
  const boxes = it.format === 'boxes';
  const cell = it.cell || 5.5, gap = it.gap || 0, ch = it.size * 0.3528 * 0.48; // ~ width of one digit
  const parts = boxes
    ? [['date:dd', it.x], ['date:mm', it.x + 2 * cell + gap], [it.era === 'ce' ? 'date:ce' : 'date:yyyy', it.x + 4 * cell + 2 * gap]]
    : it.format === 'long'
      ? [['date:d', it.x], ['date:month', it.x + ch * 3], [it.era === 'ce' ? 'date:ce' : 'date:yyyy', it.x + ch * 14]]
      : [[it.format === 'dmy' ? 'date:d' : 'date:dd', it.x], [it.format === 'dmy' ? 'date:m' : 'date:mm', it.x + ch * 4], [it.era === 'ce' ? 'date:ce' : 'date:yyyy', it.x + ch * 8]];
  const stamp = Date.now().toString(36);
  const keys = parts.map(([src, x], i) => {
    const k = `custom_${stamp}${i}`;
    const w = boxes ? cell * (src.startsWith('date:y') || src === 'date:ce' ? 4 : 2) : (src === 'date:month' ? 25 : src.includes('y') || src === 'date:ce' ? 14 : 8);
    layout.items[k] = { show: true, when: it.when || 'always', src, x: Math.round(x * 10) / 10, y: it.y, w: Math.round(w * 10) / 10, size: it.size, bold: !!it.bold, italic: !!it.italic, font: it.font, wrap: false, align: 'left', from: key, ...(boxes ? { cell } : {}) };
    return k;
  });
  it.show = false;
  return keys;
}

/**
 * Standard presets measured on the real blank cheques (scans in assets/cheques/*.jpg, whole sheet 9.5" x 3.5"
 * including the stub on the left): every value sits on the printed line / inside the printed date boxes.
 */
export const CHEQUE_PRESETS = {
 "ktb_ac": {
  "bank": "KTB",
  "crossing": "ac",
  "label": "กรุงไทย A/C",
  "source": "เช็คจริง",
  "layout": {
   "version": 2,
   "feed": "landscape",
   "offset": {
    "x": 0,
    "y": 0
   },
   "bg": null,
   "bgOpacity": 0.6,
   "items": {
    "stub_date": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 25.5,
     "y": 2.9,
     "size": 13,
     "w": 32.8,
     "format": "dmy",
     "era": "be"
    },
    "stub_payee": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 25.5,
     "y": 8.9,
     "size": 12,
     "w": 32.8
    },
    "stub_amount": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "",
     "suffix": "",
     "x": 25.5,
     "y": 14.5,
     "size": 13,
     "w": 32.8
    },
    "stub_detail": {
     "show": false,
     "x": 20,
     "y": 63,
     "size": 12,
     "w": 38,
     "bold": true,
     "wrap": true,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "date": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 183.6,
     "y": 3.7,
     "size": 15,
     "w": 50.6,
     "format": "boxes",
     "era": "be",
     "cell": 6.33,
     "gap": 0
    },
    "payee": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 83,
     "y": 21.2,
     "size": 16,
     "w": 137.5,
     "fill": "dashed",
     "fillDy": 0
    },
    "amount_words": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "**",
     "suffix": "**",
     "x": 95,
     "y": 30.3,
     "size": 16,
     "w": 72.5
    },
    "amount_num": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "**",
     "suffix": "**",
     "x": 178.5,
     "y": 36.9,
     "size": 17,
     "w": 55
    },
    "ac_mark": {
     "show": true,
     "when": "ac",
     "size": 12,
     "bold": true,
     "text": "A/C PAYEE ONLY",
     "lines": true,
     "color": "#c8102e",
     "angle": -8.5,
     "x": 126,
     "y": 13.6,
     "w": 40
    },
    "stub_ac_mark": {
     "show": true,
     "when": "ac",
     "size": 12,
     "bold": true,
     "text": "A/C PAYEE ONLY",
     "lines": true,
     "color": "#c8102e",
     "angle": -4,
     "x": 21,
     "y": 63.6,
     "w": 35
    },
    "bearer_strike": {
     "show": true,
     "when": "always",
     "x": 222.8,
     "y": 24.6,
     "w": 12.6,
     "thick": 0.35,
     "double": false,
     "gap": 0.9
    },
    "detail": {
     "show": false,
     "x": 96,
     "y": 50,
     "size": 14,
     "w": 100,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "cheque_no": {
     "show": false,
     "x": 96,
     "y": 55,
     "size": 14,
     "w": 40,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    }
   }
  }
 },
 "ktb_nonac": {
  "bank": "KTB",
  "crossing": "nonac",
  "label": "กรุงไทย Non-AC",
  "source": "เช็คจริง",
  "layout": {
   "version": 2,
   "feed": "landscape",
   "offset": {
    "x": 0,
    "y": 0
   },
   "bg": null,
   "bgOpacity": 0.6,
   "items": {
    "stub_date": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 25.5,
     "y": 2.9,
     "size": 13,
     "w": 32.8,
     "format": "dmy",
     "era": "be"
    },
    "stub_payee": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 25.5,
     "y": 8.9,
     "size": 12,
     "w": 32.8
    },
    "stub_amount": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "",
     "suffix": "",
     "x": 25.5,
     "y": 14.5,
     "size": 13,
     "w": 32.8
    },
    "stub_detail": {
     "show": false,
     "x": 20,
     "y": 63,
     "size": 12,
     "w": 38,
     "bold": true,
     "wrap": true,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "date": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 183.6,
     "y": 3.7,
     "size": 15,
     "w": 50.6,
     "format": "boxes",
     "era": "be",
     "cell": 6.33,
     "gap": 0
    },
    "payee": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 83,
     "y": 21.2,
     "size": 16,
     "w": 137.5,
     "fill": "dashed",
     "fillDy": 0
    },
    "amount_words": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "**",
     "suffix": "**",
     "x": 95,
     "y": 30.3,
     "size": 16,
     "w": 72.5
    },
    "amount_num": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "**",
     "suffix": "**",
     "x": 178.5,
     "y": 36.9,
     "size": 17,
     "w": 55
    },
    "ac_mark": {
     "show": false,
     "when": "ac",
     "size": 12,
     "bold": true,
     "text": "A/C PAYEE ONLY",
     "lines": true,
     "color": "#c8102e",
     "angle": -8.5,
     "x": 126,
     "y": 13.6,
     "w": 40
    },
    "stub_ac_mark": {
     "show": false,
     "when": "ac",
     "size": 12,
     "bold": true,
     "text": "A/C PAYEE ONLY",
     "lines": true,
     "color": "#c8102e",
     "angle": -4,
     "x": 21,
     "y": 63.6,
     "w": 35
    },
    "bearer_strike": {
     "show": true,
     "when": "always",
     "x": 222.8,
     "y": 24.6,
     "w": 12.6,
     "thick": 0.35,
     "double": true,
     "gap": 3.2
    },
    "detail": {
     "show": false,
     "x": 96,
     "y": 50,
     "size": 14,
     "w": 100,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "cheque_no": {
     "show": false,
     "x": 96,
     "y": 55,
     "size": 14,
     "w": 40,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    }
   }
  }
 },
 "kbank_ac": {
  "bank": "KBANK",
  "crossing": "ac",
  "label": "กสิกรไทย A/C",
  "source": "เช็คจริง",
  "layout": {
   "version": 2,
   "feed": "landscape",
   "offset": {
    "x": 0,
    "y": 0
   },
   "bg": null,
   "bgOpacity": 0.6,
   "items": {
    "stub_date": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 35,
     "y": 18.6,
     "size": 13,
     "w": 23.8,
     "format": "dmy",
     "era": "be"
    },
    "stub_payee": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 35,
     "y": 25.4,
     "size": 12,
     "w": 23.8
    },
    "stub_amount": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "",
     "suffix": "",
     "x": 35,
     "y": 31.9,
     "size": 13,
     "w": 23.8
    },
    "stub_detail": {
     "show": true,
     "bold": true,
     "wrap": true,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 18.5,
     "y": 44.5,
     "size": 12,
     "w": 40,
     "lh": 1.5590000000000002
    },
    "date": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 184.8,
     "y": 4.1,
     "size": 15,
     "w": 50.7,
     "format": "boxes",
     "era": "be",
     "cell": 6.34,
     "gap": 0
    },
    "payee": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 95,
     "y": 21.2,
     "size": 16,
     "w": 119.5,
     "fill": "dashed",
     "fillDy": 0
    },
    "amount_words": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "**",
     "suffix": "**",
     "x": 96,
     "y": 29.3,
     "size": 16,
     "w": 138.5
    },
    "amount_num": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "**",
     "suffix": "**",
     "x": 178.5,
     "y": 37.2,
     "size": 17,
     "w": 55
    },
    "ac_mark": {
     "show": true,
     "when": "ac",
     "size": 12,
     "bold": true,
     "text": "A/C PAYEE ONLY",
     "lines": true,
     "color": "#c8102e",
     "angle": -8.5,
     "x": 107,
     "y": 8,
     "w": 36
    },
    "stub_ac_mark": {
     "show": false,
     "when": "ac",
     "size": 12,
     "bold": true,
     "text": "A/C PAYEE ONLY",
     "lines": true,
     "color": "#c8102e",
     "angle": -8.5,
     "x": 20,
     "y": 63,
     "w": 36
    },
    "bearer_strike": {
     "show": true,
     "when": "always",
     "x": 224.6,
     "y": 21.4,
     "w": 11.4,
     "thick": 0.35,
     "double": false,
     "gap": 0.9
    },
    "detail": {
     "show": false,
     "x": 96,
     "y": 50,
     "size": 14,
     "w": 100,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "cheque_no": {
     "show": false,
     "x": 96,
     "y": 55,
     "size": 14,
     "w": 40,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    }
   }
  }
 },
 "kbank_nonac": {
  "bank": "KBANK",
  "crossing": "nonac",
  "label": "กสิกรไทย Non-AC",
  "source": "เช็คจริง",
  "layout": {
   "version": 2,
   "feed": "landscape",
   "offset": {
    "x": 0,
    "y": 0
   },
   "bg": null,
   "bgOpacity": 0.6,
   "items": {
    "stub_date": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 35,
     "y": 18.6,
     "size": 13,
     "w": 23.8,
     "format": "dmy",
     "era": "be"
    },
    "stub_payee": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 35,
     "y": 25.4,
     "size": 12,
     "w": 23.8
    },
    "stub_amount": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "",
     "suffix": "",
     "x": 35,
     "y": 31.9,
     "size": 13,
     "w": 23.8
    },
    "stub_detail": {
     "show": true,
     "bold": true,
     "wrap": true,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 18.5,
     "y": 44.5,
     "size": 12,
     "w": 40,
     "lh": 1.5590000000000002
    },
    "date": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 184.8,
     "y": 4.1,
     "size": 15,
     "w": 50.7,
     "format": "boxes",
     "era": "be",
     "cell": 6.34,
     "gap": 0
    },
    "payee": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "x": 95,
     "y": 21.2,
     "size": 16,
     "w": 119.5,
     "fill": "dashed",
     "fillDy": 0
    },
    "amount_words": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "**",
     "suffix": "**",
     "x": 96,
     "y": 29.3,
     "size": 16,
     "w": 138.5
    },
    "amount_num": {
     "show": true,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "**",
     "suffix": "**",
     "x": 178.5,
     "y": 37.2,
     "size": 17,
     "w": 55
    },
    "ac_mark": {
     "show": false,
     "when": "ac",
     "size": 12,
     "bold": true,
     "text": "A/C PAYEE ONLY",
     "lines": true,
     "color": "#c8102e",
     "angle": -8.5,
     "x": 107,
     "y": 8,
     "w": 36
    },
    "stub_ac_mark": {
     "show": false,
     "when": "ac",
     "size": 12,
     "bold": true,
     "text": "A/C PAYEE ONLY",
     "lines": true,
     "color": "#c8102e",
     "angle": -8.5,
     "x": 20,
     "y": 63,
     "w": 36
    },
    "bearer_strike": {
     "show": false,
     "when": "always",
     "x": 216,
     "y": 21.4,
     "w": 20,
     "thick": 0.35,
     "double": true,
     "gap": 3.5
    },
    "detail": {
     "show": false,
     "x": 96,
     "y": 50,
     "size": 14,
     "w": 100,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "cheque_no": {
     "show": false,
     "x": 96,
     "y": 55,
     "size": 14,
     "w": 40,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    }
   }
  }
 }
};


/** Blank cheque pictures used as the background guide in the form editor (never printed). */
export const BANK_BG = { KTB: 'assets/cheques/ktb.jpg', KBANK: 'assets/cheques/kbank.jpg' };

/** Older presets measured from the Access reports (Rcheck1a/2a = กรุงไทย, Rcheck1b/2b = กสิกรไทย; 1 = A/C, 2 = Non-AC). */
export const ACCESS_PRESETS = {
 "ktb_ac": {
  "bank": "KTB",
  "crossing": "ac",
  "label": "กรุงไทย A/C",
  "source": "Rcheck1a",
  "layout": {
   "version": 2,
   "feed": "landscape",
   "offset": {
    "x": 0,
    "y": 0
   },
   "bg": null,
   "bgOpacity": 0.55,
   "items": {
    "stub_date": {
     "show": true,
     "x": 24.4,
     "y": 25.8,
     "w": 40,
     "size": 13.5,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "format": "dmy",
     "era": "be"
    },
    "stub_payee": {
     "show": true,
     "x": 23.6,
     "y": 32.3,
     "w": 46,
     "size": 13,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "stub_amount": {
     "show": true,
     "x": 35.6,
     "y": 52.1,
     "w": 24,
     "size": 14.5,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "",
     "suffix": ""
    },
    "stub_detail": {
     "show": true,
     "x": 21.5,
     "y": 39.1,
     "w": 35.3,
     "size": 11,
     "bold": true,
     "wrap": true,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "lh": 1.35
    },
    "date": {
     "show": true,
     "x": 196,
     "y": 12.8,
     "w": 40,
     "size": 16.5,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "format": "dmy",
     "era": "be"
    },
    "payee": {
     "show": true,
     "x": 81.6,
     "y": 29.6,
     "w": 140.5,
     "size": 18,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "fill": "dashed",
     "fillDy": -0.7
    },
    "amount_words": {
     "show": true,
     "x": 81.4,
     "y": 38,
     "w": 140.3,
     "size": 16.5,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "**",
     "suffix": "**"
    },
    "amount_num": {
     "show": true,
     "x": 141.8,
     "y": 46.9,
     "w": 40,
     "size": 17.5,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "",
     "suffix": ""
    },
    "ac_mark": {
     "show": true,
     "when": "ac",
     "x": 112.1,
     "y": 13.1,
     "w": 35.2,
     "angle": -8.5,
     "size": 12,
     "bold": true,
     "text": "A/C PAYEE ONLY",
     "lines": true,
     "color": "#c8102e"
    },
    "stub_ac_mark": {
     "show": true,
     "when": "ac",
     "x": 24.4,
     "y": 18.2,
     "w": 35.2,
     "angle": -8.5,
     "size": 12,
     "bold": true,
     "text": "A/C PAYEE ONLY",
     "lines": true,
     "color": "#c8102e"
    },
    "bearer_strike": {
     "show": true,
     "when": "always",
     "x": 222.6,
     "y": 33.1,
     "w": 11.3,
     "thick": 0.3,
     "double": false,
     "gap": 0.9
    },
    "detail": {
     "show": false,
     "x": 80,
     "y": 60,
     "w": 120,
     "size": 12,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "cheque_no": {
     "show": false,
     "x": 180,
     "y": 70,
     "w": 40,
     "size": 12,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    }
   }
  }
 },
 "ktb_nonac": {
  "bank": "KTB",
  "crossing": "nonac",
  "label": "กรุงไทย (Non-AC)",
  "source": "Rcheck2a",
  "layout": {
   "version": 2,
   "feed": "landscape",
   "offset": {
    "x": 0,
    "y": 0
   },
   "bg": null,
   "bgOpacity": 0.55,
   "items": {
    "stub_date": {
     "show": true,
     "x": 31.2,
     "y": 27.1,
     "w": 40,
     "size": 13.5,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "format": "dmy",
     "era": "be"
    },
    "stub_payee": {
     "show": true,
     "x": 27.5,
     "y": 33.5,
     "w": 46,
     "size": 13,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "stub_amount": {
     "show": true,
     "x": 23.5,
     "y": 40.4,
     "w": 24,
     "size": 14.5,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "",
     "suffix": ""
    },
    "stub_detail": {
     "show": true,
     "x": 17.4,
     "y": 53.3,
     "w": 38.9,
     "size": 12,
     "bold": true,
     "wrap": true,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "lh": 1.4
    },
    "date": {
     "show": true,
     "x": 196,
     "y": 12.9,
     "w": 40,
     "size": 16,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "format": "dmy",
     "era": "be"
    },
    "payee": {
     "show": true,
     "x": 95.6,
     "y": 28.5,
     "w": 126.7,
     "size": 18,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "fill": "dashed",
     "fillDy": -0.8
    },
    "amount_words": {
     "show": true,
     "x": 96.4,
     "y": 37,
     "w": 125.4,
     "size": 17.5,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "**",
     "suffix": "**"
    },
    "amount_num": {
     "show": true,
     "x": 159.8,
     "y": 47.2,
     "w": 40,
     "size": 17.5,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "",
     "suffix": ""
    },
    "ac_mark": {
     "show": false,
     "when": "ac"
    },
    "stub_ac_mark": {
     "show": false,
     "when": "ac"
    },
    "bearer_strike": {
     "show": true,
     "when": "always",
     "x": 222.7,
     "y": 30,
     "w": 12.3,
     "thick": 0.3,
     "double": true,
     "gap": 3.2
    },
    "detail": {
     "show": false,
     "x": 80,
     "y": 60,
     "w": 120,
     "size": 12,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "cheque_no": {
     "show": false,
     "x": 180,
     "y": 70,
     "w": 40,
     "size": 12,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    }
   }
  }
 },
 "kbank_ac": {
  "bank": "KBANK",
  "crossing": "ac",
  "label": "กสิกรไทย A/C",
  "source": "Rcheck1b",
  "layout": {
   "version": 2,
   "feed": "landscape",
   "offset": {
    "x": 0,
    "y": 0
   },
   "bg": null,
   "bgOpacity": 0.55,
   "items": {
    "stub_date": {
     "show": true,
     "x": 16.4,
     "y": 12.3,
     "w": 40,
     "size": 13,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "format": "dmy",
     "era": "be"
    },
    "stub_payee": {
     "show": true,
     "x": 7.1,
     "y": 18,
     "w": 46,
     "size": 12,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "stub_amount": {
     "show": true,
     "x": 8.1,
     "y": 24,
     "w": 24,
     "size": 13.5,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "",
     "suffix": ""
    },
    "stub_detail": {
     "show": true,
     "x": 7,
     "y": 37.2,
     "w": 28.4,
     "size": 12,
     "bold": true,
     "wrap": true,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "lh": 1.18
    },
    "date": {
     "show": true,
     "x": 181.9,
     "y": 11.6,
     "w": 40,
     "size": 15.5,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "format": "dmy",
     "era": "be"
    },
    "payee": {
     "show": true,
     "x": 71.1,
     "y": 28.5,
     "w": 123.1,
     "size": 17,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "fill": "solid",
     "fillDy": 0.8
    },
    "amount_words": {
     "show": true,
     "x": 82.2,
     "y": 38.3,
     "w": 139.5,
     "size": 16.5,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "**",
     "suffix": "**"
    },
    "amount_num": {
     "show": true,
     "x": 142.7,
     "y": 44.9,
     "w": 40,
     "size": 16.5,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "",
     "suffix": ""
    },
    "ac_mark": {
     "show": true,
     "when": "ac",
     "x": 56.9,
     "y": 15.5,
     "w": 33.5,
     "angle": -8.5,
     "size": 11,
     "bold": true,
     "text": "A/C PAYEE ONLY",
     "lines": true,
     "color": "#c8102e"
    },
    "stub_ac_mark": {
     "show": false,
     "when": "ac"
    },
    "bearer_strike": {
     "show": true,
     "when": "always",
     "x": 195.9,
     "y": 32.5,
     "w": 9.6,
     "thick": 0.3,
     "double": false,
     "gap": 0.9
    },
    "detail": {
     "show": false,
     "x": 80,
     "y": 60,
     "w": 120,
     "size": 12,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "cheque_no": {
     "show": false,
     "x": 180,
     "y": 70,
     "w": 40,
     "size": 12,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    }
   }
  }
 },
 "kbank_nonac": {
  "bank": "KBANK",
  "crossing": "nonac",
  "label": "กสิกรไทย (Non-AC)",
  "source": "Rcheck2b",
  "layout": {
   "version": 2,
   "feed": "landscape",
   "offset": {
    "x": 0,
    "y": 0
   },
   "bg": null,
   "bgOpacity": 0.55,
   "items": {
    "stub_date": {
     "show": true,
     "x": 20.9,
     "y": 11.8,
     "w": 40,
     "size": 13.5,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "format": "dmy",
     "era": "be"
    },
    "stub_payee": {
     "show": true,
     "x": 19.5,
     "y": 18.4,
     "w": 46,
     "size": 13,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "stub_amount": {
     "show": true,
     "x": 17.4,
     "y": 23.7,
     "w": 24,
     "size": 14,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "",
     "suffix": ""
    },
    "stub_detail": {
     "show": true,
     "x": 24.5,
     "y": 36.7,
     "w": 31.4,
     "size": 11.5,
     "bold": true,
     "wrap": true,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "lh": 1.36
    },
    "date": {
     "show": true,
     "x": 193,
     "y": 12.7,
     "w": 40,
     "size": 16.5,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": "",
     "format": "dmy",
     "era": "be"
    },
    "payee": {
     "show": true,
     "x": 82.7,
     "y": 28.6,
     "w": 125,
     "size": 18,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "amount_words": {
     "show": true,
     "x": 91.2,
     "y": 38.4,
     "w": 130.6,
     "size": 17.5,
     "bold": true,
     "wrap": false,
     "align": "left",
     "prefix": "**",
     "suffix": "**"
    },
    "amount_num": {
     "show": true,
     "x": 160.6,
     "y": 45.9,
     "w": 40,
     "size": 17,
     "bold": true,
     "wrap": false,
     "align": "right",
     "prefix": "",
     "suffix": ""
    },
    "ac_mark": {
     "show": false,
     "when": "ac"
    },
    "stub_ac_mark": {
     "show": false,
     "when": "ac"
    },
    "bearer_strike": {
     "show": false,
     "when": "always",
     "x": 196,
     "y": 32.5,
     "w": 10,
     "thick": 0.3,
     "double": false
    },
    "detail": {
     "show": false,
     "x": 80,
     "y": 60,
     "w": 120,
     "size": 12,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    },
    "cheque_no": {
     "show": false,
     "x": 180,
     "y": 70,
     "w": 40,
     "size": 12,
     "bold": false,
     "wrap": false,
     "align": "left",
     "prefix": "",
     "suffix": ""
    }
   }
  }
 }
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const BANK_CODE = { 2: 'KTB', 3: 'KBANK' };
/** Preset for a bank (id or code) and crossing — falls back to Krungthai. */
export function chequePreset(bank, crossing = 'ac', source = 'real') {
  const code = (typeof bank === 'number' ? BANK_CODE[bank] : bank) || 'KTB';
  const key = `${code === 'KBANK' ? 'kbank' : 'ktb'}_${crossing === 'nonac' ? 'nonac' : 'ac'}`;
  return (source === 'access' ? ACCESS_PRESETS : CHEQUE_PRESETS)[key];
}
/** Starting layout: the real-cheque preset for that bank / crossing (or the old Access one with source 'access'). */
export function defaultChequeLayout(bank = 'KTB', crossing = 'ac', source = 'real') { return clone(chequePreset(bank, crossing, source).layout); }

export function resolveChequeLayout(saved, bank = 'KTB', crossing = 'ac') {
  const base = defaultChequeLayout(bank, crossing);
  if (!saved || !saved.items) return base;
  const items = {};
  for (const d of CHQ_ITEMS) items[d.key] = { ...base.items[d.key], ...(saved.items[d.key] || {}) };
  for (const [k, v] of Object.entries(saved.items)) if (k.startsWith('custom_')) items[k] = { ...v };
  return { ...base, ...saved, offset: { ...base.offset, ...(saved.offset || {}) }, items };
}

/** Page size for the chosen paper feed. */
export function chequePage(layout) {
  const p = (layout?.feed || 'landscape').startsWith('portrait');
  return p ? { w: CHEQUE.h, h: CHEQUE.w } : { w: CHEQUE.w, h: CHEQUE.h };
}
export const chequePageCss = (layout) => { const { w, h } = chequePage(layout); return `@page { size: ${w}mm ${h}mm; margin: 0; }`; };

function dateHtml(it, c) {
  const p = chequeDateParts(c.cheque_date, it.era);
  if (!p) return '';
  if (it.format === 'slash') return `${p.d}/${p.m}/${p.y}`;
  if (it.format === 'dmy') return `${Number(p.d)}/${Number(p.m)}/${p.y}`;
  if (it.format === 'long') return `${Number(p.d)} ${p.month} ${p.y}`;
  const chars = (p.d + p.m + p.y).split('');
  return `<span class="chq-cells">${chars.map((ch, i) => `<span style="width:${it.cell}mm${(i === 1 || i === 3) && it.gap ? `;margin-right:${it.gap}mm` : ''}">${esc(ch)}</span>`).join('')}</span>`;
}

function content(key, it, c, opts) {
  const pre = (v) => `${esc(it.prefix || '')}${v}${esc(it.suffix || '')}`;
  const ed = opts.editor;
  switch (key) {
    case 'date': return dateHtml(it, c);
    case 'payee': {
      if (!c.payee) return '';
      if (!it.fill || it.fill === 'none') return pre(esc(c.payee));
      return `<span class="chq-ptext">${pre(esc(c.payee))}</span><span class="chq-fill ${it.fill === 'dashed' ? 'dashed' : ''}" style="--fdy:${it.fillDy ?? 0}mm"></span>`;
    }
    case 'amount_words': return pre(esc(bahtText(c.amount)));
    case 'amount_num': return pre(esc(money(c.amount)));
    case 'detail': return c.detail ? pre(esc(c.detail)) : (ed ? 'รายการ ...' : '');
    case 'cheque_no': return c.cheque_no ? pre(esc(c.cheque_no)) : '';
    case 'stub_date': return dateHtml({ format: 'dmy', era: 'be', ...it }, c);
    case 'stub_payee': return esc(c.payee || '');
    case 'stub_amount': return esc(money(c.amount));
    case 'stub_detail': return esc(c.detail || (ed ? 'รายการ ...' : ''));
    case 'ac_mark': case 'stub_ac_mark': return `<span>${esc(it.text || '')}</span>`;
    case 'bearer_strike': return ' ';
    default: {
      if (!key.startsWith('custom_')) return '';
      const v = sourceValue(it, c, opts);
      if (!v) return '';
      if (it.cell && !chqFont(it.font).barcode) return cellsHtml(v, it);
      return pre(esc(v)).replace(/\n/g, '<br>');
    }
  }
}

/**
 * One cheque page. c = cheque row; opts.crossing = 'ac' | 'nonac'; opts.editor shows the scan + placeholders.
 */
export function renderCheque(c, layout, opts = {}) {
  const L = layout && layout.items ? layout : resolveChequeLayout(layout);
  const crossing = opts.crossing || c.crossing || 'ac';
  const page = chequePage(L);
  const keys = [...CHQ_ITEMS.map((d) => d.key), ...Object.keys(L.items).filter((k) => k.startsWith('custom_'))];
  const html = keys.map((key) => {
    const it = L.items[key];
    if (!it || it.show === false) return '';
    if (it.when && it.when !== 'always' && it.when !== crossing) return '';
    const kind = chqItemDef(key).kind;
    const font = chqFont(it.font);
    let inner = content(key, it, c, opts);
    if (!inner) return '';
    if (font.barcode && kind !== 'crossing' && kind !== 'line') {
      // barcode fonts draw the bars from encoded characters: encode the plain value
      const plain = key.startsWith('custom_') ? sourceValue(it, c, opts) : new DOMParser().parseFromString(inner, 'text/html').body.textContent;
      inner = esc(font.barcode === 'code39' ? code39(plain) : code128(plain));
      if (!inner) return '';
    }
    const fontCss = `${it.font && it.font !== 'psk' ? `font-family:${font.family};` : ''}${it.italic ? 'font-style:italic;' : ''}`;
    if (kind === 'crossing') {
      return `<div class="env-item chq-cross${it.lines === false ? ' nolines' : ''}" data-block="${key}" style="left:${it.x}mm;top:${it.y}mm;width:${it.w}mm;font-size:${it.size}pt;font-weight:${it.bold ? 700 : 400};${fontCss}transform:rotate(${it.angle || 0}deg);color:${esc(it.color || '#000')}">${inner}</div>`;
    }
    if (kind === 'line') {
      if (it.when && it.when !== 'always' && it.when !== crossing) return '';
      return `<div class="env-item chq-line${it.double ? ' double' : ''}" data-block="${key}" style="left:${it.x}mm;top:${it.y}mm;width:${it.w}mm;--t:${it.thick || 0.5}mm;--g:${it.gap ?? (it.thick || 0.5) * 3}mm"></div>`;
    }
    const fit = (kind === 'text' || kind === 'custom' || kind === 'date') && !it.wrap && !(kind === 'date' && it.format === 'boxes') && !it.cell && !font.barcode;
    const style = [`left:${it.x}mm`, `top:${it.y}mm`, it.w && kind !== 'date' ? `width:${it.w}mm` : '', `font-size:${it.size}pt`,
      `font-weight:${it.bold ? 700 : 400}`, fontCss.replace(/;$/, ''), it.align && it.align !== 'left' ? `text-align:${it.align}` : '', it.lh ? `line-height:${it.lh}` : '', it.color && it.color !== '#000' ? `color:${esc(it.color)}` : ''].filter(Boolean).join(';');
    return `<div class="env-item${fit ? ' fit' : ''}${font.barcode ? ' barcode' : ''}${key === 'payee' && it.fill && it.fill !== 'none' ? ' chq-payee' : ''}" data-block="${key}" data-size="${it.size}" style="${style}">${inner}</div>`;
  }).join('');
  const rot = L.feed === 'portrait-cw' ? `transform:translateX(${CHEQUE.h}mm) rotate(90deg);transform-origin:top left;`
    : L.feed === 'portrait-ccw' ? `transform:translateY(${CHEQUE.w}mm) rotate(-90deg);transform-origin:top left;` : '';
  // background picture of the blank cheque: the form's own upload, else the bank's standard picture (opts.bgDefault).
  // Shown only on screen (editor / preview with showBg) — never sent to the printer.
  const bgSrc = L.bgMode === 'none' ? null : (L.bg || opts.bgDefault || null);
  const bg = (opts.editor || opts.showBg) && bgSrc ? `<img class="chq-bg" src="${esc(bgSrc)}" alt="" style="opacity:${L.bgOpacity ?? 0.55}">` : '';
  return `
  <section class="env chq${opts.editor ? ' on-screen' : ''}" style="width:${page.w}mm;height:${page.h}mm">
    <div class="chq-paper" style="width:${CHEQUE.w}mm;height:${CHEQUE.h}mm;${rot}">${bg}
      <div class="env-inner" style="transform:translate(${L.offset?.x || 0}mm,${L.offset?.y || 0}mm)">${html}</div>
    </div>
  </section>`;
}

export const SAMPLE_CHEQUE = {
  cheque_no: '10237271', cheque_date: new Date().toISOString().slice(0, 10),
  payee: 'สำนักงานคลังจังหวัดอุดรธานี', amount: 27960.5, detail: 'นำส่งค่าถ่ายเอกสาร ประจำเดือน', crossing: 'ac',
};
