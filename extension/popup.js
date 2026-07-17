// =====================================
// NEXA RADAR 2.1.1
// =====================================

document.addEventListener("DOMContentLoaded", () => {
    const searchButton = document.getElementById("searchButton");
    const searchInput = document.getElementById("searchInput");
    const loading = document.getElementById("loading");
    const results = document.getElementById("results");
    const summary = document.getElementById("summary");
    const feedback = document.getElementById("searchFeedback");

    restoreLastResults();

    searchButton.addEventListener("click", searchProducts);

    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            searchProducts();
        }
    });

    searchInput.addEventListener("input", () => {
        hideFeedback();
    });

    async function searchProducts() {
        const query = searchInput.value.trim();

        if (!query) {
            showFeedback("Digite o nome de um produto para iniciar a busca.");
            searchInput.focus();
            return;
        }

        setLoading(true);
        hideFeedback();
        results.innerHTML = "";
        summary.classList.add("hidden");

        try {
            const response = await fetch(
                `https://nexaradar2.onrender.com/search?q=${encodeURIComponent(query)}`,
                {
                    method: "GET",
                    headers: {
                        Accept: "application/json"
                    }
                }
            );

            if (!response.ok) {
                throw new Error(
                    `O servidor respondeu com status ${response.status}.`
                );
            }

            const data = await response.json();

            if (!data?.sucesso) {
                throw new Error(
                    data?.erro || "Não foi possível buscar as ofertas."
                );
            }

            const products = Array.isArray(data.produtos)
                ? data.produtos
                : [];

            localStorage.setItem(
                "ultimosResultados",
                JSON.stringify(products)
            );

            localStorage.setItem("ultimaBusca", query);

            renderResults(products);
        } catch (error) {
            console.error("Erro ao buscar ofertas:", error);

            showFeedback(
                error.message === "Failed to fetch"
                    ? "Não foi possível conectar ao servidor do Nexa Radar. Tente novamente em alguns instantes."
                    : error.message
            );

            renderEmptyState(
                "Busca indisponível",
                "Tente novamente em alguns instantes."
            );
        } finally {
            setLoading(false);
        }
    }

    function restoreLastResults() {
        try {
            const savedResults = JSON.parse(
                localStorage.getItem("ultimosResultados") || "[]"
            );

            const lastQuery = localStorage.getItem("ultimaBusca");

            if (lastQuery) {
                searchInput.value = lastQuery;
            }

            if (
                Array.isArray(savedResults) &&
                savedResults.length > 0
            ) {
                renderResults(savedResults);
            }
        } catch (error) {
            console.warn(
                "Não foi possível restaurar os resultados salvos:",
                error
            );

            localStorage.removeItem("ultimosResultados");
        }
    }

    function setLoading(isLoading) {
        searchButton.disabled = isLoading;
        searchButton.classList.toggle("is-loading", isLoading);
        loading.classList.toggle("visible", isLoading);
    }

    function showFeedback(message) {
        feedback.textContent = message;
        feedback.classList.add("visible");
    }

    function hideFeedback() {
        feedback.textContent = "";
        feedback.classList.remove("visible");
    }
});


function limparUrlMercadoLivre(value) {
    try {
        const url = new URL(String(value));
        url.hash = "";
        url.search = "";
        return url.toString();
    } catch {
        return String(value || "").split("#")[0].split("?")[0];
    }
}

function isMercadoLivre(product) {
    const loja = String(product?.loja || product?.store || "").toLowerCase();
    const link = String(product?.link || product?.url || "").toLowerCase();

    return loja.includes("mercado livre") || link.includes("mercadolivre.com.br");
}

async function converterLinksMercadoLivre(products) {
    const lista = Array.isArray(products)
        ? products.map((product) => ({ ...product }))
        : [];

    const urls = lista
        .filter(isMercadoLivre)
        .map((product) => limparUrlMercadoLivre(product.link || product.url))
        .filter(Boolean);

    if (!urls.length) {
        return lista;
    }

    try {
        const resposta = await chrome.runtime.sendMessage({
            action: "GERAR_LINKS_AFILIADOS_ML",
            urls
        });

        if (!resposta?.sucesso) {
            console.warn("[Mercado Livre] Links afiliados não gerados:", resposta?.erro);
            return lista;
        }

        const links = resposta.links || {};

        return lista.map((product) => {
            if (!isMercadoLivre(product)) return product;

            const original = limparUrlMercadoLivre(product.link || product.url);
            const afiliado = links[original];

            if (!afiliado) return { ...product, link: original };

            return {
                ...product,
                link: afiliado,
                linkOriginal: original,
                afiliadoConfirmado: true
            };
        });
    } catch (error) {
        console.error("[Mercado Livre] Erro ao converter links:", error);
        return lista;
    }
}

