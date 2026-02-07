import { useCallback, useEffect, useMemo, useState } from 'react';
import { Zap, Activity, WifiOff, AlertTriangle, Sun, RefreshCw, CloudDownload, FileDown } from 'lucide-react';
import { KPICard } from '@/components/KPICard';
import { FleetTable } from '@/components/FleetTable';
import { PlantDetailsDrawer } from '@/components/PlantDetailsDrawer';
import { Plant, PlantBrand, PlantStatus } from '@/types/plant';
import { Button } from '@/components/ui/button';
import UserMenu from '@/components/UserMenu';
import { supabase } from '@/integrations/supabase/client';
import { generateReportPdf } from '@/lib/generateReportPdf';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

/** Média de horas de sol por dia usada no cálculo da eficiência (geração esperada = potência instalada × este valor) */
const HORAS_SOL_POR_DIA = 5;

const PLANT_BRANDS: PlantBrand[] = ['Huawei', 'Deye', 'Canadian', 'SolarMAN', 'SAJ', 'Intelbras', 'Sungrow', 'HYXIPOWER', 'Kehua'];
const STATUS_OPTIONS: { value: PlantStatus; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'alerta', label: 'Baixa eficiência' },
];

const Index = () => {
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loadingPlants, setLoadingPlants] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [statusFilters, setStatusFilters] = useState<PlantStatus[]>(['online', 'offline', 'alerta']);
  const [brandFilters, setBrandFilters] = useState<PlantBrand[]>(PLANT_BRANDS);

  const fetchPlants = useCallback(async () => {
    setLoadingPlants(true);
    try {
      const { data, error } = await supabase.from('usinas').select('*');
      if (error) throw error;

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayStartIso = todayStart.toISOString();

      const today11 = new Date(now);
      today11.setHours(11, 0, 0, 0);
      const today14 = new Date(now);
      today14.setHours(14, 0, 0, 0);
      const yesterdayStart = new Date(now);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      yesterdayStart.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setHours(23, 59, 59, 999);

      const [leiturasRes, leituras10_14Res, leiturasOntemRes] = await Promise.all([
        supabase
          .from('leituras_diarias')
          .select('usina_id, geracao_dia_kwh, data_hora')
          .gte('data_hora', todayStartIso)
          .order('data_hora', { ascending: false }),
        supabase
          .from('leituras_diarias')
          .select('usina_id, potencia_atual_kw')
          .gte('data_hora', today11.toISOString())
          .lte('data_hora', today14.toISOString()),
        supabase
          .from('leituras_diarias')
          .select('usina_id, geracao_dia_kwh, data_hora')
          .gte('data_hora', yesterdayStart.toISOString())
          .lte('data_hora', yesterdayEnd.toISOString())
          .order('data_hora', { ascending: false }),
      ]);

      const leituras = leiturasRes.data;
      const geracaoPorUsina = new Map<string, number>();
      if (leituras) {
        for (const row of leituras) {
          const usinaId = row.usina_id;
          if (usinaId != null && !geracaoPorUsina.has(usinaId) && row.geracao_dia_kwh != null) {
            geracaoPorUsina.set(usinaId, row.geracao_dia_kwh);
          }
        }
      }

      const avgPotencia11_14PorUsina = new Map<string, number>();
      if (leituras10_14Res.data) {
        const byUsina = new Map<string, number[]>();
        for (const row of leituras10_14Res.data) {
          if (row.usina_id == null || row.potencia_atual_kw == null) continue;
          const arr = byUsina.get(row.usina_id) ?? [];
          arr.push(row.potencia_atual_kw);
          byUsina.set(row.usina_id, arr);
        }
        byUsina.forEach((vals, usinaId) => {
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          avgPotencia11_14PorUsina.set(usinaId, Math.round(avg * 100) / 100);
        });
      }

      const geracaoOntemPorUsina = new Map<string, number>();
      if (leiturasOntemRes.data) {
        for (const row of leiturasOntemRes.data) {
          const usinaId = row.usina_id;
          if (usinaId != null && !geracaoOntemPorUsina.has(usinaId) && row.geracao_dia_kwh != null) {
            geracaoOntemPorUsina.set(usinaId, row.geracao_dia_kwh);
          }
        }
      }

      const mapped: Plant[] = (data ?? []).map((row) => {
        const potenciaAtualRaw = (row as any).potencia_atual_kw ?? null;
        const potenciaAtual = typeof potenciaAtualRaw === 'number' ? potenciaAtualRaw : 0;
        const potenciaInstaladaRaw = (row as any).potencia_kwp ?? (row as any).potencia_instalada_kwp ?? null;
        
        let potenciaInstalada = 0;
        if (potenciaInstaladaRaw !== null && potenciaInstaladaRaw !== undefined) {
          if (typeof potenciaInstaladaRaw === 'number') {
            potenciaInstalada = potenciaInstaladaRaw;
          } else if (typeof potenciaInstaladaRaw === 'string') {
            const parsed = parseFloat(potenciaInstaladaRaw);
            potenciaInstalada = isNaN(parsed) ? 0 : parsed;
          }
        }

        // Status vem do Supabase (usinas.status), calculado ao salvar pelos robos ou edge function.
        // Regra de alerta: horário de pico 10h–16h; eficiência < 20% (robos) ou < 10% (edge) → alerta.
        const statusRaw = (row.status ?? 'offline') as string;
        const status: PlantStatus =
          statusRaw === 'online' || statusRaw === 'offline' || statusRaw === 'alerta'
            ? statusRaw
            : statusRaw === 'alert'
              ? 'alerta'
              : 'offline';

        const brandRaw = ((row as any).marca ?? null) as unknown;
        const normalized = typeof brandRaw === 'string' ? brandRaw.trim() : '';
        const allowed = ['Huawei', 'Deye', 'Canadian', 'SolarMAN', 'SAJ', 'Intelbras', 'Sungrow', 'HYXIPOWER', 'Kehua'] as const;
        const match = allowed.find((b) => b.toLowerCase() === normalized.toLowerCase());
        const brand: PlantBrand = match ?? 'Huawei';

        const geracaoDaUsina = (row as any).geracao_dia_kwh;
        const geracaoDasLeituras = geracaoPorUsina.get(row.id);
        const geracao_dia_kwh = geracaoDaUsina != null ? geracaoDaUsina : geracaoDasLeituras ?? null;
        const avg_potencia_11_14 = avgPotencia11_14PorUsina.get(row.id) ?? null;
        const geracao_ontem_kwh = geracaoOntemPorUsina.get(row.id) ?? null;

        const esperadoDiaKwh = potenciaInstalada * HORAS_SOL_POR_DIA;
        const esperadoOntemKwh = potenciaInstalada * HORAS_SOL_POR_DIA;
        const currentHour = now.getHours();
        // Só após 14h: primeiro considera geração ontem; eficiência pela média 11h–14h se alerta OU não gerou esperado ontem
        const apos14h = currentHour >= 14;
        const ontemAbaixoDoEsperado = geracao_ontem_kwh != null && geracao_ontem_kwh < esperadoOntemKwh * 0.8;
        const usarEficienciaMedia11_14 =
          apos14h &&
          avg_potencia_11_14 != null &&
          potenciaInstalada > 0 &&
          (status === 'alerta' || ontemAbaixoDoEsperado);

        const efficiency = usarEficienciaMedia11_14
          ? Math.round((avg_potencia_11_14 / potenciaInstalada) * 100 * 10) / 10
          : esperadoDiaKwh > 0 && geracao_dia_kwh != null
            ? Math.round((geracao_dia_kwh / esperadoDiaKwh) * 100 * 10) / 10
            : potenciaInstalada > 0
              ? Math.round(((potenciaAtual / potenciaInstalada) * 100) * 10) / 10
              : 0;

        return {
          id: row.id,
          nome_cliente: row.nome_cliente ?? 'Sem cliente',
          brand,
          potencia_instalada_kwp: potenciaInstalada,
          potencia_atual_kw: potenciaAtual,
          geracao_dia_kwh,
          avg_potencia_11_14,
          geracao_ontem_kwh,
          status,
          efficiency,
          last_update: row.ultima_atualizacao ?? new Date().toISOString(),
          city: row.cidade ?? '',
          state: '',
          installation_date: new Date().toISOString().split('T')[0],
        };
      });

      setPlants(mapped);
    } finally {
      setLoadingPlants(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlants();
  }, [fetchPlants]);

  // Atualização automática a cada 5 minutos
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchPlants();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchPlants]);

  const stats = useMemo(() => {
    const totalGeneration = plants.reduce((acc, plant) => acc + plant.potencia_atual_kw, 0);
    const totalPlants = plants.length;
    const offlinePlants = plants.filter(p => p.status === 'offline').length;
    const alertPlants = plants.filter(p => p.status === 'alerta').length;
    return { totalGeneration, totalPlants, offlinePlants, alertPlants };
  }, [plants]);

  const filteredPlantsForPdf = useMemo(() => {
    return plants.filter(
      (p) =>
        (statusFilters.length === 0 || statusFilters.includes(p.status)) &&
        (brandFilters.length === 0 || brandFilters.includes(p.brand))
    );
  }, [plants, statusFilters, brandFilters]);

  const filteredStatsForPdf = useMemo(() => {
    const totalGeneration = filteredPlantsForPdf.reduce((acc, p) => acc + p.potencia_atual_kw, 0);
    const totalPlants = filteredPlantsForPdf.length;
    const offlinePlants = filteredPlantsForPdf.filter((p) => p.status === 'offline').length;
    const alertPlants = filteredPlantsForPdf.filter((p) => p.status === 'alerta').length;
    return { totalGeneration, totalPlants, offlinePlants, alertPlants };
  }, [filteredPlantsForPdf]);

  const toggleStatusFilter = useCallback((status: PlantStatus) => {
    setStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  }, []);

  const toggleBrandFilter = useCallback((brand: PlantBrand) => {
    setBrandFilters((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  }, []);

  const handleOpenPdfDialog = useCallback(() => {
    setPdfDialogOpen(true);
  }, []);

  const handleGeneratePdfWithFilters = useCallback(() => {
    generateReportPdf(filteredPlantsForPdf, filteredStatsForPdf);
    setPdfDialogOpen(false);
  }, [filteredPlantsForPdf, filteredStatsForPdf]);

  const syncNow = useCallback(async () => {
    setSyncingNow(true);
    try {
      const { error } = await supabase.functions.invoke('monitoramento-solar');
      if (error) throw error;
      await fetchPlants();
    } finally {
      setSyncingNow(false);
    }
  }, [fetchPlants]);

  const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const currentDate = new Date().toLocaleDateString('pt-BR', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-lg sticky top-0 z-40">
        <div className="container mx-auto px-4 lg:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 glow-primary">
                <Sun className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">J Monitoramento</h1>
                <p className="text-xs text-muted-foreground">Gestão de Operação e Manutenção</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{currentTime}</p>
                <p className="text-xs text-muted-foreground capitalize">{currentDate}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={handleOpenPdfDialog}
                disabled={loadingPlants || plants.length === 0}
              >
                <FileDown className="h-4 w-4" />
                <span className="hidden sm:inline">Gerar PDF</span>
              </Button>
              <Button
                size="sm"
                variant="default"
                className="gap-2"
                onClick={() => void syncNow()}
                disabled={syncingNow || loadingPlants}
              >
                <CloudDownload className="h-4 w-4" />
                <span className="hidden sm:inline">{syncingNow ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
              </Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => void fetchPlants()} disabled={loadingPlants}>
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">{loadingPlants ? 'Atualizando...' : 'Atualizar'}</span>
              </Button>
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 lg:px-6 py-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Geração Total"
            value={`${(stats.totalGeneration / 1000).toFixed(1)} MW`}
            subtitle="Produção acumulada hoje"
            icon={Zap}
            variant="default"
            trend={{ value: 5.2, isPositive: true }}
          />
          <KPICard
            title="Usinas Monitoradas"
            value={stats.totalPlants.toLocaleString('pt-BR')}
            subtitle="Total de plantas na frota"
            icon={Activity}
            variant="success"
          />
          <KPICard
            title="Usinas Offline"
            value={stats.offlinePlants}
            subtitle="Sem comunicação"
            icon={WifiOff}
            variant="destructive"
          />
          <KPICard
            title="Usinas em Alerta"
            value={stats.alertPlants}
            subtitle="Baixa eficiência detectada"
            icon={AlertTriangle}
            variant="warning"
          />
        </div>

        <div className="grid grid-cols-1 gap-6">
          <FleetTable plants={plants} onPlantSelect={(p) => { setSelectedPlant(p); setDrawerOpen(true); }} />
        </div>

        <footer className="text-center text-xs text-muted-foreground py-4">
          Sistema de Gestão O&M Solar • {new Date().getFullYear()} • Monitoramento em tempo real
        </footer>
      </main>

      <PlantDetailsDrawer
        plant={selectedPlant}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filtros do relatório PDF</DialogTitle>
            <DialogDescription>
              Selecione os status e marcas a incluir no relatório. Deixe todos marcados para incluir tudo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Status</Label>
              <div className="flex flex-wrap gap-4">
                {STATUS_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={statusFilters.includes(opt.value)}
                      onCheckedChange={() => toggleStatusFilter(opt.value)}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-medium">Marca</Label>
              <ScrollArea className="h-[180px] rounded-md border border-border p-3">
                <div className="flex flex-wrap gap-3">
                  {PLANT_BRANDS.map((brand) => (
                    <label
                      key={brand}
                      className="flex items-center gap-2 cursor-pointer min-w-[100px]"
                    >
                      <Checkbox
                        checked={brandFilters.includes(brand)}
                        onCheckedChange={() => toggleBrandFilter(brand)}
                      />
                      <span className="text-sm">{brand}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <p className="text-xs text-muted-foreground">
              {filteredPlantsForPdf.length} usina(s) serão incluídas no relatório.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPdfDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleGeneratePdfWithFilters}
              disabled={filteredPlantsForPdf.length === 0}
              className="gap-2"
            >
              <FileDown className="h-4 w-4" />
              Gerar relatório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;