import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  redirect("/admin/home");
  return <div className="hidden" aria-hidden="true" />;
}
