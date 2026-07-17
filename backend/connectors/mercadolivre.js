const axios = require("axios");
const cheerio = require("cheerio");
const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();

chromium.use(stealth);

const BASE = "https://lista.mercadolivre.com.br";

function slug(termo) {
  return encodeURIComponent(String(termo || "").trim()).replace(/%20/g, "-");
}

function limparLink(href = "") {
  try {
    const url = new URL(href, "https://www.mercadolivre.com.br");
    url.hash = "";

    [
      "polycard_client",
      "be_origin",
      "search_layout",
      "position",
      "type",
      "tracking_id",
      "wid",
      "sid",
      "matt_tool",
      "matt_word",
      "matt_source"
    ].forEach((parametro) => url.searchParams.delete(parametro));

    return url.toString();
  } catch {
    return String(href || "").split("#")[0];
  }
}

function numeroPreco(valor) {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : null;
  }

  const texto = String(valor || "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!texto) return null;

  let normalizado = texto;

  if (texto.includes(",") && texto.includes(".")) {
    normalizado = texto.replace(/\./g, "").replace(",", ".");
  } else if (texto.includes(",")) {
    normalizado = texto.replace(",", ".");
  }

  const numero = Number.parseFloat(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

function produtoValido(produto) {
  return Boolean(
    produto &&
    produto.nome &&
    produto.link &&
    Number.isFinite(produto.preco) &&
    produto.preco > 0
  );
}

function removerDuplicados(produtos) {
  const mapa = new Map();

  for (const produto of produtos) {
    const chave = limparLink(produto.link);

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        ...produto,
        link: chave
      });
    }
  }

  return [...mapa.values()];
}

function extrairJsonLd($) {
  const produtos = [];

  $("script[type='application/ld+json']").each((_, elemento) => {
    const bruto = $(elemento).html();

    if (!bruto) return;

    try {
      const dados = JSON.parse(bruto);
      const filas = Array.isArray(dados) ? dados : [dados];

      for (const item of filas) {
        const elementos =
          item?.itemListElement ||
          item?.mainEntity?.itemListElement ||
          [];

        for (const entrada of elementos) {
          const produto = entrada?.item || entrada;

          const nome =
            produto?.name ||
            produto?.item?.name ||
            "";

          const link =
            produto?.url ||
            produto?.item?.url ||
            "";

          const oferta =
            produto?.offers ||
            produto?.item?.offers ||
            {};

          const preco =
            numeroPreco(oferta?.price) ||
            numeroPreco(oferta?.lowPrice);

          const imagem =
            Array.isArray(produto?.image)
              ? produto.image[0]
              : produto?.image || "";

          const resultado = {
            loja: "Mercado Livre",
            nome: String(nome || "").trim(),
            preco,
            link: limparLink(link),
            imagem: String(imagem || "")
          };

          if (produtoValido(resultado)) {
            produtos.push(resultado);
          }
        }
      }
    } catch {
      // Alguns scripts JSON-LD não são JSON válido. Ignora e continua.
    }
  });

  return produtos;
}

function extrairCardsHtml($) {
  const produtos = [];

  const seletoresCards = [
    "li.ui-search-layout__item",
    ".ui-search-result",
    ".ui-search-result__wrapper",
    ".poly-card",
    "[class*='poly-card']",
    "[data-testid*='product']"
  ].join(",");

  $(seletoresCards).each((_, elemento) => {
    if (produtos.length >= 40) return false;

    const card = $(elemento);

    const nome = card
      .find([
        ".poly-component__title",
        ".ui-search-item__title",
        "[class*='title']",
        "h2",
        "h3"
      ].join(","))
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const link = card
      .find([
        "a.poly-component__title",
        "a.ui-search-link",
        "a[href*='/p/MLB']",
        "a[href*='mercadolivre.com.br']"
      ].join(","))
      .first()
      .attr("href");

    const fracao = card
      .find(".andes-money-amount__fraction")
      .first()
      .text()
      .replace(/\D/g, "");

    const centavos = card
      .find(".andes-money-amount__cents")
      .first()
      .text()
      .replace(/\D/g, "");

    let preco = null;

    if (fracao) {
      preco = Number(`${fracao}.${centavos || "00"}`);
    }

    if (!Number.isFinite(preco)) {
      const textoPreco = card
        .find("[class*='price'], [class*='money']")
        .first()
        .text();

      preco = numeroPreco(textoPreco);
    }

    const imagem =
      card.find("img").first().attr("data-src") ||
      card.find("img").first().attr("src") ||
      "";

    const produto = {
      loja: "Mercado Livre",
      nome,
      preco,
      link: limparLink(link),
      imagem
    };

    if (produtoValido(produto)) {
      produtos.push(produto);
    }
  });

  return produtos;
}

