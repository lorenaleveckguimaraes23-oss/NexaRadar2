const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
chromium.use(stealth);

const BASE = "https://www.amazon.com.br";
const TAG = "nexastore028-20";

function linkAfiliado(href = "") {
  try {
    const url = new URL(href, BASE);
    const match = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (match) return `${BASE}/dp/${match[1]}?tag=${TAG}`;
    url.searchParams.set("tag", TAG);
    return url.toString();
  } catch { return ""; }
}

async function buscarAmazon(termo) {
  let navegador;
  try {
    navegador = await chromium.launch({ headless: true });
    const contexto = await navegador.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 1000 },
      locale: "pt-BR",
      extraHTTPHeaders: { "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8" }
    });
    const pagina = await contexto.newPage();
    await pagina.goto(`${BASE}/s?k=${encodeURIComponent(termo)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pagina.waitForSelector('[data-component-type="s-search-result"], div.puis-card-container', { timeout: 30000 }).catch(() => {});

    const produtos = await pagina.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-component-type="s-search-result"], div.puis-card-container')];
      const parsePreco = (card) => {
        const off = card.querySelector('.a-price .a-offscreen')?.textContent?.trim();
        if (off) {
          const n = Number.parseFloat(off.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
          if (Number.isFinite(n)) return n;
        }
        const inteiro = card.querySelector('.a-price-whole')?.textContent?.replace(/\D/g, '');
        const fracao = card.querySelector('.a-price-fraction')?.textContent?.replace(/\D/g, '') || '00';
        return inteiro ? Number(`${inteiro}.${fracao}`) : null;
      };
      return cards.map((card) => {
        const nome = card.querySelector('h2 span')?.textContent?.trim() || card.querySelector('h2')?.textContent?.trim() || '';
        const a = card.querySelector('h2 a') || card.querySelector('a[href*="/dp/"]');
        const img = card.querySelector('img.s-image') || card.querySelector('img');
        return {
          nome,
          preco: parsePreco(card),
          href: a?.getAttribute('href') || '',
          imagem: img?.currentSrc || img?.src || img?.getAttribute('data-src') || ''
        };
      }).filter((p) => p.nome && Number.isFinite(p.preco) && p.href);
    });

    return produtos.map((p) => ({ loja: "Amazon", nome: p.nome, preco: p.preco, link: linkAfiliado(p.href), imagem: p.imagem }));
  } catch (error) {
    console.error("[Amazon] Erro:", error.message);
    return [];
  } finally {
    if (navegador) await navegador.close();
  }
}
module.exports = { buscarAmazon };
