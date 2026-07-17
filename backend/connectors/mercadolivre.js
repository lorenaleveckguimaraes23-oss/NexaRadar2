const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
chromium.use(stealth);

const BASE = "https://lista.mercadolivre.com.br";
const ETIQUETA_AFILIADO = "lc20260707150211";

function linkAfiliado(href = "") {
  try {
    const url = new URL(href);
    url.searchParams.set("af", "true");
    url.searchParams.set("at", "1");
    url.searchParams.set("e", ETIQUETA_AFILIADO);
    return url.toString();
  } catch { return href; }
}

async function buscarMercadoLivre(termo) {
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
    const slug = encodeURIComponent(termo.trim()).replace(/%20/g, '-');
    await pagina.goto(`${BASE}/${slug}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pagina.waitForSelector('li.ui-search-layout__item, div.ui-search-result', { timeout: 30000 }).catch(() => {});

    const produtos = await pagina.evaluate(() => {
      const cards = [...document.querySelectorAll('li.ui-search-layout__item, div.ui-search-result')];
      const parsePreco = (card) => {
        const inteiro = card.querySelector('.andes-money-amount__fraction')?.textContent?.replace(/\D/g, '');
        const centavos = card.querySelector('.andes-money-amount__cents')?.textContent?.replace(/\D/g, '') || '00';
        return inteiro ? Number(`${inteiro}.${centavos}`) : null;
      };
      return cards.map((card) => {
        const nome = card.querySelector('h2, .poly-component__title, .ui-search-item__title')?.textContent?.trim() || '';
        const a = card.querySelector('a.poly-component__title, a.ui-search-link, a[href*="mercadolivre.com.br"]');
        const img = card.querySelector('img.poly-component__picture, img.ui-search-result-image__element, img');
        return {
          nome,
          preco: parsePreco(card),
          href: a?.href || a?.getAttribute('href') || '',
          imagem: img?.currentSrc || img?.src || img?.getAttribute('data-src') || ''
        };
      }).filter((p) => p.nome && Number.isFinite(p.preco) && p.href);
    });

    return produtos.map((p) => ({ loja: "Mercado Livre", nome: p.nome, preco: p.preco, link: linkAfiliado(p.href), imagem: p.imagem }));
  } catch (error) {
    console.error("[Mercado Livre] Erro:", error.message);
    return [];
  } finally {
    if (navegador) await navegador.close();
  }
}
module.exports = { buscarMercadoLivre };
