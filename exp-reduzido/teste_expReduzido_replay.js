// TESTE DE REPLAY ATTACK — EXPIRAÇÃO REDUZIDA
//
// Demonstra a proteção por expiração: um token capturado se torna inútil
// após 30 segundos. O atacante não consegue reutilizá-lo depois disso.
//
// Fluxo do teste:
//   1. VU faz login e obtém token (válido por 30s).
//   2. VU aguarda a expiração do token (31s de sleep).
//   3. VU tenta usar o token expirado —> deve ser bloqueado (401).
//
// IMPORTANTE: Este script roda 1 VU por 60s para dar tempo ao token
// de expirar antes da tentativa de replay.
//
// Esperado:
//   - Transferência com token fresco (antes do sleep): 200 
//   - Transferência após expiração (replay): 401 (protegido)

import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
    // 1 VU por ciclo suficiente —> este teste demonstra o bloqueio,
    // não mede throughput.
    vus: 1,
    iterations: 5,
};

const BASE_URL = 'http://127.0.0.1:3002';

export default function () {
    // Passo 1: Login e uso legítimo imediato (token ainda válido).
    const loginRes = http.post(
        `${BASE_URL}/login`,
        JSON.stringify({ username: 'vitoria', password: '123456' }),
        { headers: { 'Content-Type': 'application/json' } }
    );

    if (loginRes.status !== 200) return;

    const token = JSON.parse(loginRes.body).token;
    const authHeader = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
    };

    // Uso legítimo imediato —> deve passar.
    const transLegitima = http.post(
        `${BASE_URL}/transferir`,
        JSON.stringify({ valor: 100 }),
        authHeader
    );
    check(transLegitima, { 'uso legítimo (token fresco, 200)': (r) => r.status === 200 });

    // Passo 2: Aguarda a expiração do token (30s + 1s de margem).
    // Simula o atacante que interceptou o token mas só conseguiu
    // reutilizá-lo após a janela de validade se fechar.
    console.log('Aguardando expiração do token (31s)...');
    sleep(31);

    // Passo 3: Tentativa de replay com token expirado.
    const replay = http.post(
        `${BASE_URL}/transferir`,
        JSON.stringify({ valor: 100 }),
        authHeader
    );
    check(replay, { 'replay bloqueado após expiração (401)': (r) => r.status === 401 });
}
