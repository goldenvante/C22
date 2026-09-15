/**
 * Generador mínimo de PDF 1.4 con protección REAL (Standard Security
 * Handler V=1/R=2, RC4-40): el documento abre sin contraseña (lectura
 * normal) pero los permisos niegan modificar/copiar/anotar/rellenar/
 * ensamblar; solo permiten imprimir. Sin dependencias: MD5, RC4, base64
 * y ensamblado implementados aquí para poder verificarse con node.
 *
 * Intencionalmente limitado (Helvetica base, texto, rectas, tablas):
 * suficiente para reportes. Nada de JavaScript, formularios ni anotaciones.
 */

export type PdfTable = {
  title?: string;
  head: string[];
  rows: string[][];
  /** Índices de columnas numéricas (alineadas a la derecha). */
  numericCols?: number[];
};

export type PdfDoc = {
  title: string;
  meta: string[];
  tables: PdfTable[];
};

// ---------------------------------------------------------------- MD5 ----
// MD5 puro (RFC 1321). Verificado contra vectores en tests de node.
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
  0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
  0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
  0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
  0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
  0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
  0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
  0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

function rotl32(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) | 0;
}

export function md5Bytes(message: Uint8Array): Uint8Array {
  const origLen = message.length;
  const bitLenLo = (origLen * 8) >>> 0;
  const bitLenHi = Math.floor(origLen / 4294967296);
  const paddedLen = (((origLen + 8) >> 6) + 1) << 6;
  const m = new Uint8Array(paddedLen);
  m.set(message);
  m[origLen] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(paddedLen - 8, bitLenLo, true);
  dv.setUint32(paddedLen - 4, bitLenHi, true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + MD5_K[i] + M[g]) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl32(F, MD5_S[i])) | 0;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }
  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, a0, true);
  odv.setUint32(4, b0, true);
  odv.setUint32(8, c0, true);
  odv.setUint32(12, d0, true);
  return out;
}

// ---------------------------------------------------------------- RC4 ----
export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    const t = s[i];
    s[i] = s[j];
    s[j] = t;
  }
  const out = new Uint8Array(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    const t = s[i];
    s[i] = s[j];
    s[j] = t;
    out[k] = data[k] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

// ------------------------------------------------------------- base64 ----
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64Encode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[n & 63] : "=";
  }
  return out;
}

// --------------------------------------------- seguridad (V=1/R=2/40) ----
const PAD_BYTES = [
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff,
  0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c,
  0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
];

function latin1Bytes(s: string, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = i < s.length ? s.charCodeAt(i) & 0xff : PAD_BYTES[i];
  }
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function le32(n: number): Uint8Array {
  const u = n >>> 0;
  return new Uint8Array([u & 0xff, (u >> 8) & 0xff, (u >> 16) & 0xff, (u >> 24) & 0xff]);
}

export type DocSecurity = {
  fileKey: Uint8Array;
  oEntry: Uint8Array;
  uEntry: Uint8Array;
  permissions: number;
  fileIdHex: string;
};

/**
 * Deriva claves V=1/R=2: usuario vacío (apertura libre) + password de
 * propietario (para desproteger). Permisos: solo impresión.
 */
export function deriveSecurity(ownerPassword: string, randomBytes: Uint8Array): DocSecurity {
  const paddedUser = latin1Bytes("", 32);
  const paddedOwner = latin1Bytes(ownerPassword, 32);
  const ownerKey = md5Bytes(paddedOwner).slice(0, 5);
  const oEntry = rc4(ownerKey, paddedUser);
  // P: bits 7,8,13-32 en 1; bit 3 (imprimir) y 12 (alta calidad) en 1.
  // Modificar/copiar/anotar/formularios/ensamblar: denegados.
  const permissions = (0xfffff000 | 0xc0 | 0x04 | 0x800) | 0;
  const fileId = randomBytes.slice(0, 16);
  const fileKey = md5Bytes(concat(paddedUser, oEntry, le32(permissions), fileId)).slice(0, 5);
  const uEntry = rc4(fileKey, Uint8Array.from(PAD_BYTES));
  const fileIdHex = Array.from(fileId)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { fileKey, oEntry, uEntry, permissions, fileIdHex };
}

