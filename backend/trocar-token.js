require("dotenv").config();

async function trocarCodigoPorToken() {
    const authorizationCode = process.env.ML_AUTHORIZATION_CODE;

    if (!authorizationCode) {
        throw new Error(
            "ML_AUTHORIZATION_CODE não foi informado no arquivo .env."
        );
    }

    const response = await fetch(
        "https://api.mercadolibre.com/oauth/token",
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/x-www-form-urlencoded",
                Accept: "application/json"
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                client_id: process.env.ML_CLIENT_ID,
                client_secret: process.env.ML_CLIENT_SECRET,
                code: authorizationCode,
                redirect_uri: process.env.ML_REDIRECT_URI
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        console.error("Erro retornado pelo Mercado Livre:", data);
        process.exitCode = 1;
        return;
    }

    console.log("Autorização concluída.");
    console.log("User ID:", data.user_id);
    console.log("Expira em:", data.expires_in, "segundos");

    /*
     * Não exiba nem compartilhe os tokens.
     * Copie-os diretamente para um armazenamento protegido.
     */
    console.log("\nSalve com segurança:");
    console.log("ML_ACCESS_TOKEN=", data.access_token);
    console.log("ML_REFRESH_TOKEN=", data.refresh_token);
}

trocarCodigoPorToken().catch((error) => {
    console.error("Falha ao obter token:", error);
    process.exitCode = 1;
});