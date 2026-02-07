import { rodarHuawei } from './robo_huawei.js';
import { rodarIntelbras } from './robo_intelbras.js';
import { rodarSaj } from './robo_saj.js';
import { rodarCanadian } from './robo_canadian.js';
import { rodarHyxi } from './robo_hyxipower.js';
import { rodarDeye } from './robo_deye.js';
//import { rodarSungrow } from './robo_sungrow.js';

const INTERVALO_MINUTOS = 1;
const INTERVALO_MS = INTERVALO_MINUTOS * 5 * 1000;

async function rodada() {
    console.log('📦 1/6: Coletando Huawei...');
    await rodarHuawei();

    console.log('📦 2/6: Coletando Intelbras...');
    await rodarIntelbras();

    console.log('📦 3/6: Coletando SAJ...');
    await rodarSaj();

    console.log('📦 4/6: Coletando Canadian...');
    await rodarCanadian();

    console.log('📦 5/6: Coletando HyxiPower...');
    await rodarHyxi();

    console.log('📦 6/6: Coletando Deye...');
    await rodarDeye();

    //console.log('📦 7/7: Coletando Sungrow...');
    //await rodarSungrow();

    console.log('✅ FIM DA RODADA - Todos os dados no Supabase!');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loopMaestro() {
    console.log('🚀 INICIANDO MAESTRO - MONITORAMENTO SOLAR (loop a cada ' + INTERVALO_MINUTOS + ' min)\n');

    let rodadaNum = 1;
    while (true) {
        const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' });
        console.log('\n🔄 RODADA ' + rodadaNum + ' — ' + hora + '\n');

        try {
            await rodada();
        } catch (err) {
            console.error('❌ Erro na rodada:', err.message);
            console.log('🔄 Continuando...');
        }

        console.log('\n⏰ Próxima rodada em ' + INTERVALO_MINUTOS + ' minutos...\n');
        await sleep(INTERVALO_MS);
        rodadaNum++;
    }
}

loopMaestro().catch((err) => {
    console.error('❌ Erro fatal no Maestro:', err);
    process.exit(1);
});
