// TESTE DE CARGA — EXPIRAÇÃO REDUZIDA (SHORT-LIVED TOKEN)
//
// Simula o fluxo de uso legítimo com tokens de curta duração.
// Como o token expira em 30 segundos e cada iteração tem sleep(0.1s),
// o script faz login a cada iteração para garantir que o token seja
// sempre válido durante o teste — refletindo o comportamento real
// de um cliente que precisa se reautenticar frequentemente.

import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
    vus: 10,
    duration: '30s',
    thresholds: {
        http_req_duration: ['p(95)<500'],
    },
};

const BASE_URL = 'http://127.0.0.1:3002';

export default function () {
    // Faz login a cada iteração —> necessário porque o token expira em 30s
    // e o teste dura 30s com múltiplas iterações por VU.
    // Isso também mede o custo real da estratégia: clientes com tokens
    // curtos precisam autenticar-se com mais frequência.
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

    const token = JSON.parse(loginRes.body).token;

    // Transferência com token fresco (dentro da janela de 30s).
    const transRes = http.post(
        `${BASE_URL}/transferir`,
        JSON.stringify({ valor: 100 }),
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        }
    );

    check(transRes, { 'transferência bem-sucedida (200)': (r) => r.status === 200 });

    sleep(0.1);
}
