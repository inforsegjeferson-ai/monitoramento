import { useMemo } from 'react';
import { Plant } from '@/types/plant';
import { generatePotenciaPorHora } from '@/data/mockPlants';

const WIDTH = 72;
const HEIGHT = 28;
const PAD = 2;

interface GenerationSparklineProps {
  plant: Plant;
  className?: string;
}

/** Mini gráfico de geração do dia (até o horário atual) para uma usina. */
export function GenerationSparkline({ plant, className }: GenerationSparklineProps) {
  const { pathD, areaD, maxVal } = useMemo(() => {
    const data = generatePotenciaPorHora(plant);
    const currentHour = new Date().getHours();
    const filtered = data.filter((p) => {
      const h = parseInt(p.hour.slice(0, 2), 10);
      return h <= currentHour;
    });
    if (filtered.length === 0) {
      return { pathD: '', areaD: '', maxVal: 0 };
    }
    const max = Math.max(1, ...filtered.map((d) => d.potencia_kw));
    const xScale = (WIDTH - PAD * 2) / Math.max(1, filtered.length - 1);
    const yScale = (HEIGHT - PAD * 2) / max;
    const points = filtered.map((d, i) => {
      const x = PAD + i * xScale;
      const y = HEIGHT - PAD - d.potencia_kw * yScale;
      return `${x},${y}`;
    });
    const pathD = `M ${points.join(' L ')}`;
    const areaD = `${pathD} L ${PAD + (filtered.length - 1) * xScale},${HEIGHT - PAD} L ${PAD},${HEIGHT - PAD} Z`;
    return { pathD, areaD, maxVal: max };
  }, [plant]);

  if (!pathD) {
    return (
      <div
        className={className}
        style={{ width: WIDTH, height: HEIGHT }}
        title="Sem dados no horário"
      >
        <span className="text-[10px] text-muted-foreground">—</span>
      </div>
    );
  }

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      className={className}
      title={`Geração hoje até agora (máx ${maxVal.toFixed(1)} kW)`}
      aria-hidden
    >
      <defs>
        <linearGradient id={`sparkline-fill-${plant.id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path
        d={areaD}
        fill={`url(#sparkline-fill-${plant.id})`}
      />
      <path
        d={pathD}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
