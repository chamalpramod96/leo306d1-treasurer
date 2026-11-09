/* =========================================================
   files.js — real Excel (.xlsx) and PDF files built in the browser,
   no libraries and nothing sent anywhere.
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const enc = new TextEncoder();

  /* ---------- ZIP container (files stored uncompressed — Excel reads it fine) ---------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files, type) {
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const cdSize = central.reduce((s, u) => s + u.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type });
  }

  /* ---------- Excel workbook (one sheet) ---------- */
  const xmlEsc = (s) => String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const colName = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const excelDate = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };
  const S = { text: 0, head: 1, date: 2, money: 3, totalLabel: 4, totalMoney: 5, title: 6, sub: 7, int: 8, wrap: 9 };

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd mmm yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
<fonts count="5">
<font><sz val="11"/><color rgb="FF2B1716"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF2B1716"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="15"/><color rgb="FF5A0A12"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF5E4A46"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF5A0A12"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF8EED7"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FFA27C40"/></top><bottom style="double"><color rgb="FFA27C40"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  /**
   * One-sheet .xlsx with a title, a frozen and filterable header row, typed columns and an optional totals row.
   * columns: [{ header, width, type: 'text'|'wrap'|'date'|'money'|'int' }]; rows: arrays in column order (dates as YYYY-MM-DD);
   * totals: one row (array in column order) or several rows — numbers become money cells, strings labels.
   */
  function xlsx({ sheetName = 'Sheet1', title, subtitle, columns, rows, totals }) {
    const sheet = sheetName.replace(/[\[\]:*?/\\']/g, ' ').slice(0, 31);
    const cell = (ci, ri, v, s, num) => {
      const ref = colName(ci) + ri;
      if (v == null || v === '') return `<c r="${ref}" s="${s}"/>`;
      if (num) return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    };
    const out = [];
    let r = 0;
    if (title) { r++; out.push(`<row r="${r}" ht="22" customHeight="1">${cell(0, r, title, S.title)}</row>`); }
    if (subtitle) { r++; out.push(`<row r="${r}">${cell(0, r, subtitle, S.sub)}</row>`); }
    if (r) r++; // one empty row before the table
    r++;
    const headRow = r;
    out.push(`<row r="${r}" ht="30" customHeight="1">${columns.map((c, i) => cell(i, r, c.header, S.head)).join('')}</row>`);
    rows.forEach((row) => {
      r++;
      out.push(`<row r="${r}">${row.map((v, i) => {
        const t = columns[i].type;
        if (t === 'date' && v) return cell(i, r, excelDate(v), S.date, true);
        if ((t === 'money' || t === 'int') && v !== '' && v != null && !isNaN(v)) return cell(i, r, Number(v), t === 'money' ? S.money : S.int, true);
        return cell(i, r, v, t === 'wrap' ? S.wrap : S.text);
      }).join('')}</row>`);
    });
    const lastRow = r;
    if (totals && totals.length) {
      (Array.isArray(totals[0]) ? totals : [totals]).forEach((t) => {
        r++;
        out.push(`<row r="${r}">${t.map((v, i) => (typeof v === 'number' ? cell(i, r, v, S.totalMoney, true) : cell(i, r, v, S.totalLabel))).join('')}</row>`);
      });
    }
    const lastCol = colName(columns.length - 1);
    const range = `$A$${headRow}:$${lastCol}$${Math.max(lastRow, headRow)}`;
    const ws = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join('')}</cols>
<sheetData>${out.join('')}</sheetData>
<autoFilter ref="${range.replace(/\$/g, '')}"/>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlEsc(sheet)}" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xmlEsc(sheet)}'!${range}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">'${xmlEsc(sheet)}'!$${headRow}:$${headRow}</definedName></definedNames>
</workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: STYLES },
      { name: 'xl/worksheets/sheet1.xml', data: ws },
    ];
    return zip(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  /* ---------- PDF from canvas pages (each page is one JPEG image) ---------- */
  const toJpeg = (canvas) => new Promise((res, rej) => {
    try {
      canvas.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a)), rej) : rej(new Error('Could not draw the page'))), 'image/jpeg', 0.9);
    } catch (e) { rej(e); }
  });
  /** pageWidthPt: page width in points (595.28 = A4 portrait / A5 landscape width; 841.89 = A4 landscape). */
  async function pdf(canvases, { pageWidthPt = 595.28, title = '' } = {}) {
    const jpegs = [];
    for (const c of canvases) jpegs.push(await toJpeg(c));
    const parts = [];
    let len = 0;
    const offsets = [];
    const push = (d) => { const u = typeof d === 'string' ? enc.encode(d) : d; parts.push(u); len += u.length; };
    const obj = (num, body) => { offsets[num] = len; push(`${num} 0 obj\n`); body(); push('\nendobj\n'); };
    const n = canvases.length;
    const infoNum = 3 + 3 * n;
    push('%PDF-1.4\n%âãÏÓ\n');
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Kids [${canvases.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] /Count ${n} >>`));
    canvases.forEach((c, i) => {
      const pw = pageWidthPt, ph = +(pageWidthPt * c.height / c.width).toFixed(2);
      const p = 3 + 3 * i;
      obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im${i} ${p + 2} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${p + 1} 0 R >>`));
      const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im${i} Do Q`;
      obj(p + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
      obj(p + 2, () => {
        push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegs[i].length} >>\nstream\n`);
        push(jpegs[i]);
        push('\nendstream');
      });
    });
    const pdfStr = (s) => '(' + String(s).replace(/[^\x20-\x7e]/g, '').replace(/([()\\])/g, '\\$1') + ')';
    obj(infoNum, () => push(`<< /Title ${pdfStr(title)} /Producer ${pdfStr('Leo District 306 D1 Treasury Portal')} >>`));
    const xref = len;
    const size = infoNum + 1;
    let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let i = 1; i < size; i++) table += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    push(table);
    push(`trailer\n<< /Size ${size} /Root 1 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  /* ---------- save / share ---------- */
  const save = (name, blob) => App.download(name, blob, blob.type);

  /** Share a file through the phone's share sheet (WhatsApp, Gmail…). Returns false when the device can't share files. */
  async function share(blob, name, { title = '', text = '' } = {}) {
    if (!navigator.share || !navigator.canShare) return false;
    const file = new File([blob], name, { type: blob.type });
    if (!navigator.canShare({ files: [file] })) return false;
    try { await navigator.share({ files: [file], title, text }); } catch (e) { if (e && e.name !== 'AbortError') return false; }
    return true;
  }

  /* ---------- read a spreadsheet (.xlsx or .csv) ---------- */
  /** Unpacks a ZIP (.xlsx) into { path: Uint8Array }. Deflated parts need DecompressionStream (all current browsers). */
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('This is not an Excel (.xlsx) file.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = {}, dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (!/\.(xml|rels)$/i.test(name)) continue;   // only the XML parts are needed
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const raw = u8.subarray(start, start + size);
      if (method === 0) out[name] = raw;
      else if (method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open .xlsx files. Update it, or save the sheet as CSV.');
        out[name] = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      }
    }
    return out;
  }
  const byTag = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));
  /** Number cells come back as plain text: 7.71972325E8 → "771972325" (phone numbers stored as numbers keep their digits). */
  const numText = (v) => { const n = Number(v); return Number.isFinite(n) && Number.isInteger(n) && Math.abs(n) < 1e15 ? String(n) : String(v); };
  const colIndex = (ref) => { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  async function readXlsxSheets(buf) {
    const parts = await unzip(buf);
    const dec = new TextDecoder();
    const xml = (path) => { const k = Object.keys(parts).find((n) => n.toLowerCase() === path.toLowerCase()); return k ? new DOMParser().parseFromString(dec.decode(parts[k]), 'application/xml') : null; };
    const shared = [];
    const ss = xml('xl/sharedStrings.xml');
    if (ss) byTag(ss, 'si').forEach((si) => shared.push(byTag(si, 't').filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join('')));
    const wb = xml('xl/workbook.xml');
    if (!wb) throw new Error('This Excel file has no worksheets.');
    const rels = xml('xl/_rels/workbook.xml.rels');
    const target = {};
    if (rels) byTag(rels, 'Relationship').forEach((r) => { target[r.getAttribute('Id')] = r.getAttribute('Target'); });
    return byTag(wb, 'sheet').map((sh, i) => {
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let t = target[rid] || `worksheets/sheet${i + 1}.xml`;
      t = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
      const doc = xml(t);
      const rows = [];
      if (doc) byTag(doc, 'row').forEach((row) => {
        const r = Number(row.getAttribute('r')) - 1;
        const cells = [];
        byTag(row, 'c').forEach((c, ci) => {
          const idx = c.getAttribute('r') ? colIndex(c.getAttribute('r')) : ci;
          const type = c.getAttribute('t');
          const v = byTag(c, 'v')[0];
          let val = '';
          if (type === 's') val = v ? shared[Number(v.textContent)] || '' : '';
          else if (type === 'inlineStr') val = byTag(c, 't').map((x) => x.textContent).join('');
          else if (type === 'b') val = v && v.textContent === '1' ? 'TRUE' : v ? 'FALSE' : '';
          else if (type === 'str' || type === 'e') val = v ? v.textContent : '';
          else val = v ? numText(v.textContent) : '';
          if (idx >= 0) cells[idx] = val;
        });
        rows[r >= 0 ? r : rows.length] = Array.from(cells, (x) => (x == null ? '' : String(x)));
      });
      return { name: sh.getAttribute('name') || `Sheet${i + 1}`, rows: Array.from(rows, (x) => x || []) };
    });
  }

  function readCsv(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return [{ name: 'CSV', rows }];
  }

  /** Reads a picked .xlsx or .csv file into [{ name, rows: [[text, …], …] }]. Nothing is uploaded. */
  async function readSheets(file) {
    if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return readCsv(await file.text());
    if (/\.xls$/i.test(file.name)) throw new Error('Old .xls files cannot be read. In Excel, use Save As → Excel Workbook (.xlsx).');
    return readXlsxSheets(await file.arrayBuffer());
  }

  App.files = { xlsx, pdf, save, share, zip, crc32, readSheets };
})();
