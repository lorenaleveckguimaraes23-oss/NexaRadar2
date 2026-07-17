// =====================================
// NEXA RADAR 2.1 - MOTOR DE RESULTADOS
// Relevância flexível + resultados válidos
// =====================================

const STOP_WORDS = new Set([
    "a", "o", "as", "os", "de", "da", "do", "das", "dos",
    "com", "para", "por", "em", "um", "uma", "e"
]);

const STORE_LIMIT = 10;

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
        .filter((palavra) =>
            palavra.length > 1 &&
            !STOP_WORDS.has(palavra)
        );
}

function calcularRelevancia(produto, termo) {
    const nome = normalizarTexto(produto?.nome);
    const busca = normalizarTexto(termo);
    const palavras = palavrasDaBusca(termo);

    if (!nome || palavras.length === 0) {
        return 0;
    }

    let pontos = 0;

    if (nome === busca) pontos += 250;
    if (nome.startsWith(busca)) pontos += 120;
    if (nome.includes(busca)) pontos += 100;

    let correspondencias = 0;

    for (const palavra of palavras) {
        if (nome.includes(palavra)) {
            correspondencias += 1;
            pontos += palavra.length >= 5 ? 35 : 20;
        }
    }

    const proporcao = correspondencias / palavras.length;
    pontos += Math.round(proporcao * 80);

    // Evita zerar resultados por pequenas diferenças no título.
    if (correspondencias === 0) {
        return 0;
    }

    return pontos;
}

function produtoCorrespondeBusca(produto, termo) {
    return calcularRelevancia(produto, termo) > 0;
}

function chaveDuplicidade(produto) {
    const nome = normalizarTexto(produto?.nome)
        .replace(/\b(\d+)\s*(gb|tb|kg|g|ml|l|hz|pol)\b/g, "$1$2")
        .split(" ")
        .slice(0, 16)
        .join(" ");

    return `${normalizarTexto(produto?.loja)}|${nome}`;
}

function removerDuplicados(produtos) {
    const mapa = new Map();

    for (const produto of produtos) {
        const chave = chaveDuplicidade(produto);
        const existente = mapa.get(chave);

        if (
            !existente ||
            produto.relevancia > existente.relevancia ||
            (
                produto.relevancia === existente.relevancia &&
                produto.preco < existente.preco
            )
        ) {
            mapa.set(chave, produto);
        }
    }

    return [...mapa.values()];
}

function linkValido(produto = {}) {
    const link = String(produto.link || "").trim();

    if (!link) return false;

    try {
        const url = new URL(link);
        return ["http:", "https:"].includes(url.protocol);
    } catch {
        return false;
    }
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
            linkValido(produto) &&
            produto.relevancia > 0
        );

    const ordenados = removerDuplicados(normalizados).sort((a, b) => {
        if (b.relevancia !== a.relevancia) {
            return b.relevancia - a.relevancia;
        }

        return a.preco - b.preco;
    });

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
    removerDuplicados,
    processarResultados
};
