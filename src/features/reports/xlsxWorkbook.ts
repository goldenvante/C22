/**
 * Núcleo puro del XLSX de cierre (sin imports de React Native/Expo):
 * hash legacy de Excel, construcción del XML y ensamblado de partes.
 * Intencionalmente autocontenido para poder verificarse con node.
 */

export type CierreEvento = {
  nombre: string;
  codigo: string;
};

export type CierreTicket = {
  folio: number;
  comprador_nombre: string;
  fase_nombre: string;
  vendedor_nombre: string;
  precio_pagado: number;
  metodo_pago: "EFECTIVO" | "TRANSFERENCIA" | "OTRO";
  estado: "ACTIVO" | "UTILIZADO" | "CANCELADO";
  es_cortesia: boolean;
};

/**
 * Hash legacy de Excel para sheet protection (16 bits, verificado contra
 * ejemplo documentado: "abcdefghij" -> "FEF1"). Débil por diseño de Excel,
 * pero es el mecanismo real que Excel aplica. NO inventado.
 */
export function legacyPasswordHash(password: string): string {
  let hash = 0x0000;
  for (let i = password.length; i > 0; i--) {
    const c = password.charCodeAt(i - 1);
    hash = (((hash >> 14) & 0x01) | ((hash << 1) & 0x7fff)) ^ c;
    hash &= 0xffff;
  }
  hash = (((hash >> 14) & 0x01) | ((hash << 1) & 0x7fff));
  hash ^= password.length;
  hash ^= 0xce4b;
  hash &= 0xffff;
  return hash.toString(16).toUpperCase().padStart(4, "0");
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function colLetter(index0: number): string {
  let s = "";
  let i = index0 + 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

export type CellDef =
  | { t: "s"; v: string; style?: number }
  | { t: "n"; v: number; style?: number };

function cellXml(ref: string, cell: CellDef): string {
  const s = cell.style ?? 0;
  if (cell.t === "s") {
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escXml(cell.v)}</t></is></c>`;
  }
  const v = Number.isFinite(cell.v) ? Math.round(cell.v * 100) / 100 : 0;
  return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
}

// Estilos: 0 normal, 1 encabezado (vino/crema), 2 moneda, 3 título, 4 total,
// 5 texto con wrap (nombres largos).
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>
<fonts count="4">
<font><sz val="11"/><color rgb="FF3A2928"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFF7EFE3"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF8B263D"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF8B263D"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF8B263D"/><bgColor indexed="64"/></patternFill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(
  title: string,
  rows: CellDef[][],
  passwordHash: string,
  opts?: { widths?: number[]; headerRow?: number; rowHts?: (number | undefined)[] },
): string {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const widths = opts?.widths ?? [];
  const cols =
    widths.length > 0
      ? `<cols>${widths
          .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
          .join("")}</cols>`
      : "";
  const body = rows
    .map((row, ri) => {
      const cells = row
        .map((cell, ci) => cellXml(`${colLetter(ci)}${ri + 1}`, cell))
        .join("");
      const ht = opts?.rowHts?.[ri];
      return ht ? `<row r="${ri + 1}" ht="${ht}" customHeight="1">${cells}</row>` : `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  const dim = `A1:${colLetter(Math.max(0, maxCols - 1))}${rows.length}`;
  // Encabezado congelado + autofiltro sobre su fila (1-based). Sin headerRow no hay.
  const hr = opts?.headerRow;
  const frozen =
    hr !== undefined && hr >= 1 && hr <= rows.length
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${hr}" topLeftCell="A${hr + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${hr + 1}" sqref="A${hr + 1}"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const filter =
    hr !== undefined && hr >= 1 && hr <= rows.length
      ? `<autoFilter ref="A${hr}:${colLetter(Math.max(0, maxCols - 1))}${hr}"/>`
      : "";
  void title;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="${dim}"/>${frozen}
<sheetFormat defaultRowHeight="15"/>
${cols}<sheetData>${body}</sheetData>
<sheetProtection password="${passwordHash}" sheet="1" objects="1" scenarios="1"/>
${filter}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

export type CierreSheet = {
  name: string;
  rows: CellDef[][];
  widths?: number[];
  /** Fila 1-based del encabezado a congelar/filtrar. */
  headerRow?: number;
  /** Alturas por fila (para wrap). */
  rowHts?: (number | undefined)[];
};

function money(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

function fmtFolio(folio: number): string {
  return `FM-${String(folio).padStart(4, "0")}`;
}

const METODO_ES: Record<CierreTicket["metodo_pago"], string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

const ESTADO_ES: Record<CierreTicket["estado"], string> = {
  ACTIVO: "Activo",
  UTILIZADO: "Utilizado",
  CANCELADO: "Cancelado",
};

/** Hojas del cierre a partir de los tickets ya filtrados del evento. */
export function buildCierreSheets(
  event: CierreEvento,
  tickets: CierreTicket[],
  generado: string,
): CierreSheet[] {
  const vigentes = tickets.filter((t) => t.estado !== "CANCELADO");
  const sum = (list: CierreTicket[], m: CierreTicket["metodo_pago"]) =>
    list
      .filter((t) => !t.es_cortesia && t.metodo_pago === m)
      .reduce((a, t) => a + money(t.precio_pagado), 0);
  const countMet = (m: CierreTicket["metodo_pago"]) =>
    vigentes.filter((t) => !t.es_cortesia && t.metodo_pago === m).length;
  const cortesias = vigentes.filter((t) => t.es_cortesia).length;
  const total =
    sum(vigentes, "EFECTIVO") + sum(vigentes, "TRANSFERENCIA") + sum(vigentes, "OTRO");

  const totales: CellDef[][] = [
    [{ t: "s", v: `Cierre — ${event.nombre} (${event.codigo})`, style: 3 }],
    [{ t: "s", v: `Generado: ${generado}` }],
    [
      { t: "s", v: "Concepto", style: 1 },
      { t: "s", v: "Boletos", style: 1 },
      { t: "s", v: "Importe", style: 1 },
    ],
    [{ t: "s", v: "Efectivo" }, { t: "n", v: countMet("EFECTIVO") }, { t: "n", v: sum(vigentes, "EFECTIVO"), style: 2 }],
    [{ t: "s", v: "Transferencia" }, { t: "n", v: countMet("TRANSFERENCIA") }, { t: "n", v: sum(vigentes, "TRANSFERENCIA"), style: 2 }],
    [{ t: "s", v: "Otro" }, { t: "n", v: countMet("OTRO") }, { t: "n", v: sum(vigentes, "OTRO"), style: 2 }],
    [
      { t: "s", v: "TOTAL", style: 4 },
      { t: "n", v: countMet("EFECTIVO") + countMet("TRANSFERENCIA") + countMet("OTRO"), style: 4 },
      { t: "n", v: total, style: 2 },
    ],
    [{ t: "s", v: "Cortesías (sin importe)" }, { t: "n", v: cortesias }, { t: "n", v: 0, style: 2 }],
  ];

  const bySeller = new Map<string, { label: string; list: CierreTicket[] }>();
  for (const t of vigentes) {
    const key = t.vendedor_nombre;
    if (!bySeller.has(key)) bySeller.set(key, { label: key, list: [] });
    bySeller.get(key)!.list.push(t);
  }
  const sellers = [...bySeller.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
  const vendedores: CellDef[][] = [
    [{ t: "s", v: `Por vendedor — ${event.nombre}`, style: 3 }],
    [
      { t: "s", v: "Vendedor", style: 1 },
      { t: "s", v: "Efectivo", style: 1 },
      { t: "s", v: "Transferencia", style: 1 },
      { t: "s", v: "Otro", style: 1 },
      { t: "s", v: "Cortesías", style: 1 },
      { t: "s", v: "Total", style: 1 },
    ],
  ];
  const totV = { e: 0, t: 0, o: 0, c: 0 };
  for (const g of sellers) {
    const e = g.list.filter((t) => !t.es_cortesia && t.metodo_pago === "EFECTIVO").reduce((a, t) => a + money(t.precio_pagado), 0);
    const tr = g.list.filter((t) => !t.es_cortesia && t.metodo_pago === "TRANSFERENCIA").reduce((a, t) => a + money(t.precio_pagado), 0);
    const o = g.list.filter((t) => !t.es_cortesia && t.metodo_pago === "OTRO").reduce((a, t) => a + money(t.precio_pagado), 0);
    const c = g.list.filter((t) => t.es_cortesia).length;
    totV.e += e;
    totV.t += tr;
    totV.o += o;
    totV.c += c;
    vendedores.push([
      { t: "s", v: g.label },
      { t: "n", v: e, style: 2 },
      { t: "n", v: tr, style: 2 },
      { t: "n", v: o, style: 2 },
      { t: "n", v: c },
      { t: "n", v: e + tr + o, style: 2 },
    ]);
  }
  vendedores.push([
    { t: "s", v: "TOTAL", style: 4 },
    { t: "n", v: totV.e, style: 2 },
    { t: "n", v: totV.t, style: 2 },
    { t: "n", v: totV.o, style: 2 },
    { t: "n", v: totV.c, style: 4 },
    { t: "n", v: totV.e + totV.t + totV.o, style: 2 },
  ]);

  const sections: { title: string; list: CierreTicket[] }[] = [
    { title: "UTILIZADOS", list: tickets.filter((t) => t.estado === "UTILIZADO").sort((a, b) => a.folio - b.folio) },
    { title: "ACTIVOS SIN INGRESAR", list: tickets.filter((t) => t.estado === "ACTIVO").sort((a, b) => a.folio - b.folio) },
    { title: "CANCELADOS", list: tickets.filter((t) => t.estado === "CANCELADO").sort((a, b) => a.folio - b.folio) },
  ];
  const boletos: CellDef[][] = [
    [{ t: "s", v: `Boletos — ${event.nombre} (${event.codigo})`, style: 3 }],
  ];
  for (const sec of sections) {
    boletos.push([{ t: "s", v: `${sec.title} (${sec.list.length})`, style: 4 }]);
    boletos.push([
      { t: "s", v: "Folio", style: 1 },
      { t: "s", v: "Comprador", style: 1 },
      { t: "s", v: "Fase", style: 1 },
      { t: "s", v: "Vendedor", style: 1 },
      { t: "s", v: "Precio", style: 1 },
      { t: "s", v: "Método", style: 1 },
      { t: "s", v: "Estado", style: 1 },
      { t: "s", v: "Cortesía", style: 1 },
    ]);
    for (const t of sec.list) {
      boletos.push([
        { t: "s", v: fmtFolio(t.folio) },
        { t: "s", v: t.comprador_nombre },
        { t: "s", v: t.fase_nombre },
        { t: "s", v: t.vendedor_nombre },
        { t: "n", v: money(t.precio_pagado), style: 2 },
        { t: "s", v: `${METODO_ES[t.metodo_pago]}${t.es_cortesia ? " (Cortesía)" : ""}` },
        { t: "s", v: ESTADO_ES[t.estado] },
        { t: "s", v: t.es_cortesia ? "SI" : "NO" },
      ]);
    }
  }

  return [
    {
      name: "Totales",
      rows: totales,
      widths: [30, 12, 16],
      headerRow: 3,
    },
    {
      name: "Por vendedor",
      rows: vendedores,
      widths: [26, 14, 16, 14, 12, 16],
      headerRow: 2,
    },
    {
      name: "Boletos",
      rows: boletos,
      widths: [12, 30, 20, 22, 14, 16, 14, 12],
    },
  ];
}

/** Ensambla las partes del .xlsx. Clave = ruta dentro del zip. */
export function assembleCierreWorkbook(  sheets: CierreSheet[],
  passwordHash: string,
  creator: string,
  createdIso: string,
): Map<string, string> {
  const files = new Map<string, string>();
  files.set(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  );
  files.set(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  );
  files.set(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
      sheets.map((s, i) => `<sheet name="${escXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      `</sheets></workbook>`,
  );
  files.set(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  files.set("xl/styles.xml", STYLES);
  sheets.forEach((s, i) =>
    files.set(
      `xl/worksheets/sheet${i + 1}.xml`,
      sheetXml(s.name, s.rows, passwordHash, {
        widths: s.widths,
        headerRow: s.headerRow,
        rowHts: s.rowHts,
      }),
    ),
  );
  files.set(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>${escXml(creator)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${createdIso}</dcterms:created></cp:coreProperties>`,
  );
  files.set(
    "docProps/app.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Comite C22</Application></Properties>`,
  );
  return files;
}

export type ReportRow = {
  folio: string;
  evento: string;
  fase: string;
  comprador: string;
  vendedor: string;
  precio: number;
  metodo: string;
  fecha: string;
  estado: string;
  cortesia: boolean;
};

/**
 * Hoja "Reporte de ventas": cabecera C22, meta de filtros, RESUMEN en
 * tarjetas-tabla, DETALLE con wrap + autofiltro + encabezado congelado y
 * bloque final de TOTALES calculado de las mismas filas mostradas.
 */
export function buildReportSheets(
  meta: { evento: string; periodo: string; generado: string },
  rows: ReportRow[],
): CierreSheet[] {
  const out: CellDef[][] = [];
  const hts: (number | undefined)[] = [];
  const push = (row: CellDef[], ht?: number) => {
    out.push(row);
    hts.push(ht);
  };

  push([{ t: "s", v: "COMITÉ C22", style: 3 }]);
  push([{ t: "s", v: "REPORTE DE VENTAS", style: 3 }]);
  push([{ t: "s", v: `Evento: ${meta.evento}` }]);
  push([{ t: "s", v: `Periodo: ${meta.periodo}` }]);
  push([{ t: "s", v: `Generado: ${meta.generado}` }]);
  push([{ t: "s", v: "RESUMEN", style: 4 }]);

  const vigentes = rows.filter((r) => r.estado !== "Cancelado");
  const vendidos = vigentes.length;
  const ingresos = vigentes.reduce((a, r) => a + (Number.isFinite(r.precio) ? r.precio : 0), 0);
  const kpis: [string, string][] = [
    ["Boletos vendidos", String(vendidos)],
    ["Ingresos", `$${ingresos.toFixed(2)}`],
    ["Cortesías", String(vigentes.filter((r) => r.cortesia).length)],
    ["Utilizados", String(rows.filter((r) => r.estado === "Utilizado").length)],
    ["Cancelados", String(rows.filter((r) => r.estado === "Cancelado").length)],
  ];
  for (const [label, value] of kpis) {
    push([
      { t: "s", v: label, style: 4 },
      { t: "s", v: value, style: 4 },
    ]);
  }

  push([{ t: "s", v: "DETALLE DE VENTAS", style: 4 }]);
  const headerIdx = out.length + 1; // 1-based
  const head = ["Folio", "Evento", "Etapa", "Comprador", "Vendedor", "Precio", "Método de pago", "Fecha de venta", "Estado", "Tipo"];
  push(head.map((h) => ({ t: "s" as const, v: h, style: 1 })));
  for (const r of rows) {
    push(
      [
        { t: "s", v: r.folio },
        { t: "s", v: r.evento, style: 5 },
        { t: "s", v: r.fase, style: 5 },
        { t: "s", v: r.comprador, style: 5 },
        { t: "s", v: r.vendedor, style: 5 },
        { t: "n", v: Math.round(r.precio * 100) / 100, style: 2 },
        { t: "s", v: r.metodo },
        { t: "s", v: r.fecha },
        { t: "s", v: r.estado },
        { t: "s", v: r.cortesia ? "CORTESÍA" : "Normal" },
      ],
      30,
    );
  }

  push([{ t: "s", v: "TOTALES", style: 4 }]);
  push([{ t: "s", v: "TOTAL DE BOLETOS:", style: 4 }, { t: "n", v: vendidos, style: 4 }]);
  push([{ t: "s", v: "TOTAL INGRESOS:", style: 4 }, { t: "n", v: Math.round(ingresos * 100) / 100, style: 2 }]);

  return [
    {
      name: "Reporte de ventas",
      rows: out,
      widths: [12, 28, 20, 30, 22, 14, 16, 18, 14, 12],
      headerRow: headerIdx,
      rowHts: hts,
    },
  ];
}