function renderResults(products) {
    const results = document.getElementById("results");
    const summary = document.getElementById("summary");
    const resultCount = document.getElementById("resultCount");
    const lowestPrice = document.getElementById("lowestPrice");

    results.innerHTML = "";

    if (!Array.isArray(products) || products.length === 0) {
        summary.classList.add("hidden");

        renderEmptyState(
            "Nenhuma oferta encontrada",
            "Tente pesquisar usando outro nome ou uma descrição mais curta."
        );

        return;
    }

    const normalizedProducts = products
        .map(normalizeProduct)
        .filter((product) => product.name && product.url);

    if (normalizedProducts.length === 0) {
        summary.classList.add("hidden");

        renderEmptyState(
            "Resultados inválidos",
            "As ofertas recebidas não possuem as informações necessárias."
        );

        return;
    }

    normalizedProducts.sort((a, b) => {
        if (a.price === null) return 1;
        if (b.price === null) return -1;

        return a.price - b.price;
    });

    const validPrices = normalizedProducts
        .map((product) => product.price)
        .filter((price) => Number.isFinite(price));

    const minimumPrice = validPrices.length
        ? Math.min(...validPrices)
        : null;

    const maximumPrice = validPrices.length
        ? Math.max(...validPrices)
        : null;

    resultCount.textContent = String(normalizedProducts.length);

    lowestPrice.textContent =
        minimumPrice === null
            ? "Consulte"
            : formatCurrency(minimumPrice);

    summary.classList.remove("hidden");

    // Mostra somente a melhor oferta no popup.
    const bestProduct = normalizedProducts[0];

    const card = createProductCard({
        ...bestProduct,
        isBestOffer: bestProduct.price !== null,
        position: 1,
        maximumPrice
    });

    card.style.animationDelay = "0ms";

    results.appendChild(card);

    // Abre a página completa com todas as ofertas.
    if (normalizedProducts.length > 1) {
        const moreButton = document.createElement("button");

        moreButton.type = "button";
        moreButton.className = "more-results-button";

        moreButton.setAttribute(
            "aria-label",
            `Ver todas as ${normalizedProducts.length} ofertas`
        );

        const moreText = document.createElement("span");

        moreText.textContent =
            `Quer mais? Veja aqui! (${normalizedProducts.length} ofertas)`;

        const moreIcon = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
        );

        moreIcon.setAttribute("viewBox", "0 0 24 24");
        moreIcon.setAttribute("aria-hidden", "true");

        const moreIconPath = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
        );

        moreIconPath.setAttribute(
            "d",
            "M7 17 17 7M8 7h9v9"
        );

        moreIconPath.setAttribute(
            "stroke-linecap",
            "round"
        );

        moreIconPath.setAttribute(
            "stroke-linejoin",
            "round"
        );

        moreIcon.appendChild(moreIconPath);

        moreButton.append(
            moreText,
            moreIcon
        );

        moreButton.addEventListener("click", () => {
            chrome.tabs.create({
                url: chrome.runtime.getURL("results.html")
            });
        });

        results.appendChild(moreButton);
    }
}

function normalizeProduct(product) {
    const rawPrice =
        product?.preco ??
        product?.price ??
        product?.valor ??
        null;

    const parsedPrice = parsePrice(rawPrice);

    return {
        name: String(
            product?.nome ??
            product?.name ??
            "Produto sem nome"
        ).trim(),

        store: String(
            product?.loja ??
            product?.store ??
            "Loja parceira"
        ).trim(),

        url: sanitizeUrl(
            product?.link ??
            product?.url ??
            ""
        ),

        image: sanitizeUrl(
            product?.imagem ??
            product?.image ??
            product?.imageUrl ??
            product?.thumbnail ??
            ""
        ),

        price: parsedPrice,

        rating: parseRating(
            product?.avaliacao ??
            product?.rating
        ),

        reviews:
            Number(
                product?.avaliacoes ??
                product?.reviews ??
                0
            ) || 0
    };
}

