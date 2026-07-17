const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
chromium.use(stealth);

const BASE = "https://www.kabum.com.br";
const AWIN_MERCHANT_ID = "17729";
const AWIN_AFFILIATE_ID = "2980279";

function linkAfiliado(link) {
  try {
    const destino = new URL(link, BASE).toString();
    return `https://www.awin1.com/cread.php?awinmid=${AWIN_MERCHANT_ID}&awinaffid=${AWIN_AFFILIATE_ID}&ued=${encodeURIComponent(destino)}`;
  } catch {
    return "";
  }
}

async function buscarKabum(termo) {
  let navegador;

  try {
    navegador = await chromium.launch({ headless: true });

    const contexto = await navegador.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 1000 },
      locale: "pt-BR",
      extraHTTPHeaders: {
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8"
      }
    });

    const pagina = await contexto.newPage();

    await pagina.goto(`${BASE}/busca/${encodeURIComponent(termo)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await pagina.waitForTimeout(4000);

    const brutos = await pagina.evaluate(() => {
      function preco(texto = "") {
        const achado = String(texto).match(/R\$\s*([\d.]+,\d{2})/);
        if (!achado) return null;

        const numero = Number.parseFloat(
          achado[1].replace(/\./g, "").replace(",", ".")
        );

        return Number.isFinite(numero) ? numero : null;
      }

      function absoluta(valor = "") {
        try {
          return new URL(valor, location.origin).href;
        } catch {
          return "";
        }
      }

      const produtos = [];

      // Estratégia 1: dados estruturados.
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const json = JSON.parse(script.textContent || "{}");
          const blocos = Array.isArray(json) ? json : [json];

          for (const bloco of blocos) {
            let candidatos = [];

            if (bloco?.["@type"] === "ItemList") {
              candidatos = (bloco.itemListElement || []).map(x => x.item || x);
            } else if (bloco?.["@type"] === "Product") {
              candidatos = [bloco];
            } else if (Array.isArray(bloco?.["@graph"])) {
              candidatos = bloco["@graph"].filter(x => x?.["@type"] === "Product");
            }

            for (const item of candidatos) {
              const oferta = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              const valor = Number(oferta?.price || oferta?.lowPrice);
              const nome = String(item.name || "").trim();
              const link = absoluta(item.url || oferta?.url || "");
              const img = Array.isArray(item.image) ? item.image[0] : item.image;

              if (nome && Number.isFinite(valor) && link) {
                produtos.push({
                  nome,
                  preco: valor,
                  linkOriginal: link,
                  imagem: absoluta(img || "")
                });
              }
            }
          }
        } catch {}
      }

      // Estratégia 2: cards visuais.
      const links = document.querySelectorAll(
        'a[href*="/produto/"], a[href*="/produto"], a[href*="/p/"]'
      );

      for (const a of links) {
        const card =
          a.closest('article, li, [data-testid*="product"], [class*="productCard"], [class*="ProductCard"], [class*="product-card"]')
          || a.parentElement?.parentElement;

        if (!card) continue;

        const nome =
          card.querySelector('h2, h3, [class*="name"], [class*="Name"], [class*="title"], [class*="Title"]')
            ?.textContent?.trim()
          || a.getAttribute("title")?.trim()
          || "";

        const valor = preco(card.textContent || "");
        const img = card.querySelector("img");

        if (nome && valor) {
          produtos.push({
            nome,
            preco: valor,
            linkOriginal: absoluta(a.getAttribute("href") || ""),
            imagem: absoluta(img?.currentSrc || img?.src || img?.getAttribute("data-src") || "")
          });
        }
      }

      return produtos;
    });

    const unicos = new Map();

    for (const item of brutos) {
      const chave = `${item.nome.toLowerCase()}|${item.preco}`;

      if (!unicos.has(chave)) {
        unicos.set(chave, {
          loja: "KaBuM!",
          nome: item.nome,
          preco: item.preco,
          link: linkAfiliado(item.linkOriginal),
          imagem: item.imagem || ""
        });
      }
    }

    const produtos = [...unicos.values()];
    console.log(`[KaBuM!] ${produtos.length} produto(s) encontrados.`);
    return produtos;
  } catch (erro) {
    console.error("[KaBuM!] Erro:", erro.message);
    return [];
  } finally {
    if (navegador) await navegador.close();
  }
}

module.exports = { buscarKabum };
