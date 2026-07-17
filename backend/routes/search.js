const express=require("express");
const {pesquisarProdutos}=require("../controllers/searchController");
const router=express.Router();
router.get("/",pesquisarProdutos);
module.exports=router;