export function objectKey(fileKey: Uint8Array, objNum: number): Uint8Array {
  return md5Bytes(
    concat(fileKey, new Uint8Array([objNum & 0xff, (objNum >> 8) & 0xff, (objNum >> 16) & 0xff, 0, 0])),
  ).slice(0, 5);
}

// ------------------------------------------------------------- PDF -------
type Dims = { pageW: number; pageH: number; margin: number; contentW: number };

function portraitDims(): Dims {
  const margin = 44;
  return { pageW: 612, pageH: 792, margin, contentW: 612 - margin * 2 };
}

function landscapeDims(): Dims {
  const margin = 40;
  return { pageW: 792, pageH: 612, margin, contentW: 792 - margin * 2 };
}

const WINE = [0.545, 0.149, 0.239];
const GOLD = [0.725, 0.588, 0.353];
const INK = [0.227, 0.161, 0.157];
const GRAY = [0.48, 0.396, 0.388];
const LIGHT_LINE = [0.85, 0.82, 0.8];

function f3(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}

/** Sanitiza a Latin-1 (WinAnsi): lo no representable se vuelve "?". */
export function sanitizePdfText(s: string): string {
  return s
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/·/g, "-")
    .replace(/[^\x09\x0a\x0d\x20-\xff]/g, "?");
}

