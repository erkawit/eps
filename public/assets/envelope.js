// =====================================================================
//  Envelope renderer — used for printing, preview and test prints
//
//  Layout v2: every line on the envelope is a separate ITEM with its own
//  position (mm from the top-left of the envelope), width, font size (pt),
//  bold, wrap and show/hide. Users may also add their own text items.
//  Old block layouts (v1: sender / postage / recipient) are migrated.
// =====================================================================

export const ENVELOPES = {
  white: { key: 'white', label: 'ซองขาว', size: '4.25" × 9.25"', w: 234.95, h: 107.95 },
  brown: { key: 'brown', label: 'ซองน้ำตาล', size: '8.2" × 10"', w: 254.0, h: 208.28 },
};

/** Standard items, in drawing order. kind: text | image | stamp | box | postcode */
export const ITEM_DEFS = [
  { key: 'emblem', label: 'ตราสัญลักษณ์', group: 'ผู้ส่ง', kind: 'image' },
  { key: 'docno', label: 'เลขที่หนังสือ (ที่ ...)', group: 'ผู้ส่ง', kind: 'text' },
  { key: 'org', label: 'ชื่อหน่วยงาน', group: 'ผู้ส่ง', kind: 'text' },
  { key: 'org_address', label: 'ที่อยู่หน่วยงาน', group: 'ผู้ส่ง', kind: 'text' },
  { key: 'org_area', label: 'อำเภอ จังหวัด รหัสไปรษณีย์ (ผู้ส่ง)', group: 'ผู้ส่ง', kind: 'text' },
  { key: 'org_phone', label: 'โทรศัพท์หน่วยงาน', group: 'ผู้ส่ง', kind: 'text' },
  { key: 'urgency', label: 'ชั้นความเร็ว (ด่วน / ด่วนมาก / ด่วนที่สุด)', group: 'ผู้ส่ง', kind: 'stamp' },
  { key: 'postage', label: 'ช่องชำระค่าฝากส่ง', group: 'มุมขวาบน', kind: 'box' },
  { key: 'subject', label: 'เรื่อง', group: 'อื่น ๆ', kind: 'text' },
  { key: 'to', label: 'เรียน + ชื่อผู้รับ', group: 'ผู้รับ', kind: 'text' },
  { key: 'to_address', label: 'ที่อยู่ผู้รับ', group: 'ผู้รับ', kind: 'text' },
  { key: 'to_area', label: 'อำเภอ จังหวัด (ผู้รับ)', group: 'ผู้รับ', kind: 'text' },
  { key: 'postcode', label: 'รหัสไปรษณีย์ผู้รับ', group: 'ผู้รับ', kind: 'postcode' },
];
export const itemDef = (key) => ITEM_DEFS.find((d) => d.key === key) || { key, label: 'ข้อความเพิ่มเติม', group: 'ข้อความเพิ่มเติม', kind: 'custom' };

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const r05 = (n) => Math.round(n * 2) / 2;
const lh = (pt) => pt * 0.3528 * 1.22; // line height in mm for a font size in pt

/** Page size (mm). `x` may be a layout ({orientation}) or the settings row ({brown_orientation}). */
export function envSize(type, x = {}) {
  const e = ENVELOPES[type] || ENVELOPES.white;
  const portrait = type === 'brown' && (x.orientation || x.brown_orientation) === 'portrait';
  return portrait ? { w: e.h, h: e.w } : { w: e.w, h: e.h };
}

/** Block-level parameters (v1 style) for an envelope type / orientation. */
function blockDefaults(type, orientation) {
  const { w, h } = envSize(type, { orientation });
  if (type === 'brown') {
    const portrait = orientation === 'portrait';
    const rx = r05(portrait ? w * 0.2 : w * 0.38);
    return {
      offset: { x: 0, y: 0 }, emblem: { h: 24 },
      sender: { x: 14, y: 12, size: 18 },
      postage: { x: r05(w - 14 - 62), y: 12, w: 62, size: 15, show: true },
      recipient: { x: rx, y: r05(portrait ? h * 0.42 : h * 0.47), w: r05(w - rx - 12), size: 23.5 },
    };
  }
  const rx = r05(w * 0.4);
  return {
    offset: { x: 0, y: 0 }, emblem: { h: 17 },
    sender: { x: 10, y: 8, size: 15.5 },
    postage: { x: r05(w - 10 - 52), y: 8, w: 52, size: 13, show: true },
    recipient: { x: rx, y: r05(h * 0.44), w: r05(w - rx - 10), size: 19.5 },
  };
}

