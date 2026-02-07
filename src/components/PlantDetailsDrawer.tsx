import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Plant } from '@/types/plant';
import { PotenciaPorHora } from '@/types/plant';
import { StatusBadge } from './StatusBadge';
import { BrandIcon } from './BrandIcon';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { generatePotenciaPorHora } from '@/data/mockPlants';
import { MapPin, Calendar, Zap, Activity, Sun, Clock, TrendingUp, AlertTriangle, Star } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn, formatOfflineDuration } from '@/lib/utils';
import { useFavorites } from '@/hooks/useFavorites';

const HORAS_DIA = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const HORAS_SOL_POR_DIA = 5;

interface PlantDetailsDrawerProps {
  plant: Plant | null;
  open: boolean;
  onClose: () => void;
}

function getDateForOffset(offset: number): { start: string; end: string } {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  const start = d.toISOString();
  d.setHours(23, 59, 59, 999);
  const end = d.toISOString();
  return { start, end };
}

function getDayLabel(offset: number): string {
  if (offset === 0) return 'Hoje';
  if (offset === 1) return 'Ontem';
  return `D-${offset}`;
}

export function PlantDetailsDrawer({ plant, open, onClose }: PlantDetailsDrawerProps) {
  const [selectedDayOffset, setSelectedDayOffset] = useState<0 | 1 | 2 | 3>(0);
  const [historicoData, setHistoricoData] = useState<PotenciaPorHora[] | null>(null);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();

  const potenciaHoje = useMemo(() => (plant ? generatePotenciaPorHora(plant) : []), [plant]);

  useEffect(() => {
    setSelectedDayOffset(0);
    setHistoricoData(null);
  }, [plant?.id]);

  useEffect(() => {
    if (!plant || selectedDayOffset === 0) {
      setHistoricoData(null);
      return;
    }
    setHistoricoData(null);
    setLoadingHistorico(true);
    const { start, end } = getDateForOffset(selectedDayOffset);
    supabase
      .from('leituras_diarias')
      .select('data_hora, potencia_atual_kw')
      .eq('usina_id', plant.id)
      .gte('data_hora', start)
      .lte('data_hora', end)
      .order('data_hora', { ascending: true })
      .then(({ data, error }) => {
        setLoadingHistorico(false);
        if (error) {
          setHistoricoData([]);
          return;
        }
        const byHour = new Map<number, number>();
        for (const row of data ?? []) {
          if (row.data_hora == null || row.potencia_atual_kw == null) continue;
          const h = new Date(row.data_hora).getHours();
          byHour.set(h, row.potencia_atual_kw);
        }
        const chartData: PotenciaPorHora[] = HORAS_DIA.map((hourStr) => {
          const h = parseInt(hourStr.slice(0, 2), 10);
          const potencia_kw = byHour.get(h) ?? 0;
          return { hour: hourStr, potencia_kw: Math.round(potencia_kw * 100) / 100 };
        });
        setHistoricoData(chartData);
      });
  }, [plant?.id, selectedDayOffset]);

  const currentHour = new Date().getHours();
  const chartData =
    selectedDayOffset === 0
      ? potenciaHoje.filter((p) => {
          const h = parseInt(p.hour.slice(0, 2), 10);
          return h <= currentHour;
        })
      : historicoData ?? [];
  const chartDateLabel =
    selectedDayOffset === 0
      ? new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() - selectedDayOffset);
          return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
        })();

  if (!plant) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-lg bg-card border-border overflow-y-auto">
        <SheetHeader className="space-y-4 pb-6">
          <div className="flex items-center justify-between gap-2">
            <BrandIcon brand={plant.brand} size="lg" showLabel />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'shrink-0',
                  isFavorite(plant.id) ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500'
                )}
                onClick={() => toggleFavorite(plant.id)}
                title={isFavorite(plant.id) ? 'Remover dos favoritos' : 'Marcar como favorito'}
              >
                <Star className={cn('h-5 w-5', isFavorite(plant.id) && 'fill-current')} />
              </Button>
              <StatusBadge status={plant.status} />
            </div>
          </div>
          <div>
            <SheetTitle className="text-xl">{plant.nome_cliente}</SheetTitle>
            <SheetDescription className="flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" />
              {plant.city}, {plant.state}
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-secondary/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Sun className="h-4 w-4" />
                <span className="text-xs">Potência Instalada</span>
              </div>
              <p className="text-2xl font-bold">
                {plant.potencia_instalada_kwp > 0 ? (
                  <>
                    {plant.potencia_instalada_kwp.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">kWp</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">N/A</span>
                )}
              </p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Zap className="h-4 w-4" />
                <span className="text-xs">Produção Atual</span>
              </div>
              <p className="text-2xl font-bold">{plant.potencia_atual_kw.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">kW</span></p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Activity className="h-4 w-4" />
                <span className="text-xs">Eficiência</span>
              </div>
              <p className={`text-2xl font-bold ${plant.efficiency >= 70 ? 'text-success' : plant.efficiency >= 40 ? 'text-warning' : 'text-destructive'}`}>
                {plant.efficiency.toFixed(1)}<span className="text-sm font-normal">%</span>
              </p>
              {currentHour >= 14 &&
                plant.avg_potencia_11_14 != null &&
                (plant.status === 'alerta' ||
                  (plant.geracao_ontem_kwh != null &&
                    plant.potencia_instalada_kwp > 0 &&
                    plant.geracao_ontem_kwh < plant.potencia_instalada_kwp * HORAS_SOL_POR_DIA * 0.8)) && (
                <p className="text-xs text-muted-foreground mt-1">Média 11h–14h</p>
              )}
            </div>
            <div className="bg-secondary/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Calendar className="h-4 w-4" />
                <span className="text-xs">Data Instalação</span>
              </div>
              <p className="text-lg font-semibold">{new Date(plant.installation_date).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>

          {/* Geração ontem vs esperado */}
          {plant.potencia_instalada_kwp > 0 && (
            <div className="bg-secondary/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-medium">Geração ontem</span>
              </div>
              {plant.geracao_ontem_kwh != null ? (
                <>
                  <p className="text-lg font-semibold">
                    {plant.geracao_ontem_kwh.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      (esperado {(plant.potencia_instalada_kwp * HORAS_SOL_POR_DIA).toFixed(1)} kWh)
                    </span>
                  </p>
                  {plant.geracao_ontem_kwh < plant.potencia_instalada_kwp * HORAS_SOL_POR_DIA * 0.8 && (
                    <p className="flex items-center gap-1.5 text-sm text-warning mt-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Abaixo do esperado
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Sem dados de ontem</p>
              )}
            </div>
          )}

          {/* Potência por horário (hoje ou dias anteriores) */}
          <div className="bg-secondary/30 rounded-lg p-4">
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Potência por horário</h4>
                <span className="text-xs text-muted-foreground">{chartDateLabel}</span>
              </div>
              <div className="flex gap-1">
                {([0, 1, 2, 3] as const).map((offset) => (
                  <Button
                    key={offset}
                    size="sm"
                    variant={selectedDayOffset === offset ? 'default' : 'outline'}
                    className={cn('flex-1 text-xs', selectedDayOffset === offset && 'glow-primary')}
                    onClick={() => setSelectedDayOffset(offset)}
                  >
                    {getDayLabel(offset)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="h-[200px]">
              {selectedDayOffset > 0 && loadingHistorico ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Carregando dados do dia...
                </div>
              ) : chartData.length === 0 && selectedDayOffset > 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Sem dados para este dia
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="potenciaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis 
                    dataKey="hour" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickFormatter={(value) => `${value} kW`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`${value.toLocaleString('pt-BR')} kW`, 'Potência']}
                  />
                  <Area
                    type="monotone"
                    dataKey="potencia_kw"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#potenciaGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Last Update / Offline há */}
          <div className="text-center text-xs text-muted-foreground space-y-1">
            {plant.status === 'offline' ? (
              <p>
                <span className="font-medium text-destructive">Offline há {formatOfflineDuration(plant.last_update)}</span>
                <br />
                <span className="text-muted-foreground">Última vez online: {new Date(plant.last_update).toLocaleString('pt-BR')}</span>
              </p>
            ) : (
              <p>Última atualização: {new Date(plant.last_update).toLocaleString('pt-BR')}</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
