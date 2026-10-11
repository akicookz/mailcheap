import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useResource } from "@/hooks/use-resource";
import {
  Button,
  Input,
  Field,
  Select,
  Heading,
  Empty,
  Loading,
  ErrorState,
  Modal,
} from "@/components/app-ui";

import CampaignTable from "@/components/CampaignTable";

export default function CampaignList() {
  const resource = useResource("admin/campaigns"),
    lists = useResource("admin/newsletters");
  const [open, setOpen] = useState(false),
    [list, setList] = useState(""),
    [subject, setSubject] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <Heading
        title="Campaigns"
        description="From the first draft to the last inbox."
      >
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> New campaign
        </Button>
      </Heading>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.refresh} />
      ) : (
        <CampaignTable
          rows={resource.data.filter((x) => x.status !== "canceled")}
        />
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Start a new issue"
        description="Choose a newsletter and give your draft a subject."
      >
        {lists.data?.length ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const draft = await api("admin/campaigns", {
                  method: "POST",
                  body: { newsletter_id: list || lists.data[0].id, subject },
                });
                navigate(`/campaigns/${draft.id}`);
              } catch (e) {
                toast.error(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Newsletter">
              <Select
                value={list || lists.data[0].id}
                onChange={(e) => setList(e.target.value)}
              >
                {lists.data.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subject">
              <Input
                autoFocus
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What’s on your mind?"
              />
            </Field>
            <Button type="submit" disabled={busy}>
              Create draft <ArrowRight size={16} />
            </Button>
          </form>
        ) : (
          <Empty
            title="Create a newsletter first"
            description="Give your newsletter a name and a sender address."
          >
            <Link to="/newsletters">
              <Button>Create newsletter</Button>
            </Link>
          </Empty>
        )}
      </Modal>
    </>
  );
}
