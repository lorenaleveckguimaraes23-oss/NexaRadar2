const axios = require("axios");
const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
chromium.use(stealth);

const BASE = "https://www.cobasi.com.br";
function linkAfiliado(href = "") {
  try { const u = new URL(href, BASE); u.hash = "nexastoreonline"; return u.toString(); }
  catch { return ""; }
}

function ofertaVtex(produto) {
  for (const item of produto?.items || []) {
    for (const seller of item?.sellers || []) {
      const oferta = seller?.commertialOffer || seller?.commercialOffer;
      const preco = Number(oferta?.Price);
      if (Number.isFinite(preco) && preco > 0) {
        return { preco, imagem: item?.images?.[0]?.imageUrl || '' };
      }
    }
  }
  return { preco: null, imagem: '' };
}

async function viaApi(termo) {
  const r = await axios.get(`${BASE}/api/catalog_system/pub/products/search`, {
    params: { ft: termo, _from: 0, _to: 19 }, timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json", Referer: `${BASE}/` },
    validateStatus: (s) => s >= 200 && s < 500
  });
  if (r.status !== 200 || !Array.isArray(r.data)) return [];
  return r.data.map((p) => {
    const oferta = ofertaVtex(p);
    const href = p.link || (p.linkText ? `${BASE}/${p.linkText}/p` : '');
    return { loja: "Cobasi", nome: p.productName || p.productTitle || '', preco: oferta.preco, link: linkAfiliado(href), imagem: oferta.imagem };
  }).filter((p) => p.nome && Number.isFinite(p.preco) && p.link);
}

async function viaBrowser(termo) {
  let navegador;
  try {
    navegador = await chromium.launch({ headless: true });
    const contexto = await navegador.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 1000 }, locale: "pt-BR"
    });
    const pagina = await contexto.newPage();
    await pagina.goto(`${BASE}/busca?q=${encodeURIComponent(termo)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pagina.waitForSelector('[class*="product-summary"], [class*="productSummary"], article', { timeout: 30000 }).catch(() => {});
    const produtos = await pagina.evaluate(() => {
      const cards = [...document.querySelectorAll('[class*="product-summary"], [class*="productSummary"], article')];
      const parse = (t='') => { const m=t.match(/R\$\s*([\d.]+,\d{2})/); return m ? Number(m[1].replace(/\./g,'').replace(',','.')) : null; };
      return cards.map((card) => {
        const nome = card.querySelector('[class*="productName"], [class*="product-name"], h2, h3')?.textContent?.trim() || '';
        const a = card.querySelector('a[href*="/p"]') || card.querySelector('a[href]');
        const img = card.querySelector('img[srcset], img[src], img');
        return { nome, preco: parse(card.textContent || ''), href: a?.getAttribute('href') || '', imagem: img?.currentSrc || img?.src || img?.getAttribute('data-src') || '' };
      }).filter((p) => p.nome && Number.isFinite(p.preco) && p.href);
    });
    return produtos.map((p) => ({ loja: "Cobasi", nome: p.nome, preco: p.preco, link: linkAfiliado(p.href), imagem: p.imagem }));
  } finally { if (navegador) await navegador.close(); }
}

async function buscarCobasi(termo) {
  try {
    const api = await viaApi(termo);
    if (api.length) return api;
    return await viaBrowser(termo);
  } catch (error) {
    console.error("[Cobasi] Erro:", error.message);
    try { return await viaBrowser(termo); } catch (e) { console.error("[Cobasi] Fallback:", e.message); return []; }
  }
}
module.exports = { buscarCobasi };
