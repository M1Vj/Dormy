import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "success" | "danger" | "warn";
}) {
  const colorMap = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    danger: "text-red-600 dark:text-red-400",
    warn: "text-amber-600 dark:text-amber-400",
  };

  return (
    <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-3xl tracking-tight font-bold ${colorMap[variant]}`}>{value}</div>
        {sublabel ? (
          <p className="text-xs font-medium text-muted-foreground mt-1">{sublabel}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
