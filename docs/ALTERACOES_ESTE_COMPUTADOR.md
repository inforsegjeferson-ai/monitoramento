# Alterações feitas neste computador (para comparar com a cópia do outro)

Use este documento para saber o que foi alterado/adicionado **neste** computador. Ao colar a cópia do outro PC, você pode reaplicar o que faltar ou conferir o que mudou.

---

## 1. Login removido / entrada automática

- **Arquivos:** `src/App.tsx`, `src/components/ProtectedRoute.tsx`, `src/hooks/useAuth.tsx`
- **O que foi feito:** Tela de login removida; app entra direto como visitante. Rota `/login` redireciona para `/`. Quando não há sessão Supabase, `useAuth` usa usuário "visitante@local" com role visualizador. `ProtectedRoute` não redireciona mais para login.

---

## 2. Atualização automática a cada 5 minutos

- **Arquivo:** `src/pages/Index.tsx`
- **O que foi feito:** `useEffect` com `setInterval` que chama `fetchPlants()` a cada 5 min (300.000 ms).

---

## 3. Relatório PDF com filtros (status e marca)

- **Arquivos:** `src/pages/Index.tsx`
- **O que foi feito:** Botão "Gerar PDF" abre um **dialog** com filtros: Status (Online, Offline, Baixa eficiência) e Marca (checkboxes para cada marca). Só as usinas selecionadas entram no PDF. Contador "X usina(s) serão incluídas".

---

## 4. Coluna "Geração do dia (kWh)" na tabela

- **Arquivos:** `src/pages/Index.tsx`, `src/components/FleetTable.tsx`, `src/types/plant.ts`, `src/integrations/supabase/types.ts`
- **O que foi feito:** Nova coluna entre "Produção (kW)" e "Eficiência". Dados vêm de `leituras_diarias` (por `usina_id`) e de `usinas.geracao_dia_kwh` (Huawei, Intelbras, HYXIPOWER). Tipo `Plant` ganhou `geracao_dia_kwh?: number | null`. Em `usinas` no types: campo `geracao_dia_kwh`.

---

## 5. Eficiência com 5h de sol e média 11h–14h

- **Arquivos:** `src/pages/Index.tsx`, `src/types/plant.ts`, `src/components/PlantDetailsDrawer.tsx`
- **O que foi feito:**
  - Constante `HORAS_SOL_POR_DIA = 5`. Eficiência diária = (geração do dia / (potência instalada × 5)) × 100.
  - Busca média de potência entre **11h e 14h** em `leituras_diarias`. Tipo `Plant`: `avg_potencia_11_14`, `geracao_ontem_kwh`.
  - Eficiência pela média 11h–14h **só após 14h** e só quando: usina em **alerta** OU **ontem não gerou o esperado** (< 80%). No drawer, label "Média 11h–14h" nesses casos.
  - Bloco "Geração ontem" no drawer: mostra kWh ontem vs esperado e "Abaixo do esperado" se < 80%.

---

## 6. Gráfico "Potência por horário" no drawer

- **Arquivos:** `src/components/PlantDetailsDrawer.tsx`, `src/data/mockPlants.ts`, `src/types/plant.ts`
- **O que foi feito:** Gráfico por horário (06:00–18:00). **Hoje:** só até a hora atual (sem horários futuros). Seletor de dia: **Hoje**, **Ontem**, **D-2**, **D-3**. Dias anteriores vêm de `leituras_diarias` (potência por hora). Tipo `PotenciaPorHora`: `hour`, `potencia_kw`. Função `generatePotenciaPorHora(plant)` em mockPlants.

---

## 7. Alerta: janela 11h–14h e só após 14h

- **Arquivos:** `supabase/functions/monitoramento-solar/index.ts`, todos os `robo_*.js`, `docs/STATUS_ALERTA.md`
- **O que foi feito:** Regra de alerta usa janela **11h–14h** e só é aplicada **após 14h**. Edge e robôs: condição de alerta com `hora >= 14` (em vez de 10–16). Documentação em `docs/STATUS_ALERTA.md`.

---

## 8. Favoritos (estrela) e ordem na tabela

