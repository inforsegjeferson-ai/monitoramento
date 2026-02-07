# Como é determinado o status "Usinas em Alerta"

O frontend **não calcula** o status. Ele apenas **lê** o campo `status` da tabela `usinas` no Supabase e exibe (online / offline / alerta). O status é **calculado no momento em que os dados são gravados** — pela Edge Function `monitoramento-solar` ou pelos robôs (Playwright).

**Regra geral:** a avaliação de alerta é considerada **só após as 14h**. Antes disso não se marca "alerta" por baixa eficiência. A faixa de horário usada para a análise é **11h–14h** (e no frontend, a eficiência pela média 11h–14h só aparece após 14h, priorizando a verificação da geração do dia anterior).

---

## Regras usadas ao gravar (quem define "alerta")

### 1. Edge Function `monitoramento-solar` (SolarMAN e Huawei via API)

- **Quando avalia:** só **após 14h** (Brasília).
- **Alerta:** se `potência_atual < 10%` da potência instalada (eficiência < 10%).
- **Offline:** se potência = 0 entre 8h e 18h.

Arquivo: `supabase/functions/monitoramento-solar/index.ts`

---

### 2. Robôs (Huawei, Intelbras, HYXIPOWER, Sungrow, SolarMAN, SAJ, Canadian)

- **Janela de interesse:** 11h–14h (Brasília). Avaliação de alerta **só após 14h**.
- **Eficiência:** `(potência_atual_kw / potencia_instalada_kwp) * 100`.
- **Alerta:** após 14h, se **eficiência < 20%** e **potência_atual > 0**.
- **Offline:** se potência = 0 no horário de sol (ex.: 8h–18h).

Arquivos (lógica de alerta): `robo_huawei.js`, `robo_intelbras.js`, `robo_hyxipower.js`, `robo_sungrow.js`, `robo_solarman_pro.js`, `robo_saj.js`, `robo_canadian.js`.

**Nota:** Os robôs devem ser ajustados para usar janela 11h–14h e considerar alerta somente quando hora >= 14.

---

### 3. Frontend (eficiência pela média 11h–14h)

- **Quando usa a média 11h–14h:** só **após 14h**.
- **Ordem:** primeiro considera a **geração do dia anterior** (se não gerou o esperado); depois usa a média de potência **11h–14h** para eficiência quando: usina em alerta **ou** ontem ficou abaixo do esperado.
- Leitura em `leituras_diarias` entre 11:00 e 14:00 para calcular a média.

---

## Resumo

| Fonte   | Janela   | Quando aplica | Condição para "alerta" |
|---------|----------|----------------|-------------------------|
| Edge    | 11h–14h* | Só após 14h    | Eficiência < 10%        |
| Robôs   | 11h–14h* | Só após 14h    | Eficiência < 20% e potência > 0 |
| Frontend (média) | 11h–14h | Só após 14h; prioriza geração ontem | Exibe eficiência pela média 11h–14h se alerta ou ontem abaixo do esperado |

\* A Edge usa snapshot atual; a “janela” 11h–14h é a referência de horário para considerar a regra só após 14h.

O frontend só exibe o valor já gravado em `usinas.status`; o card "Usinas em Alerta" é a contagem de usinas com `status === 'alerta'`.
