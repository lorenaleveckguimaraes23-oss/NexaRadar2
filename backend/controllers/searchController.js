const { buscarMercadoLivre } = require("../connectors/mercadolivre");
const { buscarAmazon } = require("../connectors/amazon");
const { buscarKabum } = require("../connectors/kabum");
const { buscarCobasi } = require("../connectors/cobasi");
const { processarResultados, normalizarTexto } = require("../utils/searchEngine");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TERMOS_TECH = [
  "mouse", "teclado", "notebook", "laptop", "computador", "pc", "monitor",
  "ssd", "hd", "memoria ram", "processador", "placa de video", "gpu", "headset",
  "fone", "webcam", "roteador", "smartphone", "iphone", "celular", "tablet",
  "impressora", "controle gamer", "cadeira gamer", "gabinete", "fonte", "cooler"
];

const TERMOS_PET = [
  "racao", "petisco", "cachorro", "gato", "cao", "felino", "canino", "coleira",
  "areia sanitaria", "tapete higienico", "brinquedo pet", "casinha", "comedouro",
  "bebedouro", "antipulgas", "shampoo pet", "aquario", "passaro", "hamster"
];

function incluiAlgum(termo, lista) {
  const busca = normalizarTexto(termo);
  return lista.some((item) => busca.includes(normalizarTexto(item)));
}

function escolherLojas(termo) {
  const tech = incluiAlgum(termo, TERMOS_TECH);
  const pet = incluiAlgum(termo, TERMOS_PET);

  if (tech && !pet) {
    return [
      ["Mercado Livre", buscarMercadoLivre],
      ["Amazon", buscarAmazon],
      ["KaBuM!", buscarKabum]
    ];
  }

  if (pet && !tech) {
    return [
      ["Mercado Livre", buscarMercadoLivre],
      ["Amazon", buscarAmazon],
      ["Cobasi", buscarCobasi]
    ];
  }

  return [
    ["Mercado Livre", buscarMercadoLivre],
    ["Amazon", buscarAmazon],
    ["KaBuM!", buscarKabum],
    ["Cobasi", buscarCobasi]
  ];
}

async function pesquisarProdutos(req, res) {
  const termo = String(req.query.q || "").trim();

  if (!termo) {
    return res.status(400).json({
      sucesso: false,
      erro: "Informe um produto."
    });
  }

  const inicio = Date.now();
  const diagnostico = {};
  const todos = [];
  const lojasSelecionadas = escolherLojas(termo);

  const executar = async (nome, fn) => {
    const inicioLoja = Date.now();

    try {
      const itens = await fn(termo);
      diagnostico[nome] = {
        sucesso: true,
        encontrados: itens.length,
        ms: Date.now() - inicioLoja
      };
      todos.push(...itens);
    } catch (error) {
      diagnostico[nome] = {
        sucesso: false,
        encontrados: 0,
        ms: Date.now() - inicioLoja,
        erro: error.message
      };
    }
  };

  try {
    console.log(`\n[Busca] ${termo}`);
    console.log("[Lojas selecionadas]", lojasSelecionadas.map(([nome]) => nome));

    for (let indice = 0; indice < lojasSelecionadas.length; indice += 1) {
      const [nome, fn] = lojasSelecionadas[indice];
      await executar(nome, fn);

      if (indice < lojasSelecionadas.length - 1) {
        await sleep(500);
      }
    }

    const produtos = processarResultados(todos, termo, 16);

    console.log("[Diagnóstico]", diagnostico);
    console.log(`[Busca] ${produtos.length} produto(s) válidos em ${Date.now() - inicio}ms`);

    return res.json({
      sucesso: true,
      termo,
      total: produtos.length,
      diagnostico,
      produtos
    });
  } catch (error) {
    console.error("[Pesquisa] Erro crítico:", error);

    return res.status(500).json({
      sucesso: false,
      erro: "Erro ao consultar lojas."
    });
  }
}

module.exports = { pesquisarProdutos };
