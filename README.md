# TCC-Replay-Attacks-em-Aplicacoes-Web-com-Jason-Web-Token

Ambiente de teste (Testbed) desenvolvido para o TCC2 — avaliação comparativa de estratégias de mitigação de Replay Attacks em APIs que utilizam JSON Web Tokens.

---

## Estrutura do Repositório

```
├── sem-mitigacao/
│   ├── semMitigacao.js                 # API baseline — vulnerável
│   ├── teste_semMitigacao.js           # Teste de carga (k6) — uso legítimo
│   └── teste_semMitigacao_replay.js    # Demonstração do ataque (replay)
│
├── jti/
│   ├── JTI.js                          # API com JTI + blacklist no Redis
│   ├── teste_JTI_carga.js              # Teste de carga (k6) — uso legítimo
│   └── teste_JTI_replay.js             # Demonstração do bloqueio pós-logout
│
├── exp-reduzido/
│   ├── expReduzido.js                  # API com token de 30 segundos
│   ├── teste_expReduzido_carga.js      # Teste de carga (k6) — uso legítimo
│   └── teste_expReduzido_replay.js     # Demonstração do bloqueio por expiração
│
├── nonce/
│   ├── nonce.js                        # API com nonce de uso único
│   ├── teste_nonce_carga.js            # Teste de carga (k6) — uso legítimo
│   └── teste_nonce_replay.js           # Demonstração do bloqueio por nonce consumido
│
└── refresh/
    ├── refresh.js                      # API com refresh + access token
    ├── teste_refresh_carga.js          # Teste de carga (k6) — uso legítimo
    └── teste_refresh_replay.js         # Demonstração de expiração e revogação
```

---

## Portas dos Servidores

| Cenário            | Porta |
|--------------------|-------|
| Sem mitigação      | 3000  |
| JTI + Blacklist    | 3001  |
| Expiração reduzida | 3002  |
| Nonce              | 3003  |
| Refresh Token      | 3004  |

---

## Pré-requisitos

- **Node.js** v20 ou superior
- **Redis Server** v7 ou superior
- **k6** (Grafana k6) — ferramenta de teste de carga

---

## Passo 1 — Instalar as dependências (apenas na primeira vez)

Repita em cada pasta de cenário:

```bash
cd sem-mitigacao
npm init -y
npm install express jsonwebtoken redis dotenv
```

Os cenários que usam Redis (`jti`, `nonce`, `refresh`) precisam do pacote `redis`.
O cenário `exp-reduzido` e `sem-mitigacao` não usam Redis — instale apenas `express jsonwebtoken dotenv`.

---

## Passo 2 — Inicializar o Redis (`jti`, `nonce`, `refresh`)

```bash
# Linux (Ubuntu)
sudo systemctl start redis-server

# Verificar se está rodando
redis-cli ping
# Esperado: PONG
```

---

## Passo 3 — Executar os experimentos

### Como rodar cada cenário

- Observação: Para o cenário `sem-mitigacao` você deve gerar o token via Burp Suite, copiar e colar dentro do código `teste_semMitigacao_replay.js` na variável TOKEN_INTERCEPTADO.

```bash
# Captura token via Burp Suite ou curl:
curl -s -X POST http://127.0.0.1:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"vitoria","password":"123456"}'
# Copie o token retornado e cole em teste_semMitigacao_replay.js
```

```bash
# Terminal 1: inicia o servidor
node semMitigacao.js   # ou JTI.js, expReduzido.js, etc.

# Terminal 2: roda o teste de carga
k6 run teste_semMitigacao.js
```

- Para os cenários que usam o Redis - `jti`, `nonce`, `refresh` -, rodar o comando  `redis-cli INFO memory | grep human` (Solicita ao Redis todas as estatísticas detalhadas de uso de memória)

### Sequência recomendada para coleta de métricas comparativas

Rode sempre um cenário por vez, com o Redis limpo entre os cenários stateful:

```bash
# Limpar o Redis antes de cada cenário com Redis (JTI e Nonce)
redis-cli FLUSHDB
```

---

## Guia dos Experimentos

### Experimento 1 — Medir desempenho (carga legítima)

**Objetivo:** coletar métricas de latência e throughput de cada cenário, CPU e RAM

Execute o teste de carga de cada estratégia e registre:
- `http_req_duration` (média, p95, p99)
- `http_reqs` (RPS total)

Execute o pidstat de cada estratégia (apenas carga) e registre:
- `%CPU` (CPU)
- `%MEM` (Memória RAM)

```bash
pgrep -f "node nomeDoArquivo.js" -> Esse comando vai gerar o PID da aplicação. Copie e cole no campo <PID> do pidstat.
pidstat -p <PID> -r -u 1 30
```

```bash
k6 run sem-mitigacao/teste_semMitigacao.js    # baseline
k6 run jti/teste_JTI_carga.js                 # JTI
k6 run exp-reduzido/teste_expReduzido_carga.js # exp reduzida
k6 run nonce/teste_nonce_carga.js             # nonce
k6 run refresh/teste_refresh_carga.js         # refresh
```

### Experimento 2 — Confirmar o bloqueio do replay (por cenário)

```bash
k6 run jti/teste_JTI_replay.js                      # bloqueio pós-logout
k6 run exp-reduzido/teste_expReduzido_replay.js      # bloqueio por expiração
k6 run nonce/teste_nonce_replay.js                   # bloqueio por nonce consumido
k6 run refresh/teste_refresh_replay.js               # bloqueio por access expirado
```

---


## Observações sobre comparabilidade das métricas

Todos os cenários compartilham as mesmas condições base para garantir comparabilidade:
- **10 VUs, 30 segundos, sleep(0.1s)** em todos os testes de carga
- **Login via HTTP no script** — sem tokens hardcoded forjados fora do servidor
- **Mesma operação de negócio**: transferência fictícia de R$ 100,00
- **Mesmo Redis local** (localhost) — sem latência de rede externa
- **Secret JWT igual** em todos os cenários (`chave_mestra_reserva` via .env)
