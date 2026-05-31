// TESTE DE CARGA — JTI COM BLACKLISTING (USO LEGÍTIMO)
// Simula usuários legítimos fazendo login e realizando múltiplas
// transferências com o mesmo token (sem logout entre elas).
// Mede o overhead do JTI: toda requisição faz uma consulta ao Redis
// para verificar se o token está na blacklist.
// Compare a latência/RPS deste teste com o baseline (semMitigacao).

import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
    vus: 10,
    duration: '30s',
    thresholds: {
        http_req_duration: ['p(95)<500'],
    },
};

const BASE_URL = 'http://127.0.0.1:3001';

export default function () {
    // Passo 1: Login — obtém token com JTI embutido.
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
    const authHeader = { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } };

    // Passo 2: Transferência com token válido (não revogado).
    // O servidor consulta o Redis — JTI não está na blacklist — permite.
    const transRes = http.post(
        `${BASE_URL}/transferir`,
        JSON.stringify({ valor: 100 }),
        authHeader
    );

    check(transRes, { 'transferência bem-sucedida (200)': (r) => r.status === 200 });

    sleep(0.1);
}
