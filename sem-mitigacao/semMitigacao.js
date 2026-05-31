const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());

const SECRET = process.env.JWT_SECRET || 'chave_mestra_reserva';

// -------------------------------------------------------------------
// CENÁRIO BASE — SEM MITIGAÇÃO
// Implementação padrão de JWT sem nenhuma proteção adicional.
// Um token interceptado pode ser reutilizado livremente durante toda
// a sua janela de validade (1 hora), sem qualquer controle server-side.
// Este cenário serve como ponto de referência (baseline) para comparar
// o overhead de desempenho introduzido pelas demais estratégias.
// -------------------------------------------------------------------

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === 'vitoria' && password === '123456') {
        // Token com validade de 1 hora — igual ao JTI e ao Nonce,
        // garantindo comparabilidade de expiração entre os cenários.
        const token = jwt.sign({ username, role: 'admin' }, SECRET, { expiresIn: '1h' });
        return res.json({ auth: true, token });
    }

    res.status(401).json({ message: 'Credenciais inválidas.' });
});

app.post('/transferir', (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) return res.status(403).json({ message: 'Token não fornecido.' });

    jwt.verify(token, SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ message: 'Token inválido ou expirado.' });

        // Nenhuma verificação adicional — vulnerável ao Replay Attack.
        res.json({ message: `Sucesso! R$ 100,00 transferidos por ${decoded.username}.` });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor BASE (sem mitigação) rodando na porta ${PORT}`);
});
