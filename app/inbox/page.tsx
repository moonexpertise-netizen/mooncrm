import { createClient } from "@/lib/supabase/server";
import InboxList, { type PendingResponse, type ClientOption } from "./inbox-list";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const sb = await createClient();

  const [{ data: responses }, { data: clients }] = await Promise.all([
    sb
      .from("tally_responses")
      .select("id, form_name, received_at, guess_denomination, guess_email, guess_siren, payload")
      .is("processed_at", null)
      .order("received_at", { ascending: false }),
    sb
      .from("clients")
      .select("id, denomination, siren, pipeline_statut")
      .order("denomination"),
  ]);

  const pending: PendingResponse[] = (responses ?? []) as unknown as PendingResponse[];
  const clientList: ClientOption[] = (clients ?? []) as ClientOption[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox Tally</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {pending.length} réponse{pending.length > 1 ? "s" : ""} en attente de rattachement.
        </p>
      </div>
      <InboxList responses={pending} clients={clientList} />
    </div>
  );
}
