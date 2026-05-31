// TESTE DE CARGA — SEM MITIGAÇÃO (BASELINE)
// Simula um usuário legítimo fazendo login e realizando transferências.
// Serve como referência de desempenho: mede a latência e o throughput
// de uma API JWT sem nenhuma proteção adicional (sem Redis, sem blacklist).
// Todos os outros cenários são comparados contra estes números.

import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
    vus: 10,
    duration: '30s',
    thresholds: {
        http_req_duration: ['p(95)<500'],
    },
};

const BASE_URL = 'http://127.0.0.1:3000';

export default function () {
    // Passo 1: Login — obtém um token JWT fresco a cada iteração.
    // Isso garante que o teste não falhe por token expirado e reflete
    // o fluxo real de autenticação que será medido nos outros cenários.
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

    // Passo 2: Transferência com o token obtido.
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