function escStr(s: string): string {
  return sanitizePdfText(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

type Op =
  | { k: "rect"; x: number; y: number; w: number; h: number; fill: number[] }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; color: number[]; width: number }
  | { k: "text"; x: number; y: number; size: number; bold: boolean; color: number[]; text: string; align?: "left" | "center" | "right"; maxWidth?: number };

function textWidthApprox(text: string, size: number, bold: boolean): number {
  // Ancho medio ~0.55em (0.6 en negrita). Suficiente para truncar, no para justificar.
  return text.length * size * (bold ? 0.6 : 0.55);
}

function fitText(text: string, size: number, bold: boolean, maxWidth: number): string {
  if (textWidthApprox(text, size, bold) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && textWidthApprox(t + "…", size, bold) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

type BuiltPage = { ops: Op[] };

function renderOps(ops: Op[]): Uint8Array {
  const parts: number[] = [];
  const pushStr = (s: string) => {
    for (let i = 0; i < s.length; i++) parts.push(s.charCodeAt(i) & 0xff);
  };
  // OJO: strings en CLARO aquí; todo el stream se cifra una sola vez al
  // serializar (doble cifrado dejaría texto ilegible incluso con la clave).
  const plainStr = (s: string): number[] => {
    const out: number[] = [0x28]; // (
    for (let i = 0; i < s.length; i++) {
      const b = s.charCodeAt(i) & 0xff;
      if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c);
      out.push(b);
    }
    out.push(0x29); // )
    return out;
  };
  for (const op of ops) {
    if (op.k === "rect") {
      const [r, g, b] = op.fill;
      pushStr(`${f3(r)} ${f3(g)} ${f3(b)} rg ${f3(op.x)} ${f3(op.y)} ${f3(op.w)} ${f3(op.h)} re f\n`);
    } else if (op.k === "line") {
      const [r, g, b] = op.color;
      pushStr(`${f3(r)} ${f3(g)} ${f3(b)} RG ${f3(op.width)} w ${f3(op.x1)} ${f3(op.y1)} m ${f3(op.x2)} ${f3(op.y2)} l S\n`);
    } else {
      const [r, g, b] = op.color;
      const font = op.bold ? "/F2" : "/F1";
      let text = op.text;
      let x = op.x;
      if (op.align === "center" || op.align === "right") {
        const w = textWidthApprox(text, op.size, op.bold);
        // Sin maxWidth no hay referencia para alinear: se usa el texto tal cual.
        const max = op.maxWidth ?? w;
        if (w > max) text = fitText(text, op.size, op.bold, max);
        const w2 = textWidthApprox(text, op.size, op.bold);
        x = op.align === "center" ? x + (max - w2) / 2 : x + (max - w2);
      } else if (op.maxWidth !== undefined) {
        text = fitText(text, op.size, op.bold, op.maxWidth);
      }
      // Tm = matriz absoluta (Td acumularía offsets relativos y sacaría
      // todo de la página → PDF en blanco). Coordenadas absolutas siempre.
      pushStr(`BT ${font} ${op.size} Tf ${f3(r)} ${f3(g)} ${f3(b)} rg 1 0 0 1 ${f3(x)} ${f3(op.y)} Tm `);
      const eb = plainStr(escStr(text));
      for (let i = 0; i < eb.length; i++) parts.push(eb[i]);
      pushStr(` Tj ET\n`);
    }
  }
  return Uint8Array.from(parts);
}

type TableModel = { title?: string; head: string[]; rows: string[][]; numericCols?: number[] };

function layoutTable(
  table: TableModel,
  pages: Op[][],
  startY: number[],
  dims: Dims,
  colGap = 8,
): void {
  const { margin, contentW, pageH } = dims;
  const n = table.head.length;
  const numeric = new Set(table.numericCols ?? []);
  const fracs = table.head.map((_, i) => (numeric.has(i) ? 0.8 : 1));
  const totalFrac = fracs.reduce((a, b) => a + b, 0);
  const widths = fracs.map((f) => ((contentW - colGap * (n - 1)) * f) / totalFrac);
  const xPos: number[] = [];
  let acc = margin;
  for (let i = 0; i < n; i++) {
    xPos.push(acc);
    acc += widths[i] + colGap;
  }
  const rowH = 17;
  const headH = 20;
  const needHeader = () => {
    pages[pages.length - 1].push({ k: "rect", x: margin, y: startY[0] - headH + 5, w: contentW, h: headH, fill: WINE });
    table.head.forEach((h, i) => {
      pages[pages.length - 1].push({
        k: "text", x: xPos[i] + 4, y: startY[0] - headH + 10,
        size: 9, bold: true, color: [1, 1, 1], text: h, maxWidth: widths[i] - 8,
      });
    });
    startY[0] -= headH;
  };
  const ensure = (h: number) => {
    if (startY[0] - h < margin) {
      pages.push([]);
      startY[0] = pageH - margin;
      return true;
    }
    return false;
  };
  if (table.title) {
    if (ensure(24)) {
      // título al inicio de página nueva
    }
    pages[pages.length - 1].push({
      k: "text", x: margin, y: startY[0] - 15, size: 13, bold: true, color: WINE, text: table.title,
    });
    startY[0] -= 22;
  }
  ensure(headH);
  needHeader();
  for (const row of table.rows) {
    if (ensure(rowH)) needHeader();
    row.forEach((cell, i) => {
      pages[pages.length - 1].push({
        k: "text", x: xPos[i] + 4, y: startY[0] - rowH + 6,
        size: 9, bold: false, color: INK, text: cell,
        align: numeric.has(i) ? "right" : "left", maxWidth: widths[i] - 8,
      });
    });
    pages[pages.length - 1].push({
      k: "line", x1: margin, y1: startY[0] - rowH, x2: margin + contentW, y2: startY[0] - rowH,
      color: LIGHT_LINE, width: 0.5,
    });
    startY[0] -= rowH;
  }
  startY[0] -= 10;
}

/** Arma el PDF cifrado. Devuelve los bytes del archivo. */
export function buildLockedPdf(
  doc: { title: string; meta: string[]; tables: TableModel[] },
  ownerPassword: string,
  randomBytes: Uint8Array,
  landscape = false,
): Uint8Array {
  const dims = landscape ? landscapeDims() : portraitDims();
  const { margin, contentW, pageW, pageH } = dims;
  const pages: Op[][] = [[]];
  const y = [pageH - margin];
  const put = (op: Op) => pages[pages.length - 1].push(op);
  const newPageIfNeeded = (h: number) => {
    if (y[0] - h < margin) {
      pages.push([]);
      y[0] = pageH - margin;
    }
  };

  put({ k: "text", x: margin, y: y[0] - 24, size: 20, bold: true, color: WINE, text: doc.title, maxWidth: contentW });
  y[0] -= 30;
  put({ k: "rect", x: margin, y: y[0], w: 64, h: 3, fill: GOLD });
  y[0] -= 16;
  for (const m of doc.meta) {
    newPageIfNeeded(14);
    put({ k: "text", x: margin, y: y[0] - 11, size: 10, bold: false, color: GRAY, text: m, maxWidth: contentW });
    y[0] -= 14;
  }
  y[0] -= 6;
  for (const t of doc.tables) layoutTable(t, pages, y, dims);

  // Pies de página (ya se conoce el total).
  pages.forEach((ops, i) => {
    ops.push({
      k: "text", x: margin, y: 30, size: 9, bold: false, color: GRAY,
      text: `Pág. ${i + 1} de ${pages.length}`, align: "right", maxWidth: contentW,
    });
  });

  // Numeración de objetos: 1 catálogo, 2 páginas, 3.. páginas, fuentes, contenidos, encrypt.
  const nPages = pages.length;
  const idFont = 3 + nPages;
  const idFontBold = 4 + nPages;
  const idFirstContent = 5 + nPages;
  const idEncrypt = idFirstContent + nPages;

  const sec = deriveSecurity(ownerPassword, randomBytes);
  const keyFor = (objNum: number) => objectKey(sec.fileKey, objNum);

  type RawObj = { num: number; body: Uint8Array; stream?: Uint8Array };
  const objs: RawObj[] = [];
  const enc = new TextEncoder();
  const raw = (s: string) => enc.encode(s);

  const kids = Array.from({ length: nPages }, (_, i) => `${3 + i} 0 R`).join(" ");
  objs.push({
    num: 1,
    body: raw(`<< /Type /Catalog /Pages 2 0 R >>`),
  });
  objs.push({
    num: 2,
    body: raw(`<< /Type /Pages /Kids [${kids}] /Count ${nPages} >>`),
  });
  for (let i = 0; i < nPages; i++) {
    const contentNum = idFirstContent + i;
    objs.push({
      num: 3 + i,
      body: raw(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentNum} 0 R /Resources << /Font << /F1 ${idFont} 0 R /F2 ${idFontBold} 0 R >> >> >>`,
      ),
    });
  }
  objs.push({
    num: idFont,
    body: raw(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`),
  });
  objs.push({
    num: idFontBold,
    body: raw(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`),
  });
  pages.forEach((ops, i) => {
    objs.push({ num: idFirstContent + i, body: new Uint8Array(0), stream: renderOps(ops) });
  });
  const hexOf = (b: Uint8Array) =>
    Array.from(b)
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  objs.push({
    num: idEncrypt,
    body: raw(
      `<< /Filter /Standard /V 1 /R 2 /O <${hexOf(sec.oEntry)}> /U <${hexOf(sec.uEntry)}> /P ${sec.permissions} >>`,
    ),
  });

  // Serializa con cifrado de streams (los diccionarios van en claro).
  const chunks: Uint8Array[] = [];
  const pushRaw = (s: string) => chunks.push(raw(s));
  const offsets: number[] = [];
  let pos = 0;
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    pos += b.length;
  };
  pushRaw("%PDF-1.4\n");
  pos = 9;
  // Comentario binario de 6 bytes exactos (segunda línea del estándar).
  pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const sorted = [...objs].sort((a, b) => a.num - b.num);
  for (const o of sorted) {
    offsets[o.num] = pos;
    if (o.stream) {
      const key = keyFor(o.num);
      const encData = rc4(key, o.stream);
      const head = raw(`${o.num} 0 obj\n<< /Length ${encData.length} >>\nstream\n`);
      const tail = raw(`\nendstream\nendobj\n`);
      pushBytes(head);
      pushBytes(encData);
      pushBytes(tail);
    } else {
      const body = raw(`${o.num} 0 obj\n`);
      const tail = raw(`\nendobj\n`);
      pushBytes(body);
      pushBytes(o.body);
      pushBytes(tail);
    }
  }
  const xrefPos = pos;
  let xref = `xref\n0 ${idEncrypt + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= idEncrypt; n++) {
    xref += `${String(offsets[n] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pushRaw(xref);
  pushRaw(
    `trailer\n<< /Size ${idEncrypt + 1} /Root 1 0 R /Encrypt ${idEncrypt} 0 R /ID [<${sec.fileIdHex}> <${sec.fileIdHex}>] >>\nstartxref\n${xrefPos}\n%%EOF`,
  );
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
