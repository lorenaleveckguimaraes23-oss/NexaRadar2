const { buscarMercadoLivre } = require("../connectors/mercadolivre");
const { buscarAmazon } = require("../connectors/amazon");
const { buscarKabum } = require("../connectors/kabum");
const { buscarCobasi } = require("../connectors/cobasi");
const { processarResultados } = require("../utils/searchEngine");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pesquisarProdutos(req, res) {
  const termo = String(req.query.q || "").trim();
  if (!termo) return res.status(400).json({ sucesso: false, erro: "Informe um produto." });

  const inicio = Date.now();
  const diagnostico = {};
  const todos = [];

  const executar = async (nome, fn) => {
    const t = Date.now();
    try {
      const itens = await fn(termo);
      diagnostico[nome] = { sucesso: true, encontrados: itens.length, ms: Date.now() - t };
      todos.push(...itens);
    } catch (error) {
      diagnostico[nome] = { sucesso: false, encontrados: 0, ms: Date.now() - t, erro: error.message };
    }
  };

  try {
    console.log(`\n[Busca] ${termo}`);
    await executar("Mercado Livre", buscarMercadoLivre);
    await sleep(700);
    await executar("Amazon", buscarAmazon);
    await sleep(700);
    await executar("KaBuM!", buscarKabum);
    await sleep(700);
    await executar("Cobasi", buscarCobasi);

    const produtos = processarResultados(todos, termo, 16);
    console.log("[Diagnóstico]", diagnostico);
    console.log(`[Busca] ${produtos.length} produto(s) válidos em ${Date.now() - inicio}ms`);

    return res.json({ sucesso: true, termo, total: produtos.length, diagnostico, produtos });
  } catch (error) {
    console.error("[Pesquisa] Erro crítico:", error);
    return res.status(500).json({ sucesso: false, erro: "Erro ao consultar lojas." });
  }
}
module.exports = { pesquisarProdutos };
