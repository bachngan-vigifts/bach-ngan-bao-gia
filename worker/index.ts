import {copyMedia, serveMediaFile} from '../lib/r2-media.mjs';
/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { staffApi, staffPageMember, staffPageRole } from '../lib/staff-api.mjs';
import { vigiftsMirrorApi } from '../lib/vigifts-mirror-api.mjs';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  FILES: R2Bucket;
  NEON_DATABASE_URL?: string;
  VIGIFTS_MEDIA_SYNC_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/ping') {
      return new Response(JSON.stringify({ ok: true, service: 'bach-ngan-bao-gia', ts: new Date().toISOString() }), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (url.pathname.startsWith('/_vigifts-import/')) return new Response('Not found', {status:404});
    if (url.pathname.startsWith('/api/staff/')) return staffApi(request, env);
    if (url.pathname.startsWith('/api/vigifts/')) {
      const member = await staffPageMember(env.DB, request);
      const mediaSync = url.pathname === '/api/vigifts/media-cache' && Boolean(request.headers.get('authorization'));
      if (!member && !mediaSync) return new Response(JSON.stringify({error:'Vui lòng đăng nhập bằng email công ty.'}), {status:401, headers:{'Content-Type':'application/json; charset=utf-8'}});
      return vigiftsMirrorApi(request, env, member || {role:'media-sync'});
    }

    if (url.pathname === '/api/image' && request.method === 'GET' && await staffPageMember(env.DB, request)) {
      try {const saved=await copyMedia(env.FILES,url.searchParams.get('src')||'');return serveMediaFile(env.FILES,saved.id);} catch { /* Preserve the original image fallback when the source cannot be copied. */ }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const extensionMatch = url.pathname.match(/\/[^/]+\.([^/.]+)$/);
    const pageRequest = (request.method === 'GET' || request.method === 'HEAD')
      && ((request.headers.get('accept') || '').includes('text/html') || ['/', '/quote', '/quote.html', '/index.html'].includes(url.pathname))
      && (!extensionMatch || extensionMatch[1] === 'html');
    const supplierPagePaths = new Set(['/supplier', '/supplier.html', '/login.html']);
    if (pageRequest && !supplierPagePaths.has(url.pathname) && await staffPageRole(env.DB, request) === 'supplier') {
      return Response.redirect(new URL('/supplier', url), 302);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
