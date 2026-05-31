const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());

const SECRET = process.env.JWT_SECRET || 'chave_mestra_reserva';

// -------------------------------------------------------------------
// CENÁRIO EXPIRAÇÃO REDUZIDA (SHORT-LIVED TOKEN)
//
// O token JWT é emitido com tempo de vida curto (30 segundos).
// Isso reduz a janela de oportunidade do atacante: mesmo que um token
// seja interceptado, ele se torna inválido rapidamente.
//
// Diferença em relação ao JTI e ao Nonce:
//   - Sem Redis, sem estado server-side — mantém o modelo stateless puro.
//   - Não revoga tokens imediatamente: um atacante que intercepte o token
//     ainda tem até 30s para utilizá-lo antes da expiração natural.
//   - Após a expiração, o cliente precisa fazer login novamente para obter
//     um token fresco (sem mecanismo de renovação neste cenário isolado).
//
// Vantagem: zero overhead de infraestrutura (sem consulta a banco).
// Limitação: não garante uso único. Replay é possível dentro da janela.
// -------------------------------------------------------------------

const EXPIRACAO_SEGUNDOS = 30;

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === 'vitoria' && password === '123456') {
        // Token com validade curta —> janela de oportunidade reduzida.
        const token = jwt.sign(
            { username, role: 'admin' },
            SECRET,
            { expiresIn: `${EXPIRACAO_SEGUNDOS}s` }
        );
        return res.json({ auth: true, token, expiresIn: EXPIRACAO_SEGUNDOS });
    }

    res.status(401).json({ message: 'Credenciais inválidas.' });
});

app.post('/transferir', (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(403).json({ message: 'Token não fornecido.' });

    try {
        // jwt.verify já rejeita tokens expirados automaticamente.
        // Não há consulta ao Redis —> o controle é puramente criptográfico.
        const decoded = jwt.verify(token, SECRET);

        res.json({ message: `Sucesso! R$ 100,00 transferidos por ${decoded.username}.` });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expirado. Faça login novamente.' });
        }
        res.status(401).json({ message: 'Token inválido.' });
    }
});

app.listen(3002, () => {
    console.log(`Servidor EXP REDUZIDA (${EXPIRACAO_SEGUNDOS}s) rodando na porta 3002`);
});
