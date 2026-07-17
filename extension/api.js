// =====================================
// NEXA RADAR
// CONEXÃO COM O BACKEND
// =====================================

const API_NEXA_RADAR =
    "http://localhost:3000";

async function buscarProdutos(termo) {

    const termoLimpo =
        String(termo || "").trim();

    if (!termoLimpo) {
        throw new Error(
            "Informe um produto para pesquisar."
        );
    }

    const url =
        `${API_NEXA_RADAR}/search?q=` +
        encodeURIComponent(termoLimpo);

    console.log(
        "[Nexa Radar] Consultando:",
        url
    );

    const resposta = await fetch(url);

    if (!resposta.ok) {

        throw new Error(
            `Erro do servidor: ${resposta.status}`
        );

    }

    const dados = await resposta.json();

    if (!dados.sucesso) {

        throw new Error(
            dados.erro ||
            "Não foi possível realizar a pesquisa."
        );

    }

    return dados.produtos || [];
}