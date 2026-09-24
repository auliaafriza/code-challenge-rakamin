interface LegendItem {
  name: string;
  color: string;
}

export default function ChartLegend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          {item.name}
        </li>
      ))}
    </ul>
  );
}
