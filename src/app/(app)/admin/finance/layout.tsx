import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Finance",
  description: "Manage finance ledgers",
}

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col space-y-6 p-8">
      <div className="flex flex-col space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Finance</h2>
        <p className="text-muted-foreground">
          Manage ledgers for Maintenance, Events, and Fines.
        </p>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}