async function viaHttp(termo) {
  const url = `${BASE}/${slug(termo)}`;

  const resposta = await axios.get(url, {
    timeout: 30000,
    maxRedirects: 5,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
      Accept: "text/html,application/xhtml+xml"
    },
    validateStatus: (status) => status >= 200 && status < 500
  });

  if (resposta.status !== 200 || typeof resposta.data !== "string") {
    console.warn(`[Mercado Livre] HTTP ${resposta.status}`);
    return [];
  }

  const $ = cheerio.load(resposta.data);

  const titulo = $("title").text().trim();
  const htmlMenor = resposta.data.toLowerCase();

  if (
    htmlMenor.includes("captcha") ||
    htmlMenor.includes("robot") ||
    htmlMenor.includes("access denied")
  ) {
    console.warn(`[Mercado Livre] HTTP bloqueado: ${titulo || "sem título"}`);
    return [];
  }

  const jsonLd = extrairJsonLd($);
  const cards = extrairCardsHtml($);
  const produtos = removerDuplicados([...jsonLd, ...cards]);

  console.log(
    `[Mercado Livre] HTTP: jsonLd=${jsonLd.length}, cards=${cards.length}, total=${produtos.length}`
  );

  return produtos;
}

async function viaBrowser(termo) {
  let navegador;

  try {
    navegador = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled"
      ]
    });

    const contexto = await navegador.newContext({
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      viewport: { width: 1440, height: 1100 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/124.0.0.0 Safari/537.36"
    });

    const pagina = await contexto.newPage();

    await pagina.goto(`${BASE}/${slug(termo)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await pagina.waitForTimeout(3500);

    const titulo = await pagina.title();
    const urlFinal = pagina.url();

    const diagnostico = await pagina.evaluate(() => ({
      cardsUi: document.querySelectorAll("li.ui-search-layout__item").length,
      cardsPoly: document.querySelectorAll(".poly-card, [class*='poly-card']").length,
      linksProduto: document.querySelectorAll(
        "a[href*='/p/MLB'], a[href*='mercadolivre.com.br']"
      ).length,
      tamanhoHtml: document.documentElement.innerHTML.length,
      textoInicial: document.body?.innerText?.slice(0, 250) || ""
    }));

    console.log(
      "[Mercado Livre] Browser diagnóstico:",
      JSON.stringify({
        titulo,
        urlFinal,
        ...diagnostico
      })
    );

    const produtos = await pagina.evaluate(() => {
      const limparTexto = (elemento) =>
        elemento?.textContent?.replace(/\s+/g, " ").trim() || "";

      const numero = (valor) => {
        const texto = String(valor || "")
          .replace(/\s/g, "")
          .replace(/[^\d,.-]/g, "");

        if (!texto) return null;

        let normalizado = texto;

        if (texto.includes(",") && texto.includes(".")) {
          normalizado = texto.replace(/\./g, "").replace(",", ".");
        } else if (texto.includes(",")) {
          normalizado = texto.replace(",", ".");
        }

        const resultado = Number.parseFloat(normalizado);
        return Number.isFinite(resultado) ? resultado : null;
      };

      const seletores = [
        "li.ui-search-layout__item",
        ".ui-search-result",
        ".ui-search-result__wrapper",
        ".poly-card",
        "[class*='poly-card']",
        "[data-testid*='product']"
      ];

      const cards = [...document.querySelectorAll(seletores.join(","))];

      const resultados = cards.slice(0, 50).map((card) => {
        const titulo = card.querySelector(
          ".poly-component__title, .ui-search-item__title, [class*='title'], h2, h3"
        );

        const ancora = card.querySelector(
          "a.poly-component__title, a.ui-search-link, a[href*='/p/MLB'], a[href*='mercadolivre.com.br']"
        );

        const fracao = limparTexto(
          card.querySelector(".andes-money-amount__fraction")
        ).replace(/\D/g, "");

        const centavos = limparTexto(
          card.querySelector(".andes-money-amount__cents")
        ).replace(/\D/g, "");

        let preco = fracao
          ? Number(`${fracao}.${centavos || "00"}`)
          : null;

        if (!Number.isFinite(preco)) {
          preco = numero(
            limparTexto(
              card.querySelector("[class*='price'], [class*='money']")
            )
          );
        }

        const imagem = card.querySelector("img");

        return {
          nome: limparTexto(titulo),
          link: ancora?.href || "",
          preco,
          imagem:
            imagem?.currentSrc ||
            imagem?.src ||
            imagem?.getAttribute("data-src") ||
            ""
        };
      });

      if (resultados.some((produto) => produto.nome && produto.link)) {
        return resultados;
      }

      // Fallback: parte dos layouts atuais não usa os containers antigos.
      return [...document.querySelectorAll("a[href*='/p/MLB']")]
        .slice(0, 50)
        .map((ancora) => {
          const card =
            ancora.closest("li, article, div[class*='card'], div[class*='result']") ||
            ancora.parentElement;

          const nome =
            limparTexto(
              card?.querySelector(
                ".poly-component__title, .ui-search-item__title, [class*='title'], h2, h3"
              )
            ) ||
            limparTexto(ancora);

          const fracao = limparTexto(
            card?.querySelector(".andes-money-amount__fraction")
          ).replace(/\D/g, "");

          const centavos = limparTexto(
            card?.querySelector(".andes-money-amount__cents")
          ).replace(/\D/g, "");

          let preco = fracao
            ? Number(`${fracao}.${centavos || "00"}`)
            : null;

          if (!Number.isFinite(preco)) {
            preco = numero(
              limparTexto(
                card?.querySelector("[class*='price'], [class*='money']")
              )
            );
          }

          const imagem = card?.querySelector("img");

          return {
            nome,
            link: ancora.href,
            preco,
            imagem:
              imagem?.currentSrc ||
              imagem?.src ||
              imagem?.getAttribute("data-src") ||
              ""
          };
        });
    });

    const normalizados = removerDuplicados(
      produtos
        .map((produto) => ({
          loja: "Mercado Livre",
          nome: String(produto.nome || "").trim(),
          preco: numeroPreco(produto.preco),
          link: limparLink(produto.link),
          imagem: String(produto.imagem || "")
        }))
        .filter(produtoValido)
    );

    console.log(`[Mercado Livre] Browser produtos: ${normalizados.length}`);

    return normalizados;
  } finally {
    if (navegador) {
      await navegador.close().catch(() => null);
    }
  }
}

async function buscarMercadoLivre(termo) {
  try {
    const produtosHttp = await viaHttp(termo);

    if (produtosHttp.length > 0) {
      return produtosHttp;
    }

    console.warn("[Mercado Livre] HTTP vazio; usando navegador.");
    return await viaBrowser(termo);
  } catch (erroHttp) {
    console.error("[Mercado Livre] HTTP erro:", erroHttp.message);

    try {
      return await viaBrowser(termo);
    } catch (erroBrowser) {
      console.error("[Mercado Livre] Browser erro:", erroBrowser.message);
      return [];
    }
  }
}

module.exports = {
  buscarMercadoLivre,
  limparLink
};
