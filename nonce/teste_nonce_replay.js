// TESTE DE REPLAY ATTACK — NONCE
//
// Demonstra a proteção por idempotência: após uma transferência legítima,
// qualquer tentativa de replay da mesma requisição é bloqueada porque
// o nonce já foi consumido.
//
// Fluxo do teste:
//   1. VU faz login e obtém token.
//   2. VU busca um nonce válido.
//   3. VU realiza transferência legítima com esse nonce (200 esperado).
//   4. VU tenta repetir a mesma transferência com o nonce já consumido
//      (simula o replay — 401 esperado).
//
// Esperado:
//   - Primeira transferência com nonce fresco: 200 ✓
//   - Replay com nonce consumido: 401 ✓ (protegido)

import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
    vus: 10,
    duration: '30s',
};

const BASE_URL = 'http://127.0.0.1:3003';

export default function () {
    // Passo 1: Login.
    const loginRes = http.post(
        `${BASE_URL}/login`,
        JSON.stringify({ username: 'vitoria', password: '123456' }),
        { headers: { 'Content-Type': 'application/json' } }
    );

    if (loginRes.status !== 200) { sleep(0.1); return; }

    const token = JSON.parse(loginRes.body).token;
    const authHeader = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
    };

    // Passo 2: Busca nonce válido.
    const nonceRes = http.get(`${BASE_URL}/gerar-nonce`);
    if (nonceRes.status !== 200) { sleep(0.1); return; }

    const nonce = JSON.parse(nonceRes.body).nonce;
    const payload = JSON.stringify({ valor: 100, nonce });

    // Passo 3: Transferência legítima — nonce é consumido aqui.
    const transLegitima = http.post(`${BASE_URL}/transferir`, payload, authHeader);
    check(transLegitima, { 'uso legítimo (nonce fresco, 200)': (r) => r.status === 200 });

    // Passo 4: Replay com o mesmo nonce (já consumido no passo anterior).
    // Simula o atacante que capturou a requisição completa (token + nonce)
    // e tenta reenviá-la. O nonce foi deletado do Redis — bloqueado.
    const replay = http.post(`${BASE_URL}/transferir`, payload, authHeader);
    check(replay, { 'replay bloqueado (nonce consumido, 401)': (r) => r.status === 401 });

    sleep(0.1);
}
