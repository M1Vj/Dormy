import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export default function OAuthConsentPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md shadow-lg border-primary/10">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4 text-primary">
            <CheckCircle2 className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl font-bold">Account Linked</CardTitle>
          <CardDescription>
            Your Google account has been successfully authorized.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            You can now use Google to sign in to Dormy. You are being redirected to your dashboard.
          </p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button asChild className="w-full">
            <Link href="/occupant/home">Continue to App</Link>
          </Button>
        </CardFooter>
      </Card>
      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(() => { window.location.href = '/home'; }, 3000);`,
        }}
      />
    </div>
  );
}
