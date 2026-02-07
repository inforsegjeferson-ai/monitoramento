import { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plant, PlantBrand, PlantStatus } from '@/types/plant';
import { StatusBadge } from './StatusBadge';
import { BrandIcon } from './BrandIcon';
import { GenerationSparkline } from './GenerationSparkline';
import { Search, Filter, X, ChevronDown, ChevronUp, ArrowUpDown, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatOfflineDuration } from '@/lib/utils';
import { useFavorites } from '@/hooks/useFavorites';

interface FleetTableProps {
  plants: Plant[];
  onPlantSelect: (plant: Plant) => void;
}

const brands: PlantBrand[] = ['Huawei', 'Deye', 'Canadian', 'SolarMAN', 'SAJ', 'Intelbras', 'Sungrow', 'HYXIPOWER', 'Kehua'];
const statuses: { value: PlantStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'online', label: 'Online' },
  { value: 'alerta', label: 'Alertas' },
  { value: 'offline', label: 'Offline' },
];

type SortKey = 'status' | 'cliente' | 'marca' | 'potencia' | 'producao' | 'geracao_dia' | 'efficiency';
const STATUS_ORDER: Record<PlantStatus, number> = { online: 0, alerta: 1, offline: 2 };

export function FleetTable({ plants, onPlantSelect }: FleetTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<PlantBrand | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<PlantStatus | 'all'>('all');
  const [showBrandFilter, setShowBrandFilter] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const { isFavorite, toggleFavorite } = useFavorites();

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const filteredPlants = useMemo(() => {
    const filtered = plants.filter(plant => {
      const matchesSearch = plant.nome_cliente.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesBrand = !selectedBrand || plant.brand === selectedBrand;
      const matchesStatus = selectedStatus === 'all' || plant.status === selectedStatus;
      return matchesSearch && matchesBrand && matchesStatus;
    });
    // Favoritos primeiro
    let result = [...filtered].sort((a, b) => {
      const aFav = isFavorite(a.id);
      const bFav = isFavorite(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return 0;
    });

    if (sortBy) {
      const mult = sortDir === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (sortBy) {
          case 'status':
            cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
            break;
          case 'cliente':
            cmp = a.nome_cliente.localeCompare(b.nome_cliente, 'pt-BR');
            break;
          case 'marca':
            cmp = a.brand.localeCompare(b.brand, 'pt-BR');
            break;
          case 'potencia':
            cmp = a.potencia_instalada_kwp - b.potencia_instalada_kwp;
            break;
          case 'producao':
            cmp = a.potencia_atual_kw - b.potencia_atual_kw;
            break;
          case 'geracao_dia': {
            const ga = a.geracao_dia_kwh ?? -1;
            const gb = b.geracao_dia_kwh ?? -1;
            cmp = ga - gb;
            break;
          }
          case 'efficiency':
            cmp = a.efficiency - b.efficiency;
            break;
          default:
            return 0;
        }
        return mult * (cmp || 0);
      });
    }
    return result;
  }, [plants, searchQuery, selectedBrand, selectedStatus, isFavorite, sortBy, sortDir]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedBrand(null);
    setSelectedStatus('all');
  };

  const hasActiveFilters = searchQuery || selectedBrand || selectedStatus !== 'all';

  return (
    <div className="glass-card rounded-xl p-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold">Gestão de Frota</h3>
          <p className="text-sm text-muted-foreground">
            {filteredPlants.length} de {plants.length} usinas
          </p>
        </div>

        {/* Search */}
        <div className="relative flex-1 lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary/50 border-border"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Status Filters */}
        {statuses.map((status) => (
          <Button
            key={status.value}
            size="sm"
            variant={selectedStatus === status.value ? 'default' : 'outline'}
            onClick={() => setSelectedStatus(status.value)}
            className={cn(
              'transition-all',
              selectedStatus === status.value && 'glow-primary'
            )}
          >
            {status.label}
          </Button>
        ))}

        {/* Brand Filter Dropdown */}
        <div className="relative">
          <Button
            size="sm"
            variant={selectedBrand ? 'default' : 'outline'}
            onClick={() => setShowBrandFilter(!showBrandFilter)}
            className="gap-2"
          >
            <Filter className="h-3 w-3" />
            {selectedBrand || 'Marca'}
            <ChevronDown className={cn('h-3 w-3 transition-transform', showBrandFilter && 'rotate-180')} />
          </Button>

          {showBrandFilter && (
            <div className="absolute top-full left-0 mt-2 z-50 bg-popover border border-border rounded-lg shadow-xl p-2 min-w-[160px]">
              <button
                onClick={() => { setSelectedBrand(null); setShowBrandFilter(false); }}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors',
                  !selectedBrand && 'bg-accent'
                )}
              >
                Todas as Marcas
              </button>
              {brands.map((brand) => (
                <button
                  key={brand}
                  onClick={() => { setSelectedBrand(brand); setShowBrandFilter(false); }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors flex items-center gap-2',
                    selectedBrand === brand && 'bg-accent'
                  )}
                >
                  <BrandIcon brand={brand} size="sm" />
                  {brand}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button size="sm" variant="ghost" onClick={clearFilters} className="gap-1 text-muted-foreground">
            <X className="h-3 w-3" />
            Limpar
          </Button>
        )}
      </div>

      {/* Table: overflow-auto para rolagem vertical e horizontal e evitar coluna Eficiência cortada */}
      <div className="h-[500px] overflow-auto rounded-lg border border-border">
        <Table className="min-w-[1000px] w-full">
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-[44px] px-2" title="Favorito" />
              <TableHead className="w-[100px] whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('status')}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  Status
                  {sortBy === 'status' ? (sortDir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : <ArrowUpDown className="h-3.5 w-3 opacity-50" />}
                </button>
              </TableHead>
              <TableHead className="w-[80px] whitespace-nowrap text-center">Geração</TableHead>
              <TableHead className="min-w-[140px]">
                <button
                  type="button"
                  onClick={() => handleSort('cliente')}
                  className="flex items-center gap-1 hover:text-foreground transition-colors text-left"
                >
                  Cliente
                  {sortBy === 'cliente' ? (sortDir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : <ArrowUpDown className="h-3.5 w-3 opacity-50" />}
                </button>
              </TableHead>
              <TableHead className="w-[120px] whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('marca')}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  Marca
                  {sortBy === 'marca' ? (sortDir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : <ArrowUpDown className="h-3.5 w-3 opacity-50" />}
                </button>
              </TableHead>
              <TableHead className="text-right w-[110px] whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('potencia')}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
                >
                  Potência (kWp)
                  {sortBy === 'potencia' ? (sortDir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : <ArrowUpDown className="h-3.5 w-3 opacity-50" />}
                </button>
              </TableHead>
              <TableHead className="text-right w-[110px] whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('producao')}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
                >
                  Produção (kW)
                  {sortBy === 'producao' ? (sortDir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : <ArrowUpDown className="h-3.5 w-3 opacity-50" />}
                </button>
              </TableHead>
              <TableHead className="text-right w-[130px] whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('geracao_dia')}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
                >
                  Geração do dia (kWh)
                  {sortBy === 'geracao_dia' ? (sortDir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : <ArrowUpDown className="h-3.5 w-3 opacity-50" />}
                </button>
              </TableHead>
              <TableHead className="text-right w-[100px] whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort('efficiency')}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
                >
                  Eficiência
                  {sortBy === 'efficiency' ? (sortDir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : <ArrowUpDown className="h-3.5 w-3 opacity-50" />}
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPlants.slice(0, 100).map((plant) => (
              <TableRow
                key={plant.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors border-border"
                onClick={() => onPlantSelect(plant)}
              >
                <TableCell className="w-[44px] px-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(plant.id)}
                    className={cn(
                      'p-1.5 rounded-md transition-colors hover:bg-accent',
                      isFavorite(plant.id) ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500'
                    )}
                    title={isFavorite(plant.id) ? 'Remover dos favoritos' : 'Marcar como favorito'}
                  >
                    <Star
                      className={cn('h-4 w-4', isFavorite(plant.id) && 'fill-current')}
                    />
                  </button>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="flex flex-col gap-0.5">
                    <StatusBadge status={plant.status} size="sm" />
                    {plant.status === 'offline' && (
                      <span className="text-xs text-muted-foreground" title={`Última atualização: ${new Date(plant.last_update).toLocaleString('pt-BR')}`}>
                        Offline há {formatOfflineDuration(plant.last_update)}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-1 align-middle">
                  <GenerationSparkline plant={plant} />
                </TableCell>
                <TableCell className="font-medium min-w-[140px]">{plant.nome_cliente}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <BrandIcon brand={plant.brand} size="sm" showLabel />
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {plant.potencia_instalada_kwp > 0 
                    ? plant.potencia_instalada_kwp.toFixed(1) 
                    : '-'}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {plant.potencia_atual_kw.toFixed(2)}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {plant.geracao_dia_kwh != null
                    ? plant.geracao_dia_kwh.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '-'}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <span className={cn(
                    'font-semibold tabular-nums',
                    plant.efficiency >= 70 ? 'text-success' : 
                    plant.efficiency >= 40 ? 'text-warning' : 'text-destructive'
                  )}>
                    {plant.efficiency.toFixed(1)}%
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredPlants.length > 100 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            Mostrando 100 de {filteredPlants.length} resultados
          </div>
        )}
      </div>
    </div>
  );
}