/** Turn block parameters into separate items (stacked like the original design). */
function itemsFromBlocks(type, orientation, p, s = {}) {
  const { w, h } = envSize(type, { orientation });
  const it = {};
  const hasEmblem = Boolean(s.emblem_url) && s.show_emblem !== false;
  const eh = p.emblem?.h || (type === 'brown' ? 24 : 17);
  // sender column (to the right of the emblem when there is one)
  const sx = hasEmblem ? r05(p.sender.x + eh * 0.95 + 3) : p.sender.x;
  const sw = r05(Math.min(w * 0.5, p.postage.x - sx - 4));
  const ss = p.sender.size;
  it.emblem = { show: true, x: p.sender.x, y: p.sender.y, h: eh };
  let y = p.sender.y;
  const put = (key, size, extra = {}) => { it[key] = { show: true, x: sx, y: r05(y), w: sw, size, bold: false, wrap: false, ...extra }; y += lh(size); };
  put('docno', r05(ss * 1.1), { bold: true });
  put('org', ss, { bold: true });
  put('org_address', ss);
  put('org_area', ss);
  put('org_phone', ss, { show: false });
  it.urgency = { show: true, x: sx, y: r05(y + 1), size: r05(ss * 1.35), bold: true };
  // postage box
  it.postage = { show: p.postage.show !== false, x: p.postage.x, y: p.postage.y, w: p.postage.w, size: p.postage.size, bold: false };
  // recipient column
  const rs = p.recipient.size;
  y = p.recipient.y;
  const rput = (key, size, extra = {}) => { it[key] = { show: true, x: p.recipient.x, y: r05(y), w: p.recipient.w, size, bold: false, wrap: false, ...extra }; y += lh(size); };
  rput('to', r05(rs * 1.08), { bold: true });
  rput('to_address', rs);
  rput('to_area', rs);
  it.postcode = { show: true, x: p.recipient.x, y: r05(y + 1), size: rs, bold: true, boxes: true };
  // optional extras (hidden until the user turns them on)
  it.subject = { show: false, x: p.sender.x, y: r05(h - (type === 'brown' ? 22 : 14)), w: r05(w * 0.45), size: type === 'brown' ? 16 : 14, bold: false, wrap: false };
  return it;
}

/** Factory default layout (v2) for an envelope type / orientation. */
export function defaultLayout(type, orientation = 'landscape', s = {}) {
  const o = type === 'brown' && orientation === 'portrait' ? 'portrait' : 'landscape';
  const p = blockDefaults(type, o);
  return { version: 2, orientation: o, offset: { x: 0, y: 0 }, items: itemsFromBlocks(type, o, p, s) };
}

/**
 * Full layout = factory default ← organisation settings (legacy offsets / orientation) ← saved user layout.
 * Accepts saved v1 (blocks) or v2 (items) layouts.
 */
export function resolveLayout(type, s = {}, saved = null) {
  const orientation = (type === 'brown' && (saved?.orientation || s.brown_orientation) === 'portrait') ? 'portrait' : 'landscape';
  const base = defaultLayout(type, orientation, s);
  if (!saved || !Object.keys(saved).length) {
    base.offset = { x: Number(s[`${type}_offset_x`] || 0), y: Number(s[`${type}_offset_y`] || 0) };
    base.items.postage.show = s.show_postage !== false;
    return base;
  }
  if (saved.version === 2 && saved.items) {
    const items = {};
    for (const d of ITEM_DEFS) items[d.key] = { ...base.items[d.key], ...(saved.items[d.key] || {}) };
    for (const [k, v] of Object.entries(saved.items)) if (k.startsWith('custom_')) items[k] = { ...v };
    return { version: 2, orientation, offset: { ...base.offset, ...(saved.offset || {}) }, items };
  }
  // ---- migrate v1 (sender / postage / recipient blocks) ----
  const d = blockDefaults(type, orientation);
  const p = {};
  for (const k of ['offset', 'sender', 'emblem', 'postage', 'recipient']) p[k] = { ...d[k], ...(saved[k] || {}) };
  return { version: 2, orientation, offset: p.offset, items: itemsFromBlocks(type, orientation, p, s) };
}

/** "อำเภอเมืองอุดรธานี จังหวัดอุดรธานี" / "เขตจตุจักร กรุงเทพมหานคร" */
export function areaLine(amphur, province) {
  const p = (province || '').trim();
  let a = (amphur || '').trim();
  const bkk = p.includes('กรุงเทพ');
  if (a && !/^(อ\.|อำเภอ|เขต|กิ่ง)/.test(a)) {
    if (a === 'เมือง' && p && !bkk) a = 'เมือง' + p;
    a = (bkk ? 'เขต' : 'อำเภอ') + a;
  }
  const pv = !p || p === '-' ? '' : bkk ? 'กรุงเทพมหานคร' : p.startsWith('จังหวัด') || p.startsWith('จ.') ? p : 'จังหวัด' + p;
  return [a, pv].filter(Boolean).join('  ');
}

const nl2br = (t) => esc(t).replace(/\n/g, '<br>');

