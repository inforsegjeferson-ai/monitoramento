import { Plant, PlantBrand, GenerationData, BrandStats, PotenciaPorHora } from '@/types/plant';

const brands: PlantBrand[] = ['Huawei', 'Deye', 'Canadian', 'SolarMAN', 'SAJ', 'Intelbras', 'Sungrow', 'HYXIPOWER', 'Kehua'];

const cities = [
  { city: 'São Paulo', state: 'SP' },
  { city: 'Rio de Janeiro', state: 'RJ' },
  { city: 'Belo Horizonte', state: 'MG' },
  { city: 'Curitiba', state: 'PR' },
  { city: 'Porto Alegre', state: 'RS' },
  { city: 'Salvador', state: 'BA' },
  { city: 'Fortaleza', state: 'CE' },
  { city: 'Brasília', state: 'DF' },
  { city: 'Recife', state: 'PE' },
  { city: 'Manaus', state: 'AM' },
  { city: 'Goiânia', state: 'GO' },
  { city: 'Campinas', state: 'SP' },
  { city: 'Uberlândia', state: 'MG' },
  { city: 'Ribeirão Preto', state: 'SP' },
  { city: 'Joinville', state: 'SC' },
];

const clientNames = [
  'Residência Silva', 'Comércio Santos', 'Fazenda Solar', 'Indústria Renovável',
  'Supermercado Verde', 'Hotel Sustentável', 'Escola Energia', 'Hospital Luz',
  'Shopping Center', 'Condomínio Sol', 'Empresa Tech', 'Restaurante Eco',
  'Academia Fit', 'Padaria Modelo', 'Farmácia Popular', 'Posto Combustível',
  'Loja Material', 'Oficina Mecânica', 'Clínica Médica', 'Escritório Adv',
];

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function generateRandomNumber(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function calculateStatus(potenciaAtual: number, potenciaInstalada: number): { status: 'online' | 'offline' | 'alerta', efficiency: number } {
  const currentHour = new Date().getHours();
  const isDaytime = currentHour >= 10 && currentHour <= 16;
  const efficiency = potenciaInstalada > 0 ? (potenciaAtual / potenciaInstalada) * 100 : 0;
  
  if (potenciaAtual === 0 && isDaytime) {
    return { status: 'offline', efficiency: 0 };
  }
  
  if (isDaytime && efficiency < 20) {
    return { status: 'alerta', efficiency };
  }
  
  return { status: 'online', efficiency };
}

export function generateMockPlants(count: number = 800): Plant[] {
  const plants: Plant[] = [];
  
  for (let i = 0; i < count; i++) {
    const potenciaInstalada = generateRandomNumber(3, 150);
    const location = getRandomElement(cities);
    
    // Simulate different scenarios
    const randomScenario = Math.random();
    let potenciaAtual: number;
    
    if (randomScenario < 0.05) {
      // 5% offline
      potenciaAtual = 0;
    } else if (randomScenario < 0.15) {
      // 10% low efficiency
      potenciaAtual = potenciaInstalada * generateRandomNumber(0.05, 0.18);
    } else {
      // 85% normal operation
      potenciaAtual = potenciaInstalada * generateRandomNumber(0.4, 0.95);
    }
    
    const { status, efficiency } = calculateStatus(potenciaAtual, potenciaInstalada);
    
    plants.push({
      id: `plant-${i + 1}`,
      nome_cliente: `${getRandomElement(clientNames)} ${i + 1}`,
      brand: getRandomElement(brands),
      potencia_instalada_kwp: potenciaInstalada,
      potencia_atual_kw: Math.round(potenciaAtual * 100) / 100,
      status,
      efficiency: Math.round(efficiency * 10) / 10,
      last_update: new Date(Date.now() - Math.random() * 3600000).toISOString(),
      city: location.city,
      state: location.state,
      installation_date: new Date(Date.now() - Math.random() * 365 * 24 * 3600000 * 3).toISOString().split('T')[0],
    });
  }
  
  return plants;
}

export function generateDailyGenerationCurve(): GenerationData[] {
  const data: GenerationData[] = [];
  const hours = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
  
  // Simulate a bell curve for solar generation
  const baseValues = [5, 20, 45, 70, 85, 95, 100, 98, 90, 75, 50, 25, 8];
  
  hours.forEach((hour, index) => {
    const variation = (Math.random() - 0.5) * 15;
    data.push({
      hour,
      generation: Math.max(0, Math.round(baseValues[index] + variation)),
    });
  });
  
  return data;
}

/** Curva de potência atual (kW) por horário para uma usina. No horário atual usa a potência real. */
export function generatePotenciaPorHora(plant: Plant): PotenciaPorHora[] {
  const hours = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
  const hourIndices: number[] = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const basePercent = [5, 20, 45, 70, 85, 95, 100, 98, 90, 75, 50, 25, 8];
  const currentHour = new Date().getHours();

  return hours.map((hour, index) => {
    const h = hourIndices[index];
    const isCurrentHour = h === currentHour;
    const potencia_kw = isCurrentHour
      ? plant.potencia_atual_kw
      : (basePercent[index] / 100) * plant.potencia_instalada_kwp;
    return { hour, potencia_kw: Math.round(potencia_kw * 100) / 100 };
  });
}

export function calculateBrandStats(plants: Plant[]): BrandStats[] {
  const brandColors: Record<PlantBrand, string> = {
    'Huawei': 'hsl(0, 100%, 50%)',
    'Deye': 'hsl(210, 100%, 50%)',
    'Canadian': 'hsl(120, 60%, 45%)',
    'SolarMAN': 'hsl(38, 92%, 50%)',
    'SAJ': 'hsl(35, 100%, 50%)',
    'Intelbras': 'hsl(210, 100%, 40%)',
    'Sungrow': 'hsl(270, 60%, 50%)',
    'HYXIPOWER': 'hsl(180, 70%, 45%)',
    'Kehua': 'hsl(340, 80%, 50%)',
  };
  
  const stats: Record<PlantBrand, { total: number; count: number }> = {} as any;
  
  brands.forEach(brand => {
    stats[brand] = { total: 0, count: 0 };
  });
  
  plants.forEach(plant => {
    stats[plant.brand].total += plant.potencia_atual_kw;
    stats[plant.brand].count += 1;
  });
  
  return brands.map(brand => ({
    brand,
    total_generation: Math.round(stats[brand].total * 100) / 100,
    plant_count: stats[brand].count,
    color: brandColors[brand],
  }));
}

export const mockPlants = generateMockPlants(800);
