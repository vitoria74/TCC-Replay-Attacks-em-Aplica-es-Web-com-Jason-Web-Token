// TESTE DE CARGA — NONCE (USO LEGÍTIMO)
//
// Simula o fluxo completo de um usuário legítimo:
//   Login → Buscar Nonce → Transferir (com nonce válido)
//
// Cada VU faz login uma vez e, a cada iteração, busca um nonce novo
// para cada transferência. Isso reflete o comportamento correto:
// nonces não são reutilizáveis, então cada operação exige um novo.
//
// Overhead esperado: maior que o JTI (que faz 1 consulta Redis),
// pois o nonce exige GET /gerar-nonce + GET Redis (verificar) +
// DEL Redis (consumir) por operação.

import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
    vus: 10,
    duration: '30s',
    thresholds: {
        http_req_duration: ['p(95)<500'],
    },
};

const BASE_URL = 'http://127.0.0.1:3003';

export default function () {
    // Passo 1: Login — token válido por 1h, reutilizado nas iterações.
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

    // Passo 2: Busca um nonce fresco para esta operação específica.
    // Esta requisição adicional é o custo extra do Nonce em relação
    // aos outros cenários — relevante para a comparação de latência.
    const nonceRes = http.get(`${BASE_URL}/gerar-nonce`);
    check(nonceRes, { 'nonce gerado (200)': (r) => r.status === 200 });

    if (nonceRes.status !== 200) {
        sleep(0.1);
        return;
    }

    const nonce = JSON.parse(nonceRes.body).nonce;

    // Passo 3: Transferência com token + nonce válido.
    const transRes = http.post(
        `${BASE_URL}/transferir`,
        JSON.stringify({ valor: 100, nonce }),
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
