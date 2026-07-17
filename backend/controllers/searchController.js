const {buscarMercadoLivre}=require("../connectors/mercadolivre");
const {buscarCobasi}=require("../connectors/cobasi");
const {buscarAmazon}=require("../connectors/amazon");
const {buscarKabum}=require("../connectors/kabum");
const {processarResultados,normalizarTexto}=require("../utils/searchEngine");
const TECH=["mouse","teclado","notebook","laptop","computador","pc","monitor","ssd","hd","memoria","processador","placa de video","gpu","headset","fone","webcam","roteador","smartphone","iphone","celular","tablet","impressora","controle","cadeira gamer","gabinete","fonte","cooler"];
const PET=["racao","petisco","cachorro","gato","cao","felino","canino","coleira","areia","tapete higienico","brinquedo pet","casinha","comedouro","bebedouro","antipulgas","shampoo pet","aquario","passaro","hamster"];
const inclui=(t,l)=>{const b=normalizarTexto(t);return l.some(i=>b.includes(normalizarTexto(i)));};
function lojas(t){const tech=inclui(t,TECH),pet=inclui(t,PET);if(tech&&!pet)return [["Mercado Livre",buscarMercadoLivre],["Amazon",buscarAmazon],["KaBuM!",buscarKabum]];if(pet&&!tech)return [["Mercado Livre",buscarMercadoLivre],["Cobasi",buscarCobasi],["Amazon",buscarAmazon]];return [["Mercado Livre",buscarMercadoLivre],["Amazon",buscarAmazon],["KaBuM!",buscarKabum],["Cobasi",buscarCobasi]];}
async function pesquisarProdutos(req,res){const termo=String(req.query.q||"").trim();if(!termo)return res.status(400).json({sucesso:false,erro:"Informe um produto."});const inicio=Date.now(),diagnostico={},todos=[];await Promise.all(lojas(termo).map(async([nome,buscar])=>{const t=Date.now();try{const itens=await buscar(termo);diagnostico[nome]={sucesso:true,encontrados:Array.isArray(itens)?itens.length:0,ms:Date.now()-t};if(Array.isArray(itens))todos.push(...itens);}catch(e){diagnostico[nome]={sucesso:false,encontrados:0,ms:Date.now()-t,erro:e.message};}}));const produtos=processarResultados(todos,termo,24);res.json({sucesso:true,termo,total:produtos.length,ms:Date.now()-inicio,diagnostico,produtos});}
module.exports={pesquisarProdutos};
