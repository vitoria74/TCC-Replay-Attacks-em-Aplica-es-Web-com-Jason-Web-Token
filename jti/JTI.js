const express = require('express');
const jwt = require('jsonwebtoken');
const redis = require('redis');
const { randomUUID } = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

const SECRET = process.env.JWT_SECRET || 'chave_mestra_reserva';

// -------------------------------------------------------------------
// CENÁRIO JTI COM BLACKLISTING
//
// O JTI (JWT ID) é um identificador único embutido em cada token.
// A blacklist no Redis armazena os JTIs de tokens REVOGADOS, por
// exemplo, após um logout explícito ou encerramento de sessão forçado.
//
// O overhead de desempenho vem da consulta ao Redis em TODA requisição
// autenticada, mesmo as legítimas precisam verificar se o JTI está
// na blacklist.
// -------------------------------------------------------------------

const redisClient = redis.createClient();
redisClient.connect()
    .then(() => console.log('Redis conectado (JTI)'))
    .catch((err) => console.error('Erro ao conectar ao Redis:', err));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (username === 'vitoria' && password === '123456') {
        const jti = randomUUID();
        // Token com validade de 1h — mesmo valor do baseline para
        // garantir comparabilidade nas métricas de latência.
        const token = jwt.sign({ username, role: 'admin', jti }, SECRET, { expiresIn: '1h' });
        return res.json({ auth: true, token });
    }

    res.status(401).json({ message: 'Credenciais inválidas.' });
});

// Endpoint de logout: revoga o token adicionando seu JTI à blacklist.
// Após o logout, qualquer replay desse token é bloqueado imediatamente.
app.post('/logout', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(403).json({ message: 'Token não fornecido.' });

    try {
        const decoded = jwt.verify(token, SECRET);
        const jti = decoded.jti;
        // TTL igual ao tempo restante de vida do token para que a entrada
        // no Redis expire automaticamente junto com o token.
        const agora = Math.floor(Date.now() / 1000);
        const ttlRestante = decoded.exp - agora;

        if (ttlRestante > 0) {
            await redisClient.set(`blacklist:${jti}`, 'revogado', { EX: ttlRestante });
        }

        return res.json({ message: 'Logout realizado. Token revogado com sucesso.' });
    } catch (err) {
        res.status(401).json({ message: 'Token inválido.' });
    }
});

app.post('/transferir', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(403).json({ message: 'Token não fornecido.' });

    try {
        const decoded = jwt.verify(token, SECRET);
        const jti = decoded.jti;

        // Consulta ao Redis: verifica se o JTI deste token foi revogado.
        // Esta consulta ocorre em TODA requisição autenticada — é aqui
        // que o overhead de desempenho do JTI é gerado e medido.
        const revogado = await redisClient.get(`blacklist:${jti}`);

        if (revogado) {
            return res.status(401).json({
                message: 'Replay Attack bloqueado! Token revogado (JTI na blacklist).'
            });
        }

        res.json({ message: `Sucesso! R$ 100,00 transferidos por ${decoded.username}.` });
    } catch (err) {
        res.status(401).json({ message: 'Token inválido ou expirado.' });
    }
});

app.listen(3001, () => {
    console.log('Servidor JTI (blacklisting) rodando na porta 3001');
});
