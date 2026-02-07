import { cn } from '@/lib/utils';
import { Sun, Zap, Leaf, Battery, Cpu, Gauge, Power, Activity } from 'lucide-react';
import { PlantBrand } from '@/types/plant';

interface BrandIconProps {
  brand: PlantBrand;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function BrandIcon({ brand, size = 'md', showLabel = false }: BrandIconProps) {
  const brandConfig: Record<PlantBrand, { icon: typeof Sun; className: string }> = {
    'Huawei': { icon: Sun, className: 'text-red-500 bg-red-500/10' },
    'Deye': { icon: Zap, className: 'text-blue-500 bg-blue-500/10' },
    'Canadian': { icon: Leaf, className: 'text-green-500 bg-green-500/10' },
    'SolarMAN': { icon: Activity, className: 'text-amber-500 bg-amber-500/10' },
    'SAJ': { icon: Battery, className: 'text-orange-500 bg-orange-500/10' },
    'Intelbras': { icon: Cpu, className: 'text-blue-600 bg-blue-600/10' },
    'Sungrow': { icon: Gauge, className: 'text-purple-500 bg-purple-500/10' },
    'HYXIPOWER': { icon: Power, className: 'text-cyan-500 bg-cyan-500/10' },
    'Kehua': { icon: Activity, className: 'text-pink-500 bg-pink-500/10' },
  };

  const { icon: Icon, className } = brandConfig[brand];

  const sizeStyles = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={cn('rounded-lg', className, sizeStyles[size])}>
        <Icon className={iconSizes[size]} />
      </div>
      {showLabel && (
        <span className="text-sm font-medium">{brand}</span>
      )}
    </div>
  );
}
