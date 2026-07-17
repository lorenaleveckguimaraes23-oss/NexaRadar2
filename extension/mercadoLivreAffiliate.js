async function gerarLinkAfiliado(produtoUrl) {
  const response = await fetch(
    "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        tag: "lc20260707150211",
        urls: [produtoUrl]
      })
    }
  );

  const data = await response.json();

  if (!response.ok || data.total_success !== 1) {
    return produtoUrl;
  }

  return data.urls[0].short_url;
}

window.gerarLinkAfiliado = gerarLinkAfiliado;