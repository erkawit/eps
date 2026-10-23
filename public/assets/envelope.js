// =====================================================================
//  Envelope renderer — used for printing, preview and test prints
//  All sizes are in millimetres so the printed result is exact.
// =====================================================================

export const ENVELOPES = {
  white: { key: 'white', label: 'ซองขาว', size: '4.25" × 9.25"', w: 234.95, h: 107.95 },
  brown: { key: 'brown', label: 'ซองน้ำตาล', size: '8.2" × 10"', w: 254.0, h: 208.28 },
};

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Page size (mm) for an envelope type, honouring brown-envelope orientation. */
export function envSize(type, s = {}) {
  const e = ENVELOPES[type] || ENVELOPES.white;
  if (type === 'brown' && s.brown_orientation === 'portrait') return { w: e.h, h: e.w };
  return { w: e.w, h: e.h };
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
export function renderEnvelope(letter, s = {}, type = 'white') {
  const { w, h } = envSize(type, s);
  const big = type === 'brown';
  const portrait = big && s.brown_orientation === 'portrait';
  const ox = Number(s[`${type}_offset_x`] || 0);
  const oy = Number(s[`${type}_offset_y`] || 0);

  // recipient box position (proportional to the envelope)
  const rx = portrait ? w * 0.2 : big ? w * 0.38 : w * 0.4;
  const ry = portrait ? h * 0.42 : big ? h * 0.47 : h * 0.44;
  const rw = w - rx - 10;

  const urgent = letter.urgency && letter.urgency !== 'ปกติ';
  const emblem = s.show_emblem !== false && s.emblem_url
    ? `<img class="env-emblem" src="${esc(s.emblem_url)}" alt="">` : '';
  const postage = s.show_postage !== false && s.postage_text
    ? `<div class="env-postage">${nl2br(s.postage_text)}</div>` : '';
  const pc = (letter.recipient_postcode || '').replace(/\s/g, '');
  const prefix = s.recipient_prefix ?? 'เรียน';

  return `
  <section class="env env-${type}${portrait ? ' env-portrait' : ''}" style="width:${w}mm;height:${h}mm">
    <div class="env-inner" style="transform:translate(${ox}mm,${oy}mm)">
      <div class="env-sender">
        ${emblem}
        <div class="env-docno">ที่ ${esc(letter.doc_number)}</div>
        <div class="env-org">${esc(s.org_name)}</div>
        ${s.address ? `<div>${esc(s.address)}</div>` : ''}
        <div>${esc(areaLine(s.amphur, s.province))} ${esc(s.postcode)}</div>
        ${urgent ? `<div class="env-urgent">${esc(letter.urgency)}</div>` : ''}
      </div>
      ${postage}
      <div class="env-recipient" style="left:${rx}mm;top:${ry}mm;width:${rw}mm">
        <div class="env-to">${prefix ? `<span class="env-to-label">${esc(prefix)}</span>` : ''}${esc(letter.recipient_name)}</div>
        ${letter.recipient_address ? `<div>${esc(letter.recipient_address)}</div>` : ''}
        <div>${esc(areaLine(letter.recipient_amphur, letter.recipient_province))}</div>
        ${pc ? `<div class="env-postcode">${pc.split('').map((d) => `<span>${esc(d)}</span>`).join('')}</div>` : ''}
      </div>
    </div>
  </section>`;
}

/** @page rule for the chosen envelope type. */
export function pageCss(type, s = {}) {
  const { w, h } = envSize(type, s);
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