function createProductCard(product) {
    const article = document.createElement("article");

    article.className =
        `card${product.isBestOffer ? " best-offer" : ""}`;

    if (product.isBestOffer) {
        const badge = document.createElement("span");

        badge.className = "best-badge";
        badge.textContent = "🏆 Melhor oferta";

        article.appendChild(badge);
    }

    const imageWrap = document.createElement("div");

    imageWrap.className = "product-image-wrap";

    if (product.image) {
        const image = document.createElement("img");

        image.className = "product-image";
        image.src = product.image;
        image.alt = product.name;
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";

        image.addEventListener("error", () => {
            imageWrap.replaceChildren(
                createImagePlaceholder()
            );
        });

        imageWrap.appendChild(image);
    } else {
        imageWrap.appendChild(
            createImagePlaceholder()
        );
    }

    const content = document.createElement("div");

    content.className = "product-content";

    const topLine = document.createElement("div");

    topLine.className = "product-topline";

    const store = document.createElement("span");

    store.className = "store";
    store.textContent = product.store;

    const position = document.createElement("span");

    position.className = "position";
    position.textContent = `#${product.position}`;

    topLine.append(store, position);

    const title = document.createElement("h2");

    title.textContent = product.name;
    title.title = product.name;

    const rating = createRating(
        product.rating,
        product.reviews
    );

    const priceRow = document.createElement("div");

    priceRow.className = "price-row";

    const priceBlock = document.createElement("div");

    const priceLabel = document.createElement("span");

    priceLabel.className = "price-label";
    priceLabel.textContent = "Preço encontrado";

    const price = document.createElement("strong");

    price.className = "price";

    price.textContent =
        product.price === null
            ? "Consulte"
            : formatCurrency(product.price);

    priceBlock.append(priceLabel, price);
    priceRow.appendChild(priceBlock);

    if (
        product.price !== null &&
        product.maximumPrice !== null &&
        product.maximumPrice > product.price
    ) {
        const difference =
            product.maximumPrice - product.price;

        const savings = document.createElement("span");

        savings.className = "savings";

        savings.textContent =
            `Economize ${formatCurrency(difference)}`;

        priceRow.appendChild(savings);
    }

    const offerLink = document.createElement("a");

    offerLink.className = "offer-button";
    offerLink.href = product.url;
    offerLink.target = "_blank";
    offerLink.rel = "noopener noreferrer";

    offerLink.setAttribute(
        "aria-label",
        `Ver oferta de ${product.name} na loja ${product.store}`
    );

    const offerText = document.createElement("span");

    offerText.textContent = "Ver oferta";

    const arrow = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
    );

    arrow.setAttribute("viewBox", "0 0 24 24");
    arrow.setAttribute("aria-hidden", "true");

    const arrowPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
    );

    arrowPath.setAttribute(
        "d",
        "M7 17 17 7M8 7h9v9"
    );

    arrowPath.setAttribute(
        "stroke-linecap",
        "round"
    );

    arrowPath.setAttribute(
        "stroke-linejoin",
        "round"
    );

    arrow.appendChild(arrowPath);

    offerLink.append(
        offerText,
        arrow
    );

    content.append(
        topLine,
        title,
        rating,
        priceRow,
        offerLink
    );

    article.append(
        imageWrap,
        content
    );

    return article;
}

function createRating(ratingValue, reviews) {
    const rating = document.createElement("div");

    rating.className = "rating";

    const stars = document.createElement("span");

    stars.className = "stars";

    if (ratingValue === null) {
        stars.textContent = "★★★★★";
        stars.style.opacity = "0.35";
    } else {
        const rounded = Math.max(
            0,
            Math.min(5, Math.round(ratingValue))
        );

        stars.textContent =
            "★".repeat(rounded) +
            "☆".repeat(5 - rounded);
    }

    const text = document.createElement("span");

    text.className = "rating-text";

    if (ratingValue === null) {
        text.textContent =
            "Avaliação não informada";
    } else {
        const reviewText =
            reviews > 0
                ? ` · ${reviews} avaliações`
                : "";

        text.textContent =
            `${ratingValue.toFixed(1)}${reviewText}`;
    }

    rating.append(
        stars,
        text
    );

    return rating;
}

function createImagePlaceholder() {
    const placeholder = document.createElement("div");

    placeholder.className =
        "product-placeholder";

    placeholder.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
            />
            <path
                d="m7 16 3.2-3.2a1.5 1.5 0 0 1 2.1 0L15 15.5l1-1a1.5 1.5 0 0 1 2.1 0L20 16.4"
            />
            <circle
                cx="9"
                cy="9"
                r="1.2"
            />
        </svg>
    `;

    return placeholder;
}

function renderEmptyState(
    titleText,
    descriptionText
) {
    const results =
        document.getElementById("results");

    results.innerHTML = "";

    const state =
        document.createElement("div");

    state.className = "empty-state";

    const icon =
        document.createElement("div");

    icon.className = "empty-icon";

    icon.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
            />
        </svg>
    `;

    const title =
        document.createElement("h2");

    title.textContent = titleText;

    const description =
        document.createElement("p");

    description.textContent =
        descriptionText;

    state.append(
        icon,
        title,
        description
    );

    results.appendChild(state);
}

function parsePrice(value) {
    if (typeof value === "number") {
        return Number.isFinite(value)
            ? value
            : null;
    }

    if (typeof value !== "string") {
        return null;
    }

    const normalized = value
        .replace(/[^\d,.-]/g, "")
        .replace(/\.(?=\d{3}(?:\D|$))/g, "")
        .replace(",", ".");

    const parsed =
        Number.parseFloat(normalized);

    return Number.isFinite(parsed)
        ? parsed
        : null;
}

function parseRating(value) {
    const parsed = Number.parseFloat(
        String(value ?? "").replace(",", ".")
    );

    if (!Number.isFinite(parsed)) {
        return null;
    }

    return Math.max(
        0,
        Math.min(5, parsed)
    );
}

function sanitizeUrl(value) {
    if (!value) {
        return "";
    }

    try {
        const url = new URL(
            String(value)
        );

        if (
            !["http:", "https:"].includes(
                url.protocol
            )
        ) {
            return "";
        }

        return url.href;
    } catch {
        return "";
    }
}

function formatCurrency(value) {
    return new Intl.NumberFormat(
        "pt-BR",
        {
            style: "currency",
            currency: "BRL"
        }
    ).format(value);
}