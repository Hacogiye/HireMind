// lib/jd.js — Fetch tin tuyển dụng từ URL, nhiều tầng dự phòng.
// Giờ 2:35: tầng DIRECT (fetch trực tiếp) — đủ cho pipeline chạy end-to-end.
// Giờ 3:45: thêm tầng proxy reader + tầng headless browser (TopCV/ITviec chặn
// Cloudflare, fetch thường ăn 403) — thêm tier vào mảng TIERS, không đổi giao diện.
const dns = require('dns').promises;

const FETCH_TIMEOUT_MS = 15000;
const MAX_JD_FETCH_CHARS = 60000;

function badUrl(msg) {
  const e = new Error(msg);
  e.noRetry = true;
  return e;
}

// Chuẩn hóa IPv4 mọi dạng (dotted, decimal, hex) về 4 octet — null nếu lạ
function normalizeIpv4(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    if (n >= 0 && n <= 0xffffffff) return [24, 16, 8, 0].map(sh => (n >>> sh) & 255).join('.');
  }
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const h = parseInt(host.slice(2), 16);
    return [24, 16, 8, 0].map(sh => (h >>> sh) & 255).join('.');
  }
  return null;
}

function isPrivateIpv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return true;               // this-host, private, loopback
  if (a === 169 && b === 254) return true;                          // link-local (metadata cloud)
  if (a === 172 && b >= 16 && b <= 31) return true;                 // private
  if (a === 192 && b === 168) return true;                          // private
  if (a === 100 && b >= 64 && b <= 127) return true;                // CGNAT
  return false;
}

function isPrivateIpv6(host) {
  const h = host.toLowerCase();
  if (h === '::' || h === '::1') return true;
  if (h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true; // link-local / unique-local
  // IPv4-mapped ::ffff:127.0.0.1
  const m = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return isPrivateIpv4(m[1]);
  return false;
}

// SSRF guard: URL do USER cung cấp — bắt buộc chặn địa chỉ nội bộ/metadata trước khi fetch.
// Chặn: scheme lạ, IPv6 private, IPv4 private (mọi cách viết), hostname nội bộ,
// VÀ DNS resolve ra IP private (rebinding). Mọi tầng fetch đều phải qua đây.
async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw badUrl('URL không hợp lệ.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw badUrl('Chỉ hỗ trợ link http/https.');
  let host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) throw badUrl('URL thiếu hostname.');
  if (host.includes(':')) {
    if (isPrivateIpv6(host)) throw badUrl('Không cho phép truy cập địa chỉ nội bộ.');
  } else {
    const ip = normalizeIpv4(host);
    if (ip) {
      if (isPrivateIpv4(ip)) throw badUrl('Không cho phép truy cập địa chỉ nội bộ.');
    } else if (/^(localhost|metadata|instance-data)/i.test(host) || host.endsWith('.local') || host.endsWith('.internal')) {
      throw badUrl('Không cho phép truy cập địa chỉ nội bộ.');
    }
  }
  // DNS resolve — chặn domain công khai trỏ vào IP nội bộ (rebinding)
  try {
    const addrs = await dns.lookup(host, { all: true, verbatim: true });
    for (const { address } of addrs) {
      if (address.includes(':') ? isPrivateIpv6(address) : isPrivateIpv4(address)) {
        throw badUrl('Link này trỏ tới địa chỉ nội bộ — bị chặn vì lý do bảo mật.');
      }
    }
  } catch (e) {
    if (e.noRetry) throw e;
    throw badUrl('Không phân giải được tên miền từ link JD.');
  }
  return u;
}

// Fetch với redirect MANUAL — mỗi bước redirect đều kiểm tra lại SSRF
// (redirect:'follow' của fetch cho phép public URL 302 về 127.0.0.1 mà không bị kiểm lại)
async function fetchWithGuard(url, hops) {
  const u = await assertPublicUrl(url);
  const res = await fetch(u.href, {
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HireMind/1.0', 'Accept-Language': 'vi,en;q=0.8' },
  });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (!loc || hops >= 3) throw new Error('Quá nhiều lần redirect');
    return fetchWithGuard(new URL(loc, u.href).href, hops + 1);
  }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  return text.slice(0, MAX_JD_FETCH_CHARS);
}

// Trích text thô từ HTML: bỏ script/style/tag, giải thực, nén khoảng trắng
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Giao diện duy nhất pipeline gọi: fetchJD(url) → { text, via }
// Tầng hiện có: direct. Giờ 3:45 thêm 'proxy' + 'browser' vào mảng này.
const TIERS = [
  {
    name: 'direct',
    async run(url) {
      const html = await fetchWithGuard(url, 0);
      const text = htmlToText(html);
      if (text.length < 200) throw new Error('Nội dung trang quá ngắn — có thể bị chặn hoặc không phải trang JD');
      return text;
    },
  },
];

async function fetchJD(url) {
  const errs = [];
  for (const tier of TIERS) {
    try {
      const text = await tier.run(url);
      if (text && text.trim()) return { text: text.trim(), via: tier.name };
    } catch (e) {
      errs.push(`${tier.name}: ${e.message.slice(0, 80)}`);
    }
  }
  const e = new Error('Mọi tầng fetch đều thất bại — ' + errs.join(' | '));
  e.friendly = 'Không tải được nội dung từ link JD (site có thể chặn truy cập tự động).';
  throw e;
}

module.exports = { fetchJD, assertPublicUrl };
