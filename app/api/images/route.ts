const SHEET_CSV =
  "https://docs.google.com/spreadsheets/d/1166xitL8s5Du4cWE194b6GCjhcC4zgF2XslelnGBfH4/export?format=csv&gid=959071204";

let cached: { expires: number; items: string[][] } | null = null;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export async function GET() {
  try {
    if (cached && cached.expires > Date.now()) {
      return Response.json({ items: cached.items, count: cached.items.length });
    }
    const response = await fetch(SHEET_CSV, {
      headers: { "user-agent": "Mozilla/5.0" },
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`Google Sheet HTTP ${response.status}`);
    const rows = parseCsv(await response.text());
    const items = rows
      .slice(1)
      .map((csvRow) => [String(csvRow[0] ?? "").trim(), String(csvRow[1] ?? "").trim()])
      .filter(([sku, url]) => sku && url);
    cached = { expires: Date.now() + 10 * 60 * 1000, items };
    return Response.json({ items, count: items.length });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Không đọc được bảng hình" },
      { status: 502 },
    );
  }
}
