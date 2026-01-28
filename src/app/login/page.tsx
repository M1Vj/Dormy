import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Dormy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sign in (Student Assistant, Treasurer, Adviser, Occupant, Admin)
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
