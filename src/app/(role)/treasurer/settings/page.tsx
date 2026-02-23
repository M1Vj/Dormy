import { AccountSettings } from "@/components/account/account-settings";
import { SemesterOverrideToggle } from "@/components/finance/semester-override-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFinanceHistoricalEditOverride } from "@/app/actions/dorm";
import { getActiveDormId } from "@/lib/dorms";

export default async function SettingsPage() {
  const dormId = await getActiveDormId();
  const overrideResult = dormId ? await getFinanceHistoricalEditOverride(dormId) : null;
  const overrideEnabled = overrideResult && !("error" in overrideResult)
    ? overrideResult.enabled
    : false;

  return (
    <div className="space-y-6">
      <AccountSettings />

      {dormId ? (
        <Card>
          <CardHeader>
            <CardTitle>Semester Finance Override</CardTitle>
            <CardDescription>
              Control whether finance records from non-current semesters stay view-only or can be edited.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SemesterOverrideToggle dormId={dormId} initialState={overrideEnabled} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