/** Inner HTML of one item, or '' when there is nothing to print. */
function itemContent(key, it, letter, s, editor) {
  const pc = (letter.recipient_postcode || '').replace(/\s/g, '');
  const prefix = s.recipient_prefix ?? 'เรียน';
  switch (key) {
    case 'emblem':
      if (s.emblem_url && s.show_emblem !== false) return `<img src="${esc(s.emblem_url)}" alt="" style="height:${it.h}mm;display:block">`;
      return editor ? `<div class="env-ph" style="height:${it.h}mm;width:${it.h * 0.9}mm">ตรา</div>` : '';
    case 'docno': return letter.doc_number ? `ที่ ${esc(letter.doc_number)}` : '';
    case 'org': return esc(s.org_name || '');
    case 'org_address': return esc(s.address || '');
    case 'org_area': return esc(`${areaLine(s.amphur, s.province)} ${s.postcode || ''}`.trim());
    case 'org_phone': return s.telephone ? `โทร. ${esc(s.telephone)}` : (editor ? 'โทร. ...' : '');
    case 'urgency': return letter.urgency && letter.urgency !== 'ปกติ' ? `<span class="env-stamp">${esc(letter.urgency)}</span>` : (editor ? '<span class="env-stamp">ด่วนที่สุด</span>' : '');
    case 'postage': return s.postage_text ? nl2br(s.postage_text) : '';
    case 'subject': return letter.subject ? `เรื่อง ${esc(letter.subject)}` : (editor ? 'เรื่อง ...' : '');
    case 'to': return `${prefix ? `<span class="env-to-label">${esc(prefix)}</span>` : ''}${esc(letter.recipient_name || '')}`;
    case 'to_address': return esc(letter.recipient_address || '');
    case 'to_area': return esc(areaLine(letter.recipient_amphur, letter.recipient_province));
    case 'postcode':
      if (!pc) return '';
      return it.boxes === false ? esc(pc) : `<span class="env-pc">${pc.split('').map((c) => `<span>${esc(c)}</span>`).join('')}</span>`;
    default: return key.startsWith('custom_') ? nl2br(it.text || '') : '';
  }
}

/** Returns the HTML for one envelope (one printed page). opts.editor shows placeholders for empty items. */
export function renderEnvelope(letter, s = {}, type = 'white', layout = null, opts = {}) {
  const L = layout && layout.version === 2 && layout.items ? layout : resolveLayout(type, s, layout);
  const { w, h } = envSize(type, L);
  const portrait = type === 'brown' && L.orientation === 'portrait';
  const keys = [...ITEM_DEFS.map((d) => d.key), ...Object.keys(L.items).filter((k) => k.startsWith('custom_'))];
  const html = keys.map((key) => {
    const it = L.items[key];
    if (!it || it.show === false) return '';
    const content = itemContent(key, it, letter, s, opts.editor);
    if (!content) return '';
    const kind = itemDef(key).kind;
    const fit = (kind === 'text' || kind === 'custom') && !it.wrap;
    const style = [`left:${it.x}mm`, `top:${it.y}mm`, it.w && kind !== 'postcode' && kind !== 'image' && kind !== 'stamp' ? `width:${it.w}mm` : '',
      it.size ? `font-size:${it.size}pt` : '', `font-weight:${it.bold ? 700 : 400}`].filter(Boolean).join(';');
    return `<div class="env-item env-i-${kind}${fit ? ' fit' : ''}" data-block="${key}" data-size="${it.size || ''}" style="${style}">${content}</div>`;
  }).join('');
  return `
  <section class="env env-${type}${portrait ? ' env-portrait' : ''}" style="width:${w}mm;height:${h}mm">
    <div class="env-inner" style="transform:translate(${L.offset?.x || 0}mm,${L.offset?.y || 0}mm)">${html}</div>
  </section>`;
}

/** Shrink single-line items that are longer than their width (call after the HTML is in the DOM). */
export function fitEnvelopeText(root) {
  if (!root) return;
  root.querySelectorAll('.env-item.fit').forEach((el) => {
    const base = Number(el.dataset.size) || 16;
    let size = base;
    el.style.fontSize = `${size}pt`;
    while (el.scrollWidth > el.clientWidth + 1 && size > base * 0.6) { size -= 0.5; el.style.fontSize = `${size}pt`; }
  });
}

/** @page rule for the chosen envelope type (layout or settings decides orientation). */
export function pageCss(type, x = {}) {
  const { w, h } = envSize(type, x);
  return `@page { size: ${w}mm ${h}mm; margin: 0; }`;
}

/** Sample letter for preview / test print. */
export const SAMPLE_LETTER = {
  doc_number: 'ศย 304.019/1234',
  recipient_name: 'ผู้อำนวยการสำนักงานขนส่งจังหวัดอุดรธานี',
  recipient_address: '99 ถนนอุดรดุษฎี ตำบลหมากแข้ง',
  recipient_amphur: 'เมือง',
  recipient_province: 'อุดรธานี',
  recipient_postcode: '41000',
  subject: 'ส่งหมายเรียกพยาน',
  urgency: 'ด่วนที่สุด',
};
