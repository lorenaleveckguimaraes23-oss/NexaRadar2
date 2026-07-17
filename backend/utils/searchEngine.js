// =====================================
// NEXA RADAR - MOTOR DE RESULTADOS
// Organização por loja + somente links afiliados
// =====================================

const STOP_WORDS = new Set([
    "a", "o", "as", "os", "de", "da", "do", "das", "dos",
    "com", "para", "por", "em", "um", "uma"
]);

const STORE_LIMIT = 8;

/**
 * Só permite links que carregam uma identificação de afiliado conhecida.
 * Atualize os identificadores abaixo caso seus códigos mudem.
 */
function possuiAfiliado(produto = {}) {
    const loja = normalizarTexto(produto.loja);
    const link = String(produto.link || "");

    if (!link) return false;

    try {
        const url = new URL(link);

        if (loja.includes("amazon")) {
            return (
                url.hostname.includes("amazon.com.br") &&
                url.searchParams.get("tag") === "nexastore028-20"
            );
        }

        if (loja.includes("mercado livre")) {
            return (
                url.hostname.includes("mercadolivre.com.br") &&
                url.searchParams.get("af") === "true" &&
                url.searchParams.get("e") === "lc20260707150211"
            );
        }

        if (loja.includes("kabum")) {
            return (
                url.hostname.includes("awin1.com") &&
                url.searchParams.get("awinmid") === "17729" &&
                url.searchParams.get("awinaffid") === "2980279" &&
                Boolean(url.searchParams.get("ued"))
            );
        }

        if (loja.includes("cobasi")) {
            return (
                url.hostname.includes("cobasi.com.br") &&
                url.hash.toLowerCase().includes("nexastoreonline")
            );
        }

        return false;
    } catch {
        return false;
    }
}

function normalizarTexto(valor = "") {
    return String(valor)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function palavrasDaBusca(termo = "") {
    return normalizarTexto(termo)
        .split(" ")
        .filter((palavra) => palavra.length > 1 && !STOP_WORDS.has(palavra));
}

function produtoCorrespondeBusca(produto, termo) {
    const nome = normalizarTexto(produto?.nome);
    const palavras = palavrasDaBusca(termo);

    if (!nome || palavras.length === 0) return false;

    return palavras.every((palavra) => nome.includes(palavra));
}

function calcularRelevancia(produto, termo) {
    const nome = normalizarTexto(produto?.nome);
    const busca = normalizarTexto(termo);
    const palavras = palavrasDaBusca(termo);

    if (!nome || palavras.length === 0) return 0;

    let pontos = 0;

    if (nome.includes(busca)) pontos += 150;
    if (nome.startsWith(busca)) pontos += 30;

    for (const palavra of palavras) {
        if (nome.includes(palavra)) {
            pontos += palavra.length >= 5 ? 35 : 22;
        }
    }

    const correspondencias = palavras.filter((palavra) =>
        nome.includes(palavra)
    ).length;

    pontos += Math.round((correspondencias / palavras.length) * 50);

    return pontos;
}

function chaveDuplicidade(produto) {
    const nome = normalizarTexto(produto?.nome)
        .replace(/\b(\d+)\s*(gb|tb|kg|g|ml|l|hz|pol)\b/g, "$1$2")
        .split(" ")
        .slice(0, 14)
        .join(" ");

    return `${normalizarTexto(produto?.loja)}|${nome}`;
}

function removerDuplicados(produtos) {
    const mapa = new Map();

    for (const produto of produtos) {
        const chave = chaveDuplicidade(produto);
        const existente = mapa.get(chave);

        if (!existente || produto.preco < existente.preco) {
            mapa.set(chave, produto);
        }
    }

    return [...mapa.values()];
}

function processarResultados(produtos, termo, limite = 32) {
    const normalizados = produtos
        .filter(Boolean)
        .map((produto) => ({
            loja: String(produto.loja || "").trim(),
            nome: String(produto.nome || "").trim(),
            preco: Number(produto.preco),
            link: String(produto.link || "").trim(),
            imagem: String(produto.imagem || "").trim(),
            relevancia: calcularRelevancia(produto, termo)
        }))
        .filter((produto) =>
            produto.loja &&
            produto.nome &&
            Number.isFinite(produto.preco) &&
            produto.preco > 0 &&
            produto.link &&
            possuiAfiliado(produto) &&
            produtoCorrespondeBusca(produto, termo)
        );

    const ordenados = removerDuplicados(normalizados).sort((a, b) => {
        if (b.relevancia !== a.relevancia) {
            return b.relevancia - a.relevancia;
        }

        return a.preco - b.preco;
    });

    // Garante diversidade sem inserir lojas irrelevantes.
    const grupos = new Map();

    for (const produto of ordenados) {
        const loja = produto.loja;

        if (!grupos.has(loja)) {
            grupos.set(loja, []);
        }

        if (grupos.get(loja).length < STORE_LIMIT) {
            grupos.get(loja).push(produto);
        }
    }

    // Intercala as lojas para que uma única loja não ocupe toda a resposta.
    const selecionados = [];
    let indice = 0;
    let adicionou = true;

    while (selecionados.length < limite && adicionou) {
        adicionou = false;

        for (const lista of grupos.values()) {
            if (lista[indice] && selecionados.length < limite) {
                selecionados.push(lista[indice]);
                adicionou = true;
            }
        }

        indice += 1;
    }

    return selecionados.map(({ relevancia, ...produto }) => produto);
}

module.exports = {
    normalizarTexto,
    palavrasDaBusca,
    produtoCorrespondeBusca,
    calcularRelevancia,
    possuiAfiliado,
    removerDuplicados,
    processarResultados
};
