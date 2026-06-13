// TESTE DE REPLAY ATTACK — JTI COM BLACKLISTING
//
// Demonstra a proteção: o usuário faz login, usa o token e faz logout.
// O logout revoga o JTI na blacklist do Redis. Em seguida, um atacante
// tenta reutilizar o token interceptado — é bloqueado imediatamente.
//
// Fluxo do teste:
//   1. VU faz login e obtém token.
//   2. VU faz uma transferência legítima (deve passar).
//   3. VU faz logout (JTI vai para a blacklist do Redis).
//   4. VU tenta usar o mesmo token novamente (deve ser bloqueado).
//
// Esperado:
//   - Transferência antes do logout: Sucesso
//   - Transferência após logout (replay): Negado

import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
    vus: 10,
    duration: '30s',
};

const BASE_URL = 'http://127.0.0.1:3001';

export default function () {
    // Passo 1: Login legítimo.
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

    // Passo 2: Uso legítimo do token antes do logout.
    const transLegitima = http.post(
        `${BASE_URL}/transferir`,
        JSON.stringify({ valor: 100 }),
        authHeader
    );
    check(transLegitima, { 'uso legítimo antes do logout (200)': (r) => r.status === 200 });

    // Passo 3: Logout — revoga o JTI na blacklist do Redis.
    const logoutRes = http.post(`${BASE_URL}/logout`, null, authHeader);
    check(logoutRes, { 'logout realizado (200)': (r) => r.status === 200 });

    // Passo 4: Tentativa de replay com o token agora revogado.
    // Simula o atacante que interceptou o token e tenta reutilizá-lo
    // após o usuário legítimo ter encerrado a sessão.
    const replay = http.post(
        `${BASE_URL}/transferir`,
        JSON.stringify({ valor: 100 }),
        authHeader
    );
    check(replay, { 'replay bloqueado após logout (401)': (r) => r.status === 401 });

    sleep(0.1);
}
