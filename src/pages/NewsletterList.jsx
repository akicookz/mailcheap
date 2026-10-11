import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ArrowUpRight, Mail } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useResource } from "@/hooks/use-resource";
import {
  Button,
  Heading,
  Empty,
  Loading,
  ErrorState,
  Modal,
  number,
} from "@/components/app-ui";

import NewsletterFields, {
  blankNewsletter,
} from "@/components/NewsletterFields";

export default function NewsletterList() {
  const resource = useResource("admin/newsletters");
  const [open, setOpen] = useState(false),
    [values, setValues] = useState(blankNewsletter),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <Heading title="Newsletters" description="A home for every conversation.">
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> New newsletter
        </Button>
      </Heading>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.refresh} />
      ) : resource.data.length ? (
        <div className="newsletter-list">
          {resource.data.map((n) => (
            <Link
              className="newsletter-card"
              key={n.id}
              to={`/newsletters/${n.id}`}
            >
              <div className="newsletter-icon">
                <Mail size={23} />
              </div>
              <div>
                <h2>{n.name}</h2>
                <p>{n.description || n.from_email}</p>
                <small>{number(n.active_count)} active subscribers</small>
              </div>
              <ArrowUpRight size={19} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            title="Make room for your readers"
            description="Create your first newsletter. Each one has its own subscribers, sender, and public archive."
          >
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> Create newsletter
            </Button>
          </Empty>
        </div>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        wide
        title="Create a newsletter"
        description="The basics your readers will see."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const result = await api("admin/newsletters", {
                method: "POST",
                body: values,
              });
              navigate(`/newsletters/${result.id}`);
            } catch (e) {
              toast.error(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <NewsletterFields values={values} setValues={setValues} />
          <Button disabled={busy} type="submit">
            Create newsletter
          </Button>
        </form>
      </Modal>
    </>
  );
}
