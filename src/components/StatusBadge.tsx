import { cn } from '@/lib/utils';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { PlantStatus } from '@/types/plant';

interface StatusBadgeProps {
  status: PlantStatus;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, showIcon = true, size = 'md' }: StatusBadgeProps) {
  const config = {
    online: {
      label: 'Online',
      className: 'bg-success/20 text-success border-success/30 glow-success',
      icon: Wifi,
    },
    offline: {
      label: 'Offline',
      className: 'bg-destructive/20 text-destructive border-destructive/30 glow-destructive',
      icon: WifiOff,
    },
    alerta: {
      label: 'Alerta',
      className: 'bg-warning/20 text-warning border-warning/30 glow-warning animate-pulse-glow',
      icon: AlertTriangle,
    },
  };

  const { label, className, icon: Icon } = config[status];

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-3 py-1 text-sm gap-1.5',
  };

  return (
    <span className={cn(
      'inline-flex items-center font-medium rounded-full border',
      className,
      sizeStyles[size]
    )}>
      {showIcon && <Icon className={cn(size === 'sm' ? 'h-3 w-3' : 'h-4 w-4')} />}
      {label}
    </span>
  );
}
