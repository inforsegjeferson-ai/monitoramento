export type PlantBrand = 
  | 'Huawei' 
  | 'Deye' 
  | 'Canadian' 
  | 'SolarMAN'
  | 'SAJ' 
  | 'Intelbras' 
  | 'Sungrow' 
  | 'HYXIPOWER' 
  | 'Kehua';

export type PlantStatus = 'online' | 'offline' | 'alerta';

export interface Plant {
  id: string;
  nome_cliente: string;
  brand: PlantBrand;
  potencia_instalada_kwp: number;
  potencia_atual_kw: number;
  /** Geração do dia em kWh (tabela leituras_diarias.geracao_dia_kwh) */
  geracao_dia_kwh?: number | null;
  /** Média da potência entre 11h e 14h (leituras_diarias) para eficiência no pico; considerada só após 14h */
  avg_potencia_11_14?: number | null;
  /** Geração total do dia anterior (última leitura de ontem) em kWh */
  geracao_ontem_kwh?: number | null;
  status: PlantStatus;
  efficiency: number;
  last_update: string;
  city: string;
  state: string;
  installation_date: string;
}

export interface GenerationData {
  hour: string;
  generation: number;
}

/** Potência atual (kW) por horário para o gráfico do dia */
export interface PotenciaPorHora {
  hour: string;
  potencia_kw: number;
}

export interface BrandStats {
  brand: PlantBrand;
  total_generation: number;
  plant_count: number;
  color: string;
}
