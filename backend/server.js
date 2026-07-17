require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const searchRoute = require("./routes/search");

const app = express();

const PORT = Number(process.env.PORT) || 3000;

const ML_CLIENT_ID = process.env.ML_CLIENT_ID; 
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET; 
const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI;

if (!ML_CLIENT_ID || !ML_CLIENT_SECRET || !ML_REDIRECT_URI) {
    console.warn(
        "[Mercado Livre] Variáveis ausentes: confira ML_CLIENT_ID, ML_CLIENT_SECRET e ML_REDIRECT_URI."
    );
}

const oauthStates = new Map();

/*
 * Armazenamento temporário.
 *
 * Isso funciona para teste local, mas os tokens serão perdidos
 * quando o servidor reiniciar.
 *
 * Em produção, salve em banco de dados ou armazenamento seguro.
 */
let mercadoLivreTokens = {
    accessToken: null,
    refreshToken: null,
    userId: null,
    expiresAt: null
};

app.disable("x-powered-by");

app.use(
    cors({
        origin: "*"
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================================
// STATUS DA API
// =====================================

app.get("/", (req, res) => {
    res.json({
        projeto: "Nexa Radar",
        status: "Online",
        versao: "2.0.0",
        lojas: [
            "Amazon",
            "Mercado Livre",
            "KaBuM!",
            "Cobasi"
        ],
        mercadoLivre: {
            configurado: Boolean(
                ML_CLIENT_ID &&
                ML_CLIENT_SECRET &&
                ML_REDIRECT_URI
            ),
            conectado: Boolean(
                mercadoLivreTokens.accessToken
            )
        }
    });
});

// =====================================
// INICIAR AUTORIZAÇÃO DO MERCADO LIVRE
// =====================================

app.get("/auth/mercadolivre", (req, res) => {
    if (
        !ML_CLIENT_ID ||
        !ML_CLIENT_SECRET ||
        !ML_REDIRECT_URI
    ) {
        return res.status(500).json({
            sucesso: false,
            erro:
                "As variáveis ML_CLIENT_ID, ML_CLIENT_SECRET e ML_REDIRECT_URI não estão configuradas."
        });
    }

    const state = crypto
        .randomBytes(32)
        .toString("hex");

    oauthStates.set(state, Date.now());

    /*
     * Remove o state depois de 10 minutos.
     */
    setTimeout(() => {
        oauthStates.delete(state);
    }, 10 * 60 * 1000);

    const authorizationUrl = new URL(
        "https://auth.mercadolivre.com.br/authorization"
    );

    authorizationUrl.searchParams.set(
        "response_type",
        "code"
    );

    authorizationUrl.searchParams.set(
        "client_id",
        ML_CLIENT_ID
    );

    authorizationUrl.searchParams.set(
        "redirect_uri",
        ML_REDIRECT_URI
    );

    authorizationUrl.searchParams.set(
        "state",
        state
    );

    return res.redirect(
        authorizationUrl.toString()
    );
});

// =====================================
// CALLBACK DO MERCADO LIVRE
// =====================================

app.get(
    "/auth/mercadolivre/callback",
    async (req, res) => {
        const {
            code,
            state,
            error,
            error_description: errorDescription
        } = req.query;

        if (error) {
            return res.status(400).send(
                createResultPage(
                    "Autorização não concluída",
                    errorDescription ||
                        String(error),
                    false
                )
            );
        }

        if (!code) {
            return res.status(400).send(
                createResultPage(
                    "Código ausente",
                    "O Mercado Livre não enviou o código de autorização.",
                    false
                )
            );
        }

        /*
         * Quando a autorização for iniciada por
         * /auth/mercadolivre, validamos o state.
         *
         * Se você abriu manualmente uma URL sem state,
         * essa validação é ignorada temporariamente.
         */
        if (state) {
            const stateCreatedAt =
                oauthStates.get(String(state));

            if (!stateCreatedAt) {
                return res.status(400).send(
                    createResultPage(
                        "Autorização inválida",
                        "O código de segurança expirou ou não foi reconhecido.",
                        false
                    )
                );
            }

            oauthStates.delete(String(state));

            const stateAge =
                Date.now() - stateCreatedAt;

            if (stateAge > 10 * 60 * 1000) {
                return res.status(400).send(
                    createResultPage(
                        "Autorização expirada",
                        "Inicie novamente a conexão com o Mercado Livre.",
                        false
                    )
                );
            }
        }

        try {
            const tokenData =
                await exchangeAuthorizationCode(
                    String(code)
                );

            saveTokenData(tokenData);

            console.log(
                "[Mercado Livre] Conta conectada."
            );

            console.log(
                "[Mercado Livre] User ID:",
                mercadoLivreTokens.userId
            );

            return res.status(200).send(
                createResultPage(
                    "Mercado Livre conectado!",
                    "A autorização foi concluída. Você já pode fechar esta página.",
                    true
                )
            );
        } catch (error) {
            console.error(
                "[Mercado Livre] Erro no callback:",
                error
            );

            return res.status(500).send(
                createResultPage(
                    "Não foi possível conectar",
                    error.message ||
                        "Erro durante a autorização.",
                    false
                )
            );
        }
    }
);

// =====================================
// STATUS DA CONEXÃO
// =====================================

app.get(
    "/auth/mercadolivre/status",
    async (req, res) => {
        try {
            const accessToken =
                await getValidAccessToken();

            return res.json({
                sucesso: true,
                conectado: Boolean(accessToken),
                userId:
                    mercadoLivreTokens.userId,
                expiraEm:
                    mercadoLivreTokens.expiresAt
            });
        } catch (error) {
            return res.json({
                sucesso: true,
                conectado: false,
                erro: error.message
            });
        }
    }
);

// =====================================
// ATALHOS DE STATUS
// =====================================

async function responderStatusMercadoLivre(req, res) {
    try {
        const accessToken = await getValidAccessToken();

        return res.json({
            sucesso: true,
            conectado: Boolean(accessToken),
            userId: mercadoLivreTokens.userId,
            expiraEm: mercadoLivreTokens.expiresAt
        });
    } catch (error) {
        return res.json({
            sucesso: true,
            conectado: false,
            erro: error.message
        });
    }
}

app.get("/ml/status", responderStatusMercadoLivre);
app.get("/api/ml/status", responderStatusMercadoLivre);
app.get("/api/auth/mercadolivre/status", responderStatusMercadoLivre);

// =====================================
// DESCONECTAR MERCADO LIVRE
// =====================================

app.post(
    "/auth/mercadolivre/logout",
    (req, res) => {
        mercadoLivreTokens = {
            accessToken: null,
            refreshToken: null,
            userId: null,
            expiresAt: null
        };

        res.json({
            sucesso: true,
            mensagem:
                "Conexão do Mercado Livre removida."
        });
    }
);

// =====================================
// ROTAS DO NEXA RADAR
// =====================================

app.use("/search", searchRoute);

// =====================================
// ERROS
// =====================================

app.use((req, res) => {
    res.status(404).json({
        sucesso: false,
        erro: "Rota não encontrada."
    });
});

app.use((error, req, res, next) => {
    console.error("[Servidor]", error);

    res.status(500).json({
        sucesso: false,
        erro: "Erro interno do servidor."
    });
});

// =====================================
// FUNÇÕES DO OAUTH
// =====================================

async function exchangeAuthorizationCode(code) {
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
                grant_type:
                    "authorization_code",

                client_id:
                    ML_CLIENT_ID,

                client_secret:
                    ML_CLIENT_SECRET,

                code,

                redirect_uri:
                    ML_REDIRECT_URI
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        console.error(
            "[Mercado Livre] Resposta de token:",
            data
        );

        throw new Error(
            data.message ||
            data.error_description ||
            data.error ||
            "O Mercado Livre recusou a troca do código pelo token."
        );
    }

    return data;
}

async function refreshMercadoLivreToken() {
    if (!mercadoLivreTokens.refreshToken) {
        throw new Error(
            "Não existe refresh token salvo. Faça uma nova autorização."
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
                grant_type:
                    "refresh_token",

                client_id:
                    ML_CLIENT_ID,

                client_secret:
                    ML_CLIENT_SECRET,

                refresh_token:
                    mercadoLivreTokens.refreshToken
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        console.error(
            "[Mercado Livre] Falha ao renovar:",
            data
        );

        throw new Error(
            data.message ||
            data.error_description ||
            data.error ||
            "Não foi possível renovar o token."
        );
    }

    saveTokenData(data);

    return mercadoLivreTokens.accessToken;
}

function saveTokenData(data) {
    const expiresInSeconds =
        Number(data.expires_in) || 0;

    mercadoLivreTokens = {
        accessToken:
            data.access_token,

        refreshToken:
            data.refresh_token ||
            mercadoLivreTokens.refreshToken,

        userId:
            data.user_id ||
            mercadoLivreTokens.userId,

        /*
         * Renovamos 60 segundos antes da expiração.
         */
        expiresAt:
            Date.now() +
            Math.max(
                expiresInSeconds - 60,
                0
            ) *
                1000
    };
}

async function getValidAccessToken() {
    if (!mercadoLivreTokens.accessToken) {
        throw new Error(
            "Mercado Livre ainda não autorizado."
        );
    }

    if (
        mercadoLivreTokens.expiresAt &&
        Date.now() <
            mercadoLivreTokens.expiresAt
    ) {
        return mercadoLivreTokens.accessToken;
    }

    return refreshMercadoLivreToken();
}

function createResultPage(
    title,
    message,
    success
) {
    const safeTitle =
        escapeHtml(title);

    const safeMessage =
        escapeHtml(message);

    const statusColor = success
        ? "#22c55e"
        : "#ef4444";

    return `
        <!DOCTYPE html>
        <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">

                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                >

                <title>${safeTitle}</title>
            </head>

            <body
                style="
                    margin: 0;
                    min-height: 100vh;
                    display: grid;
                    place-items: center;
                    padding: 24px;
                    box-sizing: border-box;
                    color: #f8fafc;
                    background: #070b16;
                    font-family:
                        Arial,
                        sans-serif;
                "
            >
                <main
                    style="
                        width: min(480px, 100%);
                        padding: 32px;
                        border:
                            1px solid
                            rgba(148, 163, 184, 0.2);
                        border-radius: 20px;
                        background: #111827;
                        text-align: center;
                    "
                >
                    <div
                        style="
                            width: 54px;
                            height: 54px;
                            margin:
                                0 auto 18px;
                            display: grid;
                            place-items: center;
                            border-radius: 50%;
                            color: white;
                            background:
                                ${statusColor};
                            font-size: 25px;
                            font-weight: bold;
                        "
                    >
                        ${success ? "✓" : "!"}
                    </div>

                    <h1
                        style="
                            margin:
                                0 0 12px;
                            font-size: 25px;
                        "
                    >
                        ${safeTitle}
                    </h1>

                    <p
                        style="
                            margin: 0;
                            color: #94a3b8;
                            line-height: 1.6;
                        "
                    >
                        ${safeMessage}
                    </p>
                </main>
            </body>
        </html>
    `;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// =====================================
// INICIAR SERVIDOR
// =====================================

const server = app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            "================================="
        );

        console.log(
            "Nexa Radar API iniciada!"
        );

        console.log(
            `http://127.0.0.1:${PORT}`
        );

        console.log(
            "Mercado Livre configurado:",
            Boolean(
                ML_CLIENT_ID &&
                ML_CLIENT_SECRET &&
                ML_REDIRECT_URI
            )
        );

        console.log(
            "================================="
        );
    }
);

server.timeout = 120000;