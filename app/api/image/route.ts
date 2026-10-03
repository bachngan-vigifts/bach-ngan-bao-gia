function driveId(value: string) {
  return value.match(/\/d\/([\w-]+)/)?.[1] ?? value.match(/[?&]id=([\w-]+)/)?.[1] ?? "";
}

function allowed(url: URL) {
  return ["sapo.dktcdn.net","bizweb.dktcdn.net"].includes(url.hostname) || url.hostname === "drive.google.com" || url.hostname === "lh3.googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com");
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const source = requestUrl.searchParams.get("src") ?? "";
    const icon = requestUrl.searchParams.get("size") === "icon";
    const parsed = new URL(source);
    if (parsed.protocol !== "https:" || !allowed(parsed)) return new Response("Nguồn ảnh không được hỗ trợ", { status: 400 });
    const id = driveId(source);
    const pixels = icon ? 160 : 1200;
    const candidates = [id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${pixels}` : "", id ? `https://lh3.googleusercontent.com/d/${id}=w${pixels}` : "", source].filter(Boolean);
    for (const candidate of candidates) {
      const response = await fetch(candidate, { headers: { "user-agent": "Mozilla/5.0" }, redirect: "follow" });
      const type = response.headers.get("content-type") ?? "";
      if (response.ok && type.startsWith("image/")) {
        return new Response(response.body, { headers: { "content-type": type, "cache-control": "public, max-age=2592000, immutable" } });
      }
    }
    return new Response("Không tải được ảnh Drive", { status: 404 });
  } catch {
    return new Response("Đường dẫn ảnh không hợp lệ", { status: 400 });
  }
}
