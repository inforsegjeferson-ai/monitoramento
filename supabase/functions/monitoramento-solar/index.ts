import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Integração com API Northbound da Huawei FusionSolar
const HUAWEI_BASE_URL = 'https://la5.fusionsolar.huawei.com/openapi'
const HUAWEI_USERNAME = Deno.env.get('HUAWEI_USERNAME')
const HUAWEI_SYSTEM_CODE = Deno.env.get('HUAWEI_SYSTEM_CODE')

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Usar Service Role para bypass de RLS
  )

  try {
    // 1. Login na SolarMAN
    const loginRes = await fetch('https://globalapi.solarmanpv.com/account/v1.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: Deno.env.get('SOLARMAN_APP_ID'),
        secret: Deno.env.get('SOLARMAN_SECRET'),
        account: Deno.env.get('SOLARMAN_ACCOUNT'),
        password: Deno.env.get('SOLARMAN_PASSWORD'),
        language: 'pt_BR'
      }),
    })

    if (!loginRes.ok) throw new Error('Falha na autenticação SolarMAN')
    const auth = await loginRes.json()
    const token = auth.access_token

    let page = 1
    const size = 100
    let totalProcessadas = 0

    while (true) {
      // 2. Listar usinas da SolarMAN
      const res = await fetch('https://globalapi.solarmanpv.com/powerStation/v1.0/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `bearer ${token}`
        },
        body: JSON.stringify({ page, size })
      })

      const responseData = await res.json()
      const listaUsinas = responseData?.data?.list || []
      if (listaUsinas.length === 0) break

      // 3. Mapeamento e Lógica de Alerta
      const horaBrasilia = new Date().getUTCHours() - 3 // Ajuste simples para GMT-3

      const dadosParaSalvar = listaUsinas.map((u: any) => {
        let status = 'online'
        const potencia = u.generationPower || 0
        const capacidade = u.capacity || 0

        // Regra de Alerta: só após 14h; se produzir menos de 10% da capacidade (janela de interesse 11h–14h)
        if (horaBrasilia >= 14 && potencia < capacidade * 0.1) status = 'alerta'
        if (potencia === 0 && horaBrasilia >= 8 && horaBrasilia <= 18) status = 'offline'

        return {
          external_id: String(u.id),
          nome_cliente: u.name,
          potencia_instalada_kwp: capacidade,
          potencia_atual_kw: potencia,
          geracao_dia_kwh: u.dailyGeneration || 0,
          marca: 'SolarMAN',
          status: status,
          // Só atualiza data quando online/alerta para poder calcular "offline há X"
          ...(status !== 'offline' && { ultima_atualizacao: new Date().toISOString() })
        }
      })

      // 4. Upsert no Supabase
      const { error } = await supabase
        .from('usinas')
        .upsert(dadosParaSalvar, { onConflict: 'external_id' })

      if (error) throw error

      totalProcessadas += dadosParaSalvar.length
      if (listaUsinas.length < size) break
      page++
    }

    // Integração Huawei
    let totalHuawei = 0
    try {
      if (HUAWEI_USERNAME && HUAWEI_SYSTEM_CODE) {
        totalHuawei = await buscarDadosHuawei(supabase)
        console.log(`[Huawei] Processadas: ${totalHuawei} usinas`)
      } else {
        console.log('[Huawei] Credenciais não configuradas, pulando integração')
      }
    } catch (err) {
      console.error('[Huawei] Erro na integração:', err.message)
      // Não falha a função inteira se Huawei falhar
    }

    return new Response(JSON.stringify({ 
      success: true, 
      solarman: totalProcessadas,
      huawei: totalHuawei,
      total: totalProcessadas + totalHuawei
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

async function huaweiLogin(): Promise<{ xsrfToken: string } | null> {
  const url = `${HUAWEI_BASE_URL}/login`
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userName: HUAWEI_USERNAME,
      systemCode: HUAWEI_SYSTEM_CODE,
    }),
  })

  console.log('Status Huawei:', res.status)

  if (!res.ok) {
    const text = await res.text()
    console.error('Erro da Huawei:', text)
    return null
  }

  // Verificar se a resposta é JSON (não HTML)
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await res.text()
    throw new Error(
      `Acesso Northbound pode estar bloqueado. Resposta recebida não é JSON (Content-Type: ${contentType}). ` +
      `A API pode estar retornando uma página HTML de erro ou redirecionamento. ` +
      `Verifique se o acesso Northbound está habilitado na sua conta Huawei.`
    )
  }

  // Capturar xsrf-token do header
  const xsrfToken = res.headers.get('xsrf-token')
  if (!xsrfToken) {
    console.error('xsrf-token não encontrado nos headers da resposta')
    return null
  }

  return { xsrfToken }
}

async function buscarDadosHuawei(supabase: any): Promise<number> {
  const loginResult = await huaweiLogin()
  if (!loginResult) {
    throw new Error('Falha no login da Huawei')
  }

  // Chamar endpoint /v1/getPlantList
  const url = `${HUAWEI_BASE_URL}/v1/getPlantList`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xsrf-token': loginResult.xsrfToken,
    },
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Erro ao buscar plantas: ${res.status} - ${text}`)
  }

  // Verificar se a resposta é JSON
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await res.text()
    throw new Error(
      `Resposta não é JSON (Content-Type: ${contentType}). ` +
      `Possível bloqueio do acesso Northbound. Resposta: ${text.substring(0, 200)}`
    )
  }

  const data = await res.json()
  const plantas = data?.data?.list || []

  if (!Array.isArray(plantas) || plantas.length === 0) {
    console.log('[Huawei] Nenhuma planta encontrada')
    return 0
  }

  // Mapear para schema usinas
  const horaBrasilia = new Date().getUTCHours() - 3
  const dadosParaSalvar = plantas.map((planta: any) => {
    let status = 'online'
    const potenciaInstalada = planta.capacity || 0
    const potenciaAtual = planta.realTimePower || 0

    // Regra de Alerta: só após 14h; se produzir menos de 10% da capacidade (janela 11h–14h)
    if (horaBrasilia >= 14 && potenciaAtual < potenciaInstalada * 0.1) status = 'alerta'
    if (potenciaAtual === 0 && horaBrasilia >= 8 && horaBrasilia <= 18) status = 'offline'

    return {
      external_id: String(planta.plantCode || planta.id),
      nome_cliente: planta.plantName || 'Usina Huawei',
      potencia_kwp: potenciaInstalada,
      status: status,
      ...(status !== 'offline' && { ultima_atualizacao: new Date().toISOString() }),
    }
  })

  // Salvar no Supabase
  const { error } = await supabase
    .from('usinas')
    .upsert(dadosParaSalvar, { onConflict: 'external_id' })

  if (error) {
    throw new Error(`Erro ao salvar usinas Huawei: ${error.message}`)
  }

  return dadosParaSalvar.length
}