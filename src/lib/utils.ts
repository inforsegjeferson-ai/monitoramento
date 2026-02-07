import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Retorna "Offline há X" a partir da data da última atualização (quando status é offline). */
export function formatOfflineDuration(lastUpdateIso: string): string {
  const last = new Date(lastUpdateIso).getTime();
  const now = Date.now();
  const diffMs = now - last;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffD > 0) return `${diffD} dia${diffD > 1 ? 's' : ''}`;
  if (diffH > 0) return `${diffH}h ${diffMin % 60}min`;
  if (diffMin > 0) return `${diffMin} min`;
  return 'agora';
}
