import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { Shell } from "@/client/components/Shell";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Textarea } from "@/client/components/ui/textarea";
import { useAction } from "@/client/lib/useAction";
import { getSettings, saveSettings } from "@/serverFunctions/settings";

export const Route = createFileRoute("/settings")({
  loader: () => getSettings(),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, admin } = Route.useLoaderData();
  const [form, setForm] = useState({
    shopName: settings.shopName,
    currency: settings.currency,
    bookingMode: settings.bookingMode,
    minNoticeHours: String(settings.minNoticeHours),
    contractTerms: settings.contractTerms,
    invoiceDueDays: String(settings.invoiceDueDays),
  });
  const { run, error, pending } = useAction();
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(
      () =>
        saveSettings({
          data: {
            ...form,
            bookingMode: form.bookingMode,
            minNoticeHours: Number(form.minNoticeHours),
            invoiceDueDays: Number(form.invoiceDueDays),
          },
        }),
      "Settings saved",
    );
  }

  return (
    <Shell>
      <PageHeader
        title="Settings"
        description={admin ? undefined : "Only admins can change these."}
      />
      <form onSubmit={submit} className="space-y-8">
        <fieldset disabled={!admin} className="space-y-4">
          <h2 className="text-sm font-medium">Booking page</h2>
          <Field id="shop-name" label="Shop name">
            <Input id="shop-name" value={form.shopName} onChange={(e) => set("shopName")(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="currency" label="Currency">
              <Input id="currency" value={form.currency} maxLength={3} onChange={(e) => set("currency")(e.target.value)} />
            </Field>
            <Field id="booking-mode" label="New bookings">
              <NativeSelect
                id="booking-mode"
                className="w-full"
                value={form.bookingMode}
                onChange={(e) => set("bookingMode")(e.target.value)}
              >
                <NativeSelectOption value="instant">Reserve right away</NativeSelectOption>
                <NativeSelectOption value="request">Wait for approval</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field id="min-notice" label="Minimum notice (hours)">
              <Input
                id="min-notice"
                type="number"
                min={0}
                value={form.minNoticeHours}
                onChange={(e) => set("minNoticeHours")(e.target.value)}
              />
            </Field>
          </div>
          <a href="/shop" target="_blank" rel="noreferrer" className="inline-block text-sm text-primary hover:underline">
            Open the booking page
          </a>
        </fieldset>
        <fieldset disabled={!admin} className="space-y-4">
          <h2 className="text-sm font-medium">Documents</h2>
          <Field id="due-days" label="Invoice due after (days)" className="max-w-48">
            <Input
              id="due-days"
              type="number"
              min={0}
              value={form.invoiceDueDays}
              onChange={(e) => set("invoiceDueDays")(e.target.value)}
            />
          </Field>
          <Field id="terms" label="Contract terms">
            <Textarea id="terms" rows={8} value={form.contractTerms} onChange={(e) => set("contractTerms")(e.target.value)} />
          </Field>
        </fieldset>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {admin ? (
          <Button type="submit" disabled={pending}>
            Save settings
          </Button>
        ) : null}
      </form>
    </Shell>
  );
}
