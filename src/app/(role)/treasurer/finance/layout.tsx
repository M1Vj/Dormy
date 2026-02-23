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
    <div className="flex flex-col space-y-4 p-4 sm:space-y-6 sm:p-6 lg:p-8">
      <div className="flex flex-col space-y-2">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Finance</h2>
        <p className="text-muted-foreground">
          Manage contribution collections and dorm expense records.
        </p>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}
