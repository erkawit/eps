// =====================================================================
//  Envelope renderer — used for printing, preview and test prints
//  Every block is positioned from a "layout" (millimetres from the
//  top-left corner of the envelope, font sizes in pt), so each user can
//  move the text to fit their own printer.
// =====================================================================

export const ENVELOPES = {
  white: { key: 'white', label: 'ซองขาว', size: '4.25" × 9.25"', w: 234.95, h: 107.95 },
  brown: { key: 'brown', label: 'ซองน้ำตาล', size: '8.2" × 10"', w: 254.0, h: 208.28 },
};

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const r05 = (n) => Math.round(n * 2) / 2;

/** Page size (mm). `x` may be a layout ({orientation}) or the settings row ({brown_orientation}). */
export function envSize(type, x = {}) {
  const e = ENVELOPES[type] || ENVELOPES.white;
  const portrait = type === 'brown' && (x.orientation || x.brown_orientation) === 'portrait';
  return portrait ? { w: e.h, h: e.w } : { w: e.w, h: e.h };
}

/** Factory default layout for an envelope type / orientation. */
export function defaultLayout(type, orientation = 'landscape') {
  if (type === 'brown') {
    const portrait = orientation === 'portrait';
    const { w, h } = envSize('brown', { orientation });
    const rx = r05(portrait ? w * 0.2 : w * 0.38);
    return {
      orientation: portrait ? 'portrait' : 'landscape',
      offset: { x: 0, y: 0 },
      sender: { x: 14, y: 12, size: 18 },
      emblem: { h: 24 },
      postage: { x: r05(w - 14 - 62), y: 12, w: 62, size: 15, show: true },
      recipient: { x: rx, y: r05(portrait ? h * 0.42 : h * 0.47), w: r05(w - rx - 12), size: 23.5 },
    };
  }
  const { w, h } = envSize('white');
  const rx = r05(w * 0.4);
  return {
    orientation: 'landscape',
    offset: { x: 0, y: 0 },
    sender: { x: 10, y: 8, size: 15.5 },
    emblem: { h: 17 },
    postage: { x: r05(w - 10 - 52), y: 8, w: 52, size: 13, show: true },
    recipient: { x: rx, y: r05(h * 0.44), w: r05(w - rx - 10), size: 19.5 },
  };
}

/**
 * Full layout = factory default ← organisation settings (old offsets / orientation) ← saved user layout.
 */
export function resolveLayout(type, s = {}, saved = null) {
  const orientation = saved?.orientation || (type === 'brown' ? s.brown_orientation : null) || 'landscape';
  const base = defaultLayout(type, orientation);
  if (!saved) {
    base.offset = { x: Number(s[`${type}_offset_x`] || 0), y: Number(s[`${type}_offset_y`] || 0) };
    base.postage.show = s.show_postage !== false;
    return base;
  }
  const out = { ...base, orientation };
  for (const k of ['offset', 'sender', 'emblem', 'postage', 'recipient']) out[k] = { ...base[k], ...(saved[k] || {}) };
  return out;
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

/** Returns the HTML for one envelope (one printed page). */
export function renderEnvelope(letter, s = {}, type = 'white', layout = null) {
  const L = layout && layout.sender ? layout : resolveLayout(type, s, layout);
  const { w, h } = envSize(type, L);
  const portrait = type === 'brown' && L.orientation === 'portrait';

  const urgent = letter.urgency && letter.urgency !== 'ปกติ';
  const emblem = s.show_emblem !== false && s.emblem_url
    ? `<img class="env-emblem" src="${esc(s.emblem_url)}" alt="" style="height:${L.emblem.h}mm">` : '';
  const showPostage = L.postage.show !== false && s.show_postage !== false && s.postage_text;
  const pc = (letter.recipient_postcode || '').replace(/\s/g, '');
  const prefix = s.recipient_prefix ?? 'เรียน';

  return `
  <section class="env env-${type}${portrait ? ' env-portrait' : ''}" style="width:${w}mm;height:${h}mm">
    <div class="env-inner" style="transform:translate(${L.offset.x}mm,${L.offset.y}mm)">
      <div class="env-sender" data-block="sender" style="left:${L.sender.x}mm;top:${L.sender.y}mm;font-size:${L.sender.size}pt">
        ${emblem}
        <div class="env-docno">ที่ ${esc(letter.doc_number)}</div>
        <div class="env-org">${esc(s.org_name)}</div>
        ${s.address ? `<div>${esc(s.address)}</div>` : ''}
        <div>${esc(areaLine(s.amphur, s.province))} ${esc(s.postcode)}</div>
        ${urgent ? `<div class="env-urgent">${esc(letter.urgency)}</div>` : ''}
      </div>
      ${showPostage ? `<div class="env-postage" data-block="postage" style="left:${L.postage.x}mm;top:${L.postage.y}mm;width:${L.postage.w}mm;font-size:${L.postage.size}pt">${nl2br(s.postage_text)}</div>` : ''}
      <div class="env-recipient" data-block="recipient" style="left:${L.recipient.x}mm;top:${L.recipient.y}mm;width:${L.recipient.w}mm;font-size:${L.recipient.size}pt">
        <div class="env-to">${prefix ? `<span class="env-to-label">${esc(prefix)}</span>` : ''}${esc(letter.recipient_name)}</div>
        ${letter.recipient_address ? `<div>${esc(letter.recipient_address)}</div>` : ''}
        <div>${esc(areaLine(letter.recipient_amphur, letter.recipient_province))}</div>
        ${pc ? `<div class="env-postcode">${pc.split('').map((d) => `<span>${esc(d)}</span>`).join('')}</div>` : ''}
      </div>
    </div>
  </section>`;
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
  urgency: 'ด่วนที่สุด',
};
