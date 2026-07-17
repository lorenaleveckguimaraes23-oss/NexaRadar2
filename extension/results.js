document.addEventListener("DOMContentLoaded", () => {
    const sections = document.getElementById("storeSections");
    const filters = document.getElementById("storeFilters");
    const bestOffer = document.getElementById("bestOffer");
    const totalCount = document.getElementById("totalCount");
    const lowestPrice = document.getElementById("lowestPrice");
    const subtitle = document.getElementById("subtitle");
    const sortSelect = document.getElementById("sortSelect");
    const backButton = document.getElementById("backButton");

    let activeStore = "Todas";
    let products = [];

    try {
        products = JSON.parse(
            localStorage.getItem("ultimosResultados") || "[]"
        );
    } catch (error) {
        console.warn("Falha ao ler resultados:", error);
    }

    // Segunda camada de proteção: nunca exibe link sem afiliado.
    const affiliateProducts = products.filter(isAffiliateProduct);

    if (affiliateProducts.length > 0) {
        products = affiliateProducts;
    }

    const query = localStorage.getItem("ultimaBusca");

    if (query) {
        subtitle.textContent =
            `Resultados para “${query}”, separados por loja.`;
    }

    backButton.addEventListener("click", () => {
        history.length > 1 ? history.back() : window.close();
    });

    sortSelect.addEventListener("change", render);

    renderFilters();
    render();

    function renderFilters() {
        const stores = [
            "Todas",
            ...new Set(products.map((product) => product.loja).filter(Boolean))
        ];

        filters.innerHTML = "";

        stores.forEach((store) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className =
                `filter-button${store === activeStore ? " active" : ""}`;
            button.textContent = store;

            button.addEventListener("click", () => {
                activeStore = store;
                renderFilters();
                render();
            });

            filters.appendChild(button);
        });
    }

    function render() {
        let visible = [...products];

        if (activeStore !== "Todas") {
            visible = visible.filter(
                (product) => product.loja === activeStore
            );
        }

        visible = sortProducts(visible);

        totalCount.textContent = String(visible.length);

        const prices = visible
            .map((product) => Number(product.preco))
            .filter(Number.isFinite);

        lowestPrice.textContent = prices.length
            ? formatCurrency(Math.min(...prices))
            : "—";

        renderBestOffer(visible);
        renderStoreSections(visible);
    }

    function renderBestOffer(list) {
        bestOffer.innerHTML = "";

        if (!list.length) {
            bestOffer.classList.add("hidden");
            return;
        }

        const best = [...list].sort(
            (a, b) => Number(a.preco) - Number(b.preco)
        )[0];

        const imageWrap = document.createElement("div");
        imageWrap.className = "best-image";
        appendImage(imageWrap, best);

        const content = document.createElement("div");
        content.className = "best-content";

        const label = document.createElement("span");
        label.className = "best-label";
        label.textContent = `🏆 Melhor oferta · ${best.loja}`;

        const title = document.createElement("h2");
        title.textContent = best.nome;

        const price = document.createElement("strong");
        price.className = "best-price";
        price.textContent = formatCurrency(best.preco);

        const link = createOfferLink(best);

        content.append(label, title, price, link);
        bestOffer.append(imageWrap, content);
        bestOffer.classList.remove("hidden");
    }

    function renderStoreSections(list) {
        sections.innerHTML = "";

        if (!list.length) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent =
                "Nenhuma oferta afiliada foi encontrada para este filtro.";
            sections.appendChild(empty);
            return;
        }

        const grouped = new Map();

        for (const product of list) {
            if (!grouped.has(product.loja)) {
                grouped.set(product.loja, []);
            }

            grouped.get(product.loja).push(product);
        }

        for (const [store, storeProducts] of grouped) {
            const section = document.createElement("section");
            section.className = "store-section";

            const heading = document.createElement("div");
            heading.className = "store-heading";

            const title = document.createElement("h2");
            title.textContent = store;

            const count = document.createElement("span");
            count.textContent =
                `${storeProducts.length} oferta${storeProducts.length === 1 ? "" : "s"}`;

            heading.append(title, count);

            const grid = document.createElement("div");
            grid.className = "product-grid";

            storeProducts.forEach((product) => {
                grid.appendChild(createCard(product));
            });

            section.append(heading, grid);
            sections.appendChild(section);
        }
    }

    function createCard(product) {
        const card = document.createElement("article");
        card.className = "product-card";

        const imageWrap = document.createElement("div");
        imageWrap.className = "product-image";
        appendImage(imageWrap, product);

        const body = document.createElement("div");
        body.className = "product-body";

        const title = document.createElement("h3");
        title.textContent = product.nome;

        const price = document.createElement("strong");
        price.className = "product-price";
        price.textContent = formatCurrency(product.preco);

        body.append(title, price, createOfferLink(product));
        card.append(imageWrap, body);

        return card;
    }

    function appendImage(container, product) {
        const source =
            product.imagem ||
            product.image ||
            product.thumbnail ||
            "";

        if (!source) {
            container.innerHTML =
                '<span class="placeholder">Imagem indisponível</span>';
            return;
        }

        const image = document.createElement("img");
        image.src = source;
        image.alt = product.nome || "Produto";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";

        image.addEventListener("error", () => {
            container.innerHTML =
                '<span class="placeholder">Imagem indisponível</span>';
        });

        container.appendChild(image);
    }

    function createOfferLink(product) {
        const link = document.createElement("a");
        link.className = "offer-link";
        link.href = product.link;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `Ver oferta na ${product.loja}`;
        return link;
    }

    function sortProducts(list) {
        const sorted = [...list];

        if (sortSelect.value === "lowest") {
            sorted.sort((a, b) => Number(a.preco) - Number(b.preco));
        }

        if (sortSelect.value === "highest") {
            sorted.sort((a, b) => Number(b.preco) - Number(a.preco));
        }

        return sorted;
    }

    function isAffiliateProduct(product) {
        const store = normalize(product?.loja);
        const link = String(product?.link || "");

        try {
            const url = new URL(link);

            if (store.includes("amazon")) {
                return url.searchParams.get("tag") === "nexastore028-20";
            }

            if (store.includes("mercado livre")) {
                return (
                    url.hostname === "meli.la" ||
                    (
                        url.hostname.includes("mercadolivre.com.br") &&
                        url.pathname.startsWith("/social/lc20260707150211")
                    )
                );
            }

            if (store.includes("kabum")) {
                return (
                    url.hostname.includes("awin1.com") &&
                    url.searchParams.get("awinmid") === "17729" &&
                    url.searchParams.get("awinaffid") === "2980279"
                );
            }

            if (store.includes("cobasi")) {
                return url.hash.toLowerCase().includes("nexastoreonline");
            }

            return false;
        } catch {
            return false;
        }
    }

    function normalize(value = "") {
        return String(value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
    }

    function formatCurrency(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return "Consulte";
        }

        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL"
        }).format(number);
    }
});
