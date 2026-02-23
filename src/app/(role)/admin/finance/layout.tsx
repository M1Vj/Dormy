import { redirect } from "next/navigation";

export default function AdminFinanceLayout({ children }: { children: React.ReactNode }) {
  redirect("/admin/home");
  return children;
}
