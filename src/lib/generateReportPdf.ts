import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Plant } from '@/types/plant';

export interface ReportStats {
  totalGeneration: number;
  totalPlants: number;
  offlinePlants: number;
  alertPlants: number;
}

const statusLabel: Record<string, string> = {
  online: 'Online',
  offline: 'Offline',
  alerta: 'Alerta',
};

export function generateReportPdf(plants: Plant[], stats: ReportStats): void {
  if (!plants.length) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 18;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('J Monitoramento – Relatório de Frota', 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date().toLocaleString('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  doc.text(`Emitido em ${dateStr}`, 14, y);
  y += 12;

  doc.setDrawColor(200, 200, 200);
  doc.line(14, y, pageW - 14, y);
  y += 10;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumo (KPIs)', 14, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const kpis = [
    [`Geração total`, `${(stats.totalGeneration / 1000).toFixed(1)} MW`],
    [`Usinas monitoradas`, stats.totalPlants.toLocaleString('pt-BR')],
    [`Usinas offline`, String(stats.offlinePlants)],
    [`Usinas em alerta (baixa eficiência)`, String(stats.alertPlants)],
  ];
  kpis.forEach(([label, value]) => {
    doc.text(`${label}: ${value}`, 14, y);
    y += 6;
  });
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Usinas', 14, y);
  y += 6;

  const rows = plants.map((p) => [
    p.nome_cliente,
    p.brand,
    statusLabel[p.status] ?? p.status,
    p.potencia_instalada_kwp > 0 ? p.potencia_instalada_kwp.toFixed(1) : '-',
    p.potencia_atual_kw.toFixed(2),
    `${p.efficiency.toFixed(1)}%`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Cliente', 'Marca', 'Status', 'Potência (kWp)', 'Produção (kW)', 'Eficiência']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185], fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 14, right: 14 },
    tableWidth: 'auto',
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(
      `J Monitoramento • ${plants.length} usinas • ${dateStr} • Página ${i}/${totalPages}`,
      14,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  const fileName = `relatorio-monitoramento-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
