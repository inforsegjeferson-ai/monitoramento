import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnvIfPresent(envPath = resolve(process.cwd(), '.env')) {
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // Remove surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  // Permite rodar sem instalar dotenv: lê `.env` se existir.
  loadDotEnvIfPresent();

  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('Missing VITE_SUPABASE_URL (configure in .env or env vars).');
  }
  if (!serviceRoleKey) {
    throw new Error(
      "RLS is blocking inserts. For seeding, set SUPABASE_SERVICE_ROLE_KEY in your .env (do NOT put it in VITE_ vars)."
    );
  }

  // Ajuda a diagnosticar problemas no .env sem expor segredos.
  console.log('[seed] VITE_SUPABASE_URL:', url);
  console.log('[seed] project ok:', url.includes('ujtoqfqxapvhdkyvbrhi') ? 'yes' : 'no');
  console.log('[seed] using key: service_role');

  // Para seed, preferir service role se existir (evita bloqueio de RLS).
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();

  // 5 usinas de teste (inclui os 2 exemplos solicitados).
  // OBS:
  // - Na sua base, `usinas` NÃO tem coluna `marca` (é `marca_id`) nem `potencia_atual_kw`.
  // - A potência atual fica em `leituras_diarias.potencia_atual_kw`.
  const seedRows = [
    {
      nome_cliente: 'Cliente Teste Huawei',
      potencia_instalada_kwp: 50,
      potencia_atual_kw: 12.4,
      status: 'online',
      ultima_atualizacao: now,
    },
    {
      nome_cliente: 'Cliente Teste SolarMAN',
      potencia_instalada_kwp: 30,
      potencia_atual_kw: 3.6,
      status: 'alerta',
      ultima_atualizacao: now,
    },
    {
      nome_cliente: 'Cliente Teste Sungrow',
      potencia_instalada_kwp: 75,
      potencia_atual_kw: 0,
      status: 'offline',
      ultima_atualizacao: now,
    },
    {
      nome_cliente: 'Cliente Teste Deye',
      potencia_instalada_kwp: 20,
      potencia_atual_kw: 5.1,
      status: 'online',
      ultima_atualizacao: now,
    },
    {
      nome_cliente: 'Cliente Teste Canadian',
      potencia_instalada_kwp: 60,
      potencia_atual_kw: 8.3,
      status: 'alerta',
      ultima_atualizacao: now,
    },
  ] as const;

  // Insere usinas (colunas reais): nome_cliente, potencia_kwp, status, ultima_atualizacao
  const { data: inserted, error: insError } = await supabase
    .from('usinas')
    .insert(
      seedRows.map((r) => ({
        nome_cliente: r.nome_cliente,
        potencia_kwp: r.potencia_instalada_kwp,
        status: r.status,
        ultima_atualizacao: r.ultima_atualizacao,
      }))
    )
    .select('id, nome_cliente, status');

  if (insError) throw insError;

  console.log(`Seed OK. Inseridas: ${inserted?.length ?? 0}`);

  // Cria leituras (potência atual) para cada usina inserida
  const byName = new Map(seedRows.map((r) => [r.nome_cliente, r]));
  const leituraRows =
    (inserted ?? [])
      .map((u) => {
        const src = byName.get(u.nome_cliente);
        if (!src) return null;
        return {
          usina_id: u.id,
          potencia_atual_kw: src.potencia_atual_kw,
          data_hora: now,
        };
      })
      .filter(Boolean) as Array<{ usina_id: string; potencia_atual_kw: number; data_hora: string }>;

  const { error: leituraError } = await supabase.from('leituras_diarias').insert(leituraRows);
  if (leituraError) throw leituraError;

  const { data: check, error: checkError } = await supabase
    .from('usinas')
    .select('*')
    .ilike('nome_cliente', 'Cliente Teste%')
    .order('nome_cliente', { ascending: true });

  if (checkError) throw checkError;
  console.log('Registros encontrados (Cliente Teste%):');
  for (const row of check ?? []) {
    console.log(`- ${row.nome_cliente} | status=${row.status}`);
  }

  console.log('\nAgora abra o dashboard e clique em "Atualizar" para ver os registros.');
}

main().catch((err) => {
  console.error('Seed ERROR:', err);
  process.exit(1);
});

