const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

chromium.use(stealth);

const BASE = "https://lista.mercadolivre.com.br";

function limparLinkProduto(href = "") {
  try {
    const url = new URL(href);
    url.hash = "";

    const parametrosRemover = [
      "polycard_client", "be_origin", "search_layout", "position", "type",
      "tracking_id", "wid", "sid", "matt_tool", "matt_word", "matt_source"
    ];

    parametrosRemover.forEach((parametro) => url.searchParams.delete(parametro));
    return url.toString();
  } catch {
    return String(href || "").split("#")[0];
  }
}

async function buscarMercadoLivre(termo) {
  let navegador;

  try {
    navegador = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });

    const contexto = await navegador.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 1000 },
      locale: "pt-BR",
      extraHTTPHeaders: {
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8"
      }
    });

    const pagina = await contexto.newPage();
    const slug = encodeURIComponent(String(termo).trim()).replace(/%20/g, "-");

    await pagina.goto(`${BASE}/${slug}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await pagina.waitForSelector(
      "li.ui-search-layout__item, div.ui-search-result, .poly-card",
      { timeout: 30000 }
    ).catch(() => null);

    const produtos = await pagina.evaluate(() => {
      const cards = [...document.querySelectorAll(
        "li.ui-search-layout__item, div.ui-search-result, .poly-card"
      )].slice(0, 24);

      const texto = (elemento) => elemento?.textContent?.replace(/\s+/g, " ").trim() || "";

      const parsePreco = (card) => {
        const inteiro = texto(card.querySelector(".andes-money-amount__fraction")).replace(/\D/g, "");
        const centavos = texto(card.querySelector(".andes-money-amount__cents")).replace(/\D/g, "") || "00";
        return inteiro ? Number(`${inteiro}.${centavos}`) : null;
      };

      return cards.map((card) => {
        const nome = texto(card.querySelector(
          ".poly-component__title, .ui-search-item__title, h2"
        ));

        const anchor = card.querySelector(
          "a.poly-component__title, a.ui-search-link, a[href*='mercadolivre.com.br']"
        );

        const imagem = card.querySelector(
          "img.poly-component__picture, img.ui-search-result-image__element, img"
        );

        return {
          nome,
          preco: parsePreco(card),
          href: anchor?.href || anchor?.getAttribute("href") || "",
          imagem: imagem?.currentSrc || imagem?.src || imagem?.getAttribute("data-src") || ""
        };
      }).filter((produto) =>
        produto.nome && Number.isFinite(produto.preco) && produto.href
      );
    });

    return produtos.map((produto) => ({
      loja: "Mercado Livre",
      nome: produto.nome,
      preco: produto.preco,
      link: limparLinkProduto(produto.href),
      imagem: produto.imagem
    }));
  } catch (error) {
    console.error("[Mercado Livre] Erro:", error.message);
    return [];
  } finally {
    if (navegador) {
      await navegador.close().catch(() => null);
    }
  }
}

module.exports = { buscarMercadoLivre, limparLinkProduto };
