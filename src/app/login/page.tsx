import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center">
          <h1 className="sr-only">Dormy</h1>
          <Image
            src="/brand/dormy-wordmark.png"
            alt="Dormy"
            width={280}
            height={82}
            className="h-12 w-auto dark:brightness-125"
            priority
          />
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Sign in (Student Assistant, Treasurer, Adviser, Occupant, Admin)
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
