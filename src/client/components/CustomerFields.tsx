import { Field } from "@/client/components/Field";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";

export interface CustomerForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

export const EMPTY_CUSTOMER: CustomerForm = { name: "", email: "", phone: "", address: "", notes: "" };

export function CustomerFields({
  value,
  onChange,
}: {
  value: CustomerForm;
  onChange: (next: CustomerForm) => void;
}) {
  const set = (key: keyof CustomerForm) => (e: { target: { value: string } }) =>
    onChange({ ...value, [key]: e.target.value });
  return (
    <div className="space-y-4">
      <Field id="customer-name" label="Name">
        <Input id="customer-name" value={value.name} onChange={set("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="customer-email" label="Email">
          <Input id="customer-email" type="email" value={value.email} onChange={set("email")} />
        </Field>
        <Field id="customer-phone" label="Phone">
          <Input id="customer-phone" type="tel" value={value.phone} onChange={set("phone")} />
        </Field>
      </div>
      <Field id="customer-address" label="Address">
        <Textarea id="customer-address" rows={2} value={value.address} onChange={set("address")} />
      </Field>
      <Field id="customer-notes" label="Notes">
        <Textarea id="customer-notes" rows={3} value={value.notes} onChange={set("notes")} />
      </Field>
    </div>
  );
}
