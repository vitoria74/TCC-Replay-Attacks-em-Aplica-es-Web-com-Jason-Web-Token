// TESTE DE REPLAY ATTACK — REFRESH TOKEN + ACCESS TOKEN
//
// Demonstra dois aspectos da proteção:
//   A) Replay com access token expirado → bloqueado (401)
//   B) Replay após logout (refresh revogado) → novo access token impossível
//
// Fluxo A — Expiração do access token:
//   1. Login → access token válido por 1min.
//   2. Transferência legítima imediata (200 esperado).
//   3. Aguarda 61 segundos (token expira).
//   4. Replay com access token expirado (401 esperado).
//   5. Renovação com refresh token → novo access token (200 esperado).
//
// Fluxo B — Revogação do refresh token:
//   1. Login → access token + refresh token.
//   2. Logout → refresh token revogado no Redis.
//   3. Tentativa de renovação com refresh revogado (403 esperado).
//
// Este script demonstra o comportamento, não o throughput.
// Para métricas de carga, use teste_refresh_carga.js.

import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
    vus: 1,
    iterations: 3,
};

const BASE_URL = 'http://127.0.0.1:3004';
const jsonHeader = { headers: { 'Content-Type': 'application/json' } };

export default function () {
    console.log('\n--- FLUXO A: Replay com access token expirado ---');

    // Login.
    const loginRes = http.post(
        `${BASE_URL}/login`,
        JSON.stringify({ username: 'vitoria', password: '123456' }),
        jsonHeader
    );
    if (loginRes.status !== 200) return;

    const { accessToken, refreshToken } = JSON.parse(loginRes.body);
    const authHeader = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
    };

    // Uso legítimo imediato.
    const transLegitima = http.post(
        `${BASE_URL}/transferir`,
        JSON.stringify({ valor: 100 }),
        authHeader
    );
    check(transLegitima, { '[A] uso legítimo (access token fresco, 200)': (r) => r.status === 200 });

    // Aguarda o access token expirar (60s + 1s de margem).
    console.log('Aguardando expiração do access token (61s)...');
    sleep(61);

    // Replay com access token expirado — deve ser bloqueado.
    const replayExpirado = http.post(
        `${BASE_URL}/transferir`,
        JSON.stringify({ valor: 100 }),
        authHeader
    );
    check(replayExpirado, { '[A] replay bloqueado (access expirado, 401)': (r) => r.status === 401 });

    // Renovação legítima usando o refresh token — deve funcionar.
    const refreshRes = http.post(
        `${BASE_URL}/refresh`,
        JSON.stringify({ refreshToken }),
        jsonHeader
    );
    check(refreshRes, { '[A] renovação com refresh token (200)': (r) => r.status === 200 });

    if (refreshRes.status === 200) {
        const newAccessToken = JSON.parse(refreshRes.body).accessToken;

        // Transferência com novo access token — deve passar.
        const transComNovoToken = http.post(
            `${BASE_URL}/transferir`,
            JSON.stringify({ valor: 100 }),
            { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${newAccessToken}` } }
        );
        check(transComNovoToken, { '[A] transferência com novo access token (200)': (r) => r.status === 200 });
    }

    console.log('\n--- FLUXO B: Revogação do refresh token via logout ---');

    // Login novamente para testar o logout.
    const login2Res = http.post(
        `${BASE_URL}/login`,
        JSON.stringify({ username: 'vitoria', password: '123456' }),
        jsonHeader
    );
    if (login2Res.status !== 200) return;

    const dados2 = JSON.parse(login2Res.body);

    // Logout — revoga o refresh token no Redis.
    const logoutRes = http.post(
        `${BASE_URL}/logout`,
        JSON.stringify({ refreshToken: dados2.refreshToken }),
        jsonHeader
    );
    check(logoutRes, { '[B] logout realizado (200)': (r) => r.status === 200 });

    // Tentativa de usar o refresh token revogado — deve ser bloqueada.
    const refreshRevogado = http.post(
        `${BASE_URL}/refresh`,
        JSON.stringify({ refreshToken: dados2.refreshToken }),
        jsonHeader
    );
    check(refreshRevogado, { '[B] refresh revogado bloqueado (403)': (r) => r.status === 403 });

    sleep(0.1);
}
