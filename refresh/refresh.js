const express = require('express');
const jwt = require('jsonwebtoken');
const redis = require('redis');
const { randomBytes } = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

const SECRET = process.env.JWT_SECRET || 'chave_mestra_reserva';

// -------------------------------------------------------------------
// CENÁRIO REFRESH TOKEN + ACCESS TOKEN
//
// O access token tem vida curta (1 minuto). O refresh token tem vida
// longa (7 dias) e fica armazenado no Redis — isso permite revogá-lo
// a qualquer momento (ex: logout, suspeita de comprometimento).
//
// Como isso mitiga Replay Attacks:
//   - Um access token interceptado fica inútil após 1 minuto.
//   - A janela de exposição é drasticamente menor que 1 hora (baseline).
//   - O refresh token, por ser opaco (não é JWT), não pode ser forjado.
//   - Se o refresh token for comprometido, pode ser revogado no Redis.
//
// Limitação (declarada no TCC1):
//   - Dentro da janela de 1 minuto, um replay ainda é possível.
//   - Esta estratégia REDUZ o impacto temporal, mas não elimina o risco.
//   - Não garante uso único por operação (isso é função do Nonce).
//
// Overhead de desempenho:
//   - Requisições normais (/transferir): apenas jwt.verify — sem Redis.
//     O overhead é próximo ao baseline.
//   - Renovação (/refresh): consulta ao Redis — overhead concentrado
//     neste endpoint, não nas operações do dia a dia.
// -------------------------------------------------------------------

const redisClient = redis.createClient();
redisClient.connect()
    .then(() => console.log('Redis conectado (Refresh Token)'))
    .catch((err) => console.error('Erro ao conectar ao Redis:', err));

const ACCESS_TOKEN_EXPIRACAO = '1m';         // 60 segundos
const REFRESH_TOKEN_TTL_SEGUNDOS = 7 * 24 * 60 * 60; // 7 dias

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (username === 'vitoria' && password === '123456') {
        const accessToken = jwt.sign(
            { username, role: 'admin' },
            SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRACAO }
        );

        // Refresh token opaco (não-JWT) — armazenado no Redis com TTL.
        const refreshToken = randomBytes(40).toString('hex');
        await redisClient.set(`refresh:${refreshToken}`, username, { EX: REFRESH_TOKEN_TTL_SEGUNDOS });

        return res.json({ accessToken, refreshToken });
    }

    res.status(401).json({ message: 'Credenciais inválidas.' });
});

// Renova o access token usando o refresh token.
// Esta é a única operação que consulta o Redis — o overhead fica
// concentrado aqui, não em cada requisição autenticada.
app.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({ message: 'Refresh token não fornecido.' });
    }

    const username = await redisClient.get(`refresh:${refreshToken}`);

    if (!username) {
        return res.status(403).json({ message: 'Refresh token inválido ou expirado.' });
    }

    const newAccessToken = jwt.sign(
        { username, role: 'admin' },
        SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRACAO }
    );

    res.json({ accessToken: newAccessToken });
});

// Logout: revoga o refresh token removendo-o do Redis.
// Após o logout, nenhum novo access token pode ser gerado com este refresh.
app.post('/logout', async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({ message: 'Refresh token não fornecido.' });
    }

    await redisClient.del(`refresh:${refreshToken}`);
    res.json({ message: 'Logout realizado. Refresh token revogado.' });
});

app.post('/transferir', (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(403).json({ message: 'Token não fornecido.' });

    try {
        // Apenas verificação criptográfica do JWT — sem Redis aqui.
        // Isso mantém o overhead das operações normais próximo ao baseline.
        const decoded = jwt.verify(token, SECRET);
        res.json({ message: `Sucesso! R$ 100,00 transferidos por ${decoded.username}.` });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Access token expirado. Use o refresh token.' });
        }
        res.status(401).json({ message: 'Token inválido.' });
    }
});

app.listen(3004, () => {
    console.log('Servidor REFRESH TOKEN rodando na porta 3004');
});
