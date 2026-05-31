const express = require('express');
const jwt = require('jsonwebtoken');
const redis = require('redis');
const { randomBytes } = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

const SECRET = process.env.JWT_SECRET || 'chave_mestra_reserva';

// -------------------------------------------------------------------
// CENÁRIO NONCE
//
// O Nonce (Number Used Once) é um valor aleatório de uso único gerado
// pelo servidor antes de cada operação crítica. O cliente inclui esse
// nonce na requisição; o servidor verifica sua existência no Redis e
// o deleta imediatamente após o uso.
//
// Diferença fundamental em relação ao JTI:
//   - O JTI identifica e revoga TOKENS (sessões); a proteção é ativada
//     pelo logout ou revogação explícita.
//   - O Nonce garante IDEMPOTÊNCIA por OPERAÇÃO: cada requisição ao
//     endpoint crítico precisa de um nonce diferente, tornando impossível
//     repetir a exata mesma requisição (replay). Mesmo com um token JWT
//     válido, sem um nonce fresco o servidor rejeita a operação.
//
// Fluxo correto:
//   1. Cliente solicita GET /gerar-nonce → recebe nonce válido por 5min.
//   2. Cliente inclui o nonce no body de POST /transferir.
//   3. Servidor verifica o nonce no Redis, deleta e processa a operação.
//   4. Qualquer replay da mesma requisição falha: nonce já foi consumido.
//
// Overhead de desempenho: toda operação crítica requer duas operações
// Redis (GET para verificar + DEL para consumir o nonce), além do GET
// inicial para buscar o nonce. Compare com o JTI que usa apenas GET.
// -------------------------------------------------------------------

const redisClient = redis.createClient();
redisClient.connect()
    .then(() => console.log('Redis conectado (Nonce)'))
    .catch((err) => console.error('Erro ao conectar ao Redis:', err));

// TTL do nonce: 5 minutos são suficientes para uma operação legítima.
// Curto o suficiente para limitar a janela de ataque se o nonce vazar.
const NONCE_TTL_SEGUNDOS = 300;

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === 'vitoria' && password === '123456') {
        // Token com validade de 1h — igual ao baseline e ao JTI.
        const token = jwt.sign({ username, role: 'admin' }, SECRET, { expiresIn: '1h' });
        return res.json({ auth: true, token });
    }

    res.status(401).json({ message: 'Credenciais inválidas.' });
});

// Endpoint de geração de nonce: deve ser chamado antes de cada
// operação crítica. Retorna um valor aleatório de 32 caracteres hex
// que fica armazenado no Redis com TTL de 5 minutos.
app.get('/gerar-nonce', async (req, res) => {
    try {
        const nonce = randomBytes(16).toString('hex');
        await redisClient.set(`nonce:${nonce}`, 'valido', { EX: NONCE_TTL_SEGUNDOS });
        res.json({ nonce });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao gerar nonce.' });
    }
});

app.post('/transferir', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    const { nonce } = req.body;

    if (!token) return res.status(403).json({ message: 'Token não fornecido.' });
    if (!nonce) return res.status(400).json({ message: 'Nonce não fornecido.' });

    try {
        // Verifica a assinatura e validade do JWT.
        const decoded = jwt.verify(token, SECRET);

        // Verifica se o nonce existe no Redis (se é válido e não foi usado).
        const nonceExiste = await redisClient.get(`nonce:${nonce}`);

        if (!nonceExiste) {
            return res.status(401).json({
                message: 'Replay Attack bloqueado! Nonce inválido ou já utilizado.'
            });
        }

        // Consome o nonce imediatamente — torna a operação idempotente.
        // Qualquer replay desta requisição com o mesmo nonce será rejeitado.
        await redisClient.del(`nonce:${nonce}`);

        res.json({ message: `Sucesso! R$ 100,00 transferidos por ${decoded.username}.` });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expirado.' });
        }
        res.status(401).json({ message: 'Token inválido ou nonce inválido.' });
    }
});

app.listen(3003, () => {
    console.log('Servidor NONCE rodando na porta 3003');
});
