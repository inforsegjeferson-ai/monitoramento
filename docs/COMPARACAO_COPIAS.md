# Comparação: c:\monitoramento (este PC) vs C:\jsolarmonitoramento (cópia do outro PC)

Resumo do que **só existe ou está diferente** em **c:\monitoramento** (este computador) em relação à cópia em **C:\jsolarmonitoramento**.

---

## O que tem em c:\monitoramento e NÃO tem (ou está diferente) em C:\jsolarmonitoramento

### 1. Arquivos que SÓ existem em c:\monitoramento

| Caminho | Descrição |
|--------|-----------|
| `src/hooks/useFavorites.ts` | Hook de favoritos (localStorage) |
| `docs/STATUS_ALERTA.md` | Documentação da regra de alerta |
| `docs/ALTERACOES_ESTE_COMPUTADOR.md` | Lista de alterações deste PC |
| `docs/COMPARACAO_COPIAS.md` | Este arquivo |

Em **C:\jsolarmonitoramento** não existe a pasta **docs/** e não existe **useFavorites.ts**.

---

### 2. App.tsx

| Este PC (monitoramento) | Cópia (jsolarmonitoramento) |
|------------------------|-----------------------------|
| Rota `/login` redireciona para `/` | Rota `/login` mostra tela Login |
| Não importa `Login` | Importa e usa `<Login />` |
| Usa `Navigate` para redirect | Usa `<Login />` |

---

### 3. ProtectedRoute.tsx

| Este PC | Cópia |
|---------|--------|
| Não redireciona para /login quando não há usuário | Redireciona para `/login` quando `!user` |
| Sempre mostra o conteúdo após loading | Exige login |

---

### 4. useAuth.tsx

| Este PC | Cópia |
|---------|--------|
| Sem sessão → usuário "visitante@local", role visualizador | Sem sessão → user null (vai para login) |
| signOut volta para visitante | signOut deixa user null |

---

### 5. types/plant.ts

| Este PC | Cópia |
|---------|--------|
| Tem `geracao_dia_kwh`, `avg_potencia_11_14`, `geracao_ontem_kwh` | Não tem esses campos |

---

### 6. lib/utils.ts

| Este PC | Cópia |
|---------|--------|
| Tem `formatOfflineDuration()` para "Offline há X" | Só tem `cn()` |

---

### 7. Index.tsx (páginas)

No **este PC** tem (e na cópia não tem ou está diferente):

- Atualização automática a cada 5 min
- Busca leituras 11h–14h e ontem; `avg_potencia_11_14`, `geracao_ontem_kwh`
- Eficiência com 5h de sol; média 11h–14h só após 14h quando alerta ou ontem abaixo
- Dialog de filtros do PDF (status e marca)
- Constantes PLANT_BRANDS, STATUS_OPTIONS, HORAS_SOL_POR_DIA
- Lógica `usarEficienciaMedia11_14` e `ontemAbaixoDoEsperado`

---

### 8. FleetTable.tsx

No **este PC** tem:

- Coluna favorito (estrela) e uso de `useFavorites`
- Ordenação: favoritos primeiro
- Coluna "Geração do dia (kWh)"
- "Offline há X" para status offline
- Rolagem horizontal (overflow-auto, min-w tabela)
- Import de `formatOfflineDuration`

Na **cópia**: tabela sem favoritos, sem coluna geração do dia, sem "Offline há X", provavelmente com ScrollArea e sem rolagem horizontal.

---

### 9. PlantDetailsDrawer.tsx

No **este PC** tem:

- Gráfico "Potência por horário" com seletor Hoje / Ontem / D-2 / D-3
- Hoje só até a hora atual (sem horários futuros)
- Dados de dias anteriores vindo de `leituras_diarias`
- Botão favorito (estrela) no header
- Bloco "Geração ontem" (esperado vs real; "Abaixo do esperado")
- "Média 11h–14h" na eficiência quando aplicável
- "Offline há X" e "Última vez online" quando offline
- Uso de `useFavorites` e `formatOfflineDuration`

Na **cópia**: drawer mais simples, sem seletor de dia, sem favorito, sem geração ontem, sem "Offline há X".

---

### 10. integrations/supabase/types.ts

| Este PC | Cópia |
|---------|--------|
| Tabela `usinas` com campo `geracao_dia_kwh` | Provavelmente sem esse campo |

---

### 11. Edge Function (monitoramento-solar/index.ts)

No **este PC**:

- Alerta só após 14h (`horaBrasilia >= 14`)
- `ultima_atualizacao` só quando `status !== 'offline'`

Na **cópia**: provavelmente alerta em 10h–16h e sempre atualiza `ultima_atualizacao`.

---

### 12. Robôs (robo_*.js)

No **este PC**:

- Regra de alerta com `hora >= 14` (janela 11h–14h)
- `ultima_atualizacao` só quando `statusFinal !== 'offline'` (spread condicional)

Na **cópia**: provavelmente `hora >= 10 && hora <= 16` e sempre `ultima_atualizacao`.

---

## O que a cópia (jsolarmonitoramento) tem a mais

- **README.md** na raiz (em c:\monitoramento pode não existir)
- Estrutura “original”: com login, sem favoritos, sem geração do dia, sem "Offline há X", etc.

---

## Como usar

1. **Manter as alterações deste PC**  
   Use **c:\monitoramento** como projeto principal. Se quiser algo da cópia (ex.: README), copie só esse arquivo de **C:\jsolarmonitoramento** para **c:\monitoramento**.

2. **Substituir por completo pela cópia**  
   Se você copiar todo o conteúdo de **C:\jsolarmonitoramento** para **c:\monitoramento** (sobrescrevendo), **perde** todas as alterações listadas acima. Para tê-las de novo, seria preciso refazer ou reaplicar a partir de **docs/ALTERACOES_ESTE_COMPUTADOR.md**.

3. **Juntar o que quiser**  
   Você pode, por exemplo, copiar de **C:\jsolarmonitoramento** só o **README.md** para **c:\monitoramento** e deixar o resto do código como está em **c:\monitoramento**.

Se disser o que você quer (ex.: “usar a cópia mas com login removido e favoritos”), posso indicar exatamente quais arquivos/pastas copiar e de onde para onde.
