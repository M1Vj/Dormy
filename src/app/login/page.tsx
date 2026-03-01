import Image from "next/image";

import { LoginForm } from "@/components/auth/LoginForm";

const accountTypes = ["Student Assistant", "Treasurer", "Adviser", "Occupant", "Admin"];

export default function LoginPage() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.15),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.14),transparent_45%)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(248,250,252,0.75),rgba(248,250,252,0.95))] dark:bg-[linear-gradient(to_bottom,rgba(15,23,42,0.55),rgba(15,23,42,0.85))]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl items-start px-4 py-8 sm:py-12 lg:items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_430px] lg:items-center">
          <section className="hidden lg:block">
            <div className="max-w-xl space-y-6">
              <h1 className="text-4xl font-semibold leading-tight tracking-tight">
                One workspace for dorm operations, finance, and daily coordination.
              </h1>
              <p className="text-base text-muted-foreground">
                Dormy centralizes occupants, fines, events, cleaning schedules, and evaluation workflows
                so each role can work from one system.
              </p>
              <div className="flex flex-wrap gap-2">
                {accountTypes.map((type) => (
                  <span
                    key={type}
                    className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-medium"
                  >
                    {type}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border/70 bg-card/95 p-5 shadow-sm backdrop-blur sm:p-7">
            <div className="flex justify-center">
              <h1 className="sr-only">Dormy</h1>
              <Image
                src="/brand/dormy-wordmark.png"
                alt="Dormy"
                width={300}
                height={90}
                className="h-14 w-auto dark:brightness-125"
                priority
              />
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Sign in to continue. New users can request dorm access after signing in.
            </p>
            <p className="mt-1 text-center text-xs text-muted-foreground/90">
              Accounts: Student Assistant, Treasurer, Adviser, Occupant, Admin
            </p>
            <div className="mt-6">
              <LoginForm />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
