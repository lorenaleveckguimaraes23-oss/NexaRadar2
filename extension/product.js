// =====================================
// NEXA RADAR
// PRODUCTS RENDER
// =====================================

function mostrarProdutos(produtos) {

    const areaResultados =
        document.getElementById("results");

    if (!areaResultados) {

        console.error(
            "Área de resultados não encontrada."
        );

        return;
    }

    areaResultados.innerHTML = "";

    if (!Array.isArray(produtos) || produtos.length === 0) {

        areaResultados.innerHTML = `
            <div class="card card-vazio">

                <h3>
                    Nenhuma oferta encontrada.
                </h3>

                <p>
                    Tente pesquisar outro produto.
                </p>

            </div>
        `;

        return;
    }

    produtos.forEach((produto) => {

        const card =
            document.createElement("article");

        card.className = "card";

        const precoExibido =
            produto.precoFormatado ||
            formatarPreco(produto.preco);

        card.innerHTML = `
            <img
                src="${produto.imagem || "assets/logo.png"}"
                alt="${produto.nome || "Produto"}"
                class="produto-imagem"
            >

            <div class="produto-conteudo">

                <span class="store">
                    ${produto.loja || "Loja"}
                </span>

                <h3>
                    ${produto.nome || "Produto encontrado"}
                </h3>

                <p class="price">
                    ${precoExibido}
                </p>

                <p class="aviso-link">
                    Link comum de produto
                </p>

                <button
                    type="button"
                    class="botao-oferta"
                >
                    Ver no ${produto.loja || "site"}
                </button>

            </div>
        `;

        const imagem =
            card.querySelector(".produto-imagem");

        imagem.addEventListener(
            "error",
            () => {

                imagem.src = "assets/logo.png";

            }
        );

        const botao =
            card.querySelector(".botao-oferta");

        if (!produto.link) {

            botao.disabled = true;
            botao.textContent =
                "Link indisponível";

        } else {

            botao.addEventListener(
                "click",
                () => {

                    chrome.tabs.create({
                        url: produto.link
                    });

                }
            );

        }

        areaResultados.appendChild(card);
    });
}

function formatarPreco(preco) {

    const valor =
        Number(preco);

    if (!Number.isFinite(valor)) {
        return "Preço indisponível";
    }

    return valor.toLocaleString(
        "pt-BR",
        {
            style: "currency",
            currency: "BRL"
        }
    );
}