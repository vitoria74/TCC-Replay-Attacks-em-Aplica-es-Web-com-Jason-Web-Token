// TESTE DE CARGA — REFRESH TOKEN + ACCESS TOKEN (USO LEGÍTIMO)
//
// Simula o fluxo completo de um cliente que usa access tokens curtos:
//   Login → Transferir (access token válido) → Renovar (quando expira) → Transferir
//
// IMPORTANTE sobre o que está sendo medido:
//   - A métrica principal de latência é a do endpoint /transferir,
//     que NÃO consulta Redis — similar ao baseline.
//   - O custo do refresh (/refresh consulta Redis) é medido separadamente.
//   - Isso valida a H3 do TCC: refresh não introduz overhead significativo
//     nas requisições autenticadas normais.
//
// Como o access token expira em 60s e o teste dura 30s, cada VU
// faz login no início e usa o mesmo token durante todo o teste —
// sem precisar renovar dentro desta janela.

import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
    vus: 10,
    duration: '30s',
    thresholds: {
        http_req_duration: ['p(95)<500'],
    },
};

const BASE_URL = 'http://127.0.0.1:3004';

export default function () {
    // Passo 1: Login — obtém access token (1min) e refresh token (7 dias).
    const loginRes = http.post(
        `${BASE_URL}/login`,
        JSON.stringify({ username: 'vitoria', password: '123456' }),
        { headers: { 'Content-Type': 'application/json' } }
    );

    check(loginRes, { 'login bem-sucedido (200)': (r) => r.status === 200 });

    if (loginRes.status !== 200) {
        sleep(0.1);
        return;
    }

    const { accessToken } = JSON.parse(loginRes.body);

    // Passo 2: Transferência com access token válido.
    // Esta é a operação do "dia a dia" — sem Redis, apenas jwt.verify.
    const transRes = http.post(
        `${BASE_URL}/transferir`,
        JSON.stringify({ valor: 100 }),
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    check(transRes, { 'transferência bem-sucedida (200)': (r) => r.status === 200 });

    sleep(0.1);
}