- **Arquivos:** `src/hooks/useFavorites.ts` (novo), `src/components/FleetTable.tsx`, `src/components/PlantDetailsDrawer.tsx`
- **O que foi feito:** Hook `useFavorites()` com localStorage (chave `monitoramento-favoritos`). Coluna estrela na tabela; botão estrela no drawer. Favoritos aparecem **no início** da lista (ordenados antes dos demais).

---

## 9. Coluna Eficiência não cortada (rolagem horizontal)

- **Arquivo:** `src/components/FleetTable.tsx`
- **O que foi feito:** `ScrollArea` trocado por `div` com `overflow-auto`. Tabela com `min-w-[920px]`. Coluna extra para favorito. `whitespace-nowrap` nas células para não quebrar texto.

---

## 10. "Offline há X" (tempo offline)

- **Arquivos:** `src/lib/utils.ts`, `src/components/FleetTable.tsx`, `src/components/PlantDetailsDrawer.tsx`, `supabase/functions/monitoramento-solar/index.ts`, todos os `robo_*.js`
- **O que foi feito:**
  - Função **`formatOfflineDuration(lastUpdateIso)`** em `utils.ts`: retorna "X min", "Xh Ymin", "X dia(s)".
  - **Backend:** quando status é **offline**, **não** atualizar `ultima_atualizacao` (fica a data da última vez online). Edge e robôs: `...(status !== 'offline' && { ultima_atualizacao: ... })`.
  - Na tabela: para status offline, abaixo do badge mostra "Offline há X" com tooltip da última atualização.
  - No drawer: quando offline, "Offline há X" em destaque e "Última vez online: [data]".

---

## Resumo de arquivos novos

| Arquivo | Descrição |
|---------|-----------|
| `src/hooks/useFavorites.ts` | Hook de favoritos (localStorage) |
| `docs/STATUS_ALERTA.md` | Documentação da regra de alerta |
| `docs/ALTERACOES_ESTE_COMPUTADOR.md` | Este arquivo |

---

## Resumo de arquivos modificados (principais)

- `src/App.tsx` – rota /login → redirect; sem tela Login
- `src/pages/Index.tsx` – refresh 5 min; filtros PDF; leituras 11h–14h e ontem; eficiência e `avg_potencia_11_14`; `geracao_dia_kwh`/`geracao_ontem_kwh`
- `src/components/ProtectedRoute.tsx` – sem redirect para /login
- `src/hooks/useAuth.tsx` – usuário visitante quando sem sessão; signOut volta para visitante
- `src/components/FleetTable.tsx` – coluna favorito; "Offline há X"; rolagem horizontal; coluna Geração do dia
- `src/components/PlantDetailsDrawer.tsx` – gráfico por dia (Hoje/Ontem/D-2/D-3); favorito; "Média 11h–14h"; Geração ontem; "Offline há X"
- `src/types/plant.ts` – `geracao_dia_kwh`, `avg_potencia_11_14`, `geracao_ontem_kwh`
- `src/lib/utils.ts` – `formatOfflineDuration()`
- `src/integrations/supabase/types.ts` – `usinas.geracao_dia_kwh`
- `supabase/functions/monitoramento-solar/index.ts` – alerta só após 14h; `ultima_atualizacao` só quando não offline
- `robo_*.js` (Huawei, Intelbras, SAJ, Canadian, HYXIPOWER, Sungrow, Solarman Pro) – alerta com `hora >= 14`; `ultima_atualizacao` só quando não offline

---

## Como comparar com a cópia do outro computador

1. Copie a pasta do outro PC para um **outro** diretório (ex.: `monitoramento-outro`).
2. Use um comparador de pastas (WinMerge, Beyond Compare, ou `git diff` se inicializar um repo em cada pasta) entre `monitoramento` (este) e `monitoramento-outro`.
3. Ou abra os arquivos listados acima nos dois lados e compare: as diferenças devem bater com os itens 1–10.
4. Se você **sobrescrever** este computador com a cópia do outro, tudo o que está neste documento deixa de existir aqui até você reaplicar (ou refazer) as alterações.

Se quiser, posso ajudar a reaplicar alguma dessas alterações em arquivos que você colar do outro PC (basta dizer qual item e colar o trecho do outro computador).
