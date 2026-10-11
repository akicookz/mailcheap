import { Link } from "react-router-dom";
import { Plus, ArrowRight } from "lucide-react";
import { useResource } from "@/hooks/use-resource";
import {
  Button,
  Heading,
  Loading,
  ErrorState,
  Stats,
  number,
} from "@/components/app-ui";

import CampaignTable from "@/components/CampaignTable";

export default function Overview() {
  const { data, error, loading, refresh } = useResource("admin/overview");
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} retry={refresh} />;
  return (
    <>
      <Heading
        title="Overview"
        description="Subscribers, campaigns, and recent activity."
      >
        <Button asChild>
          <Link to="/campaigns?new=1">
            <Plus size={16} /> New campaign
          </Link>
        </Button>
      </Heading>
      <Stats
        items={[
          ["Active subscribers", data.contacts.active],
          ["Emails sent", data.mail.sent],
          ["Opened", data.mail.opened, "Opens are estimates"],
          ["Clicked", data.mail.clicked],
        ]}
      />
      <div className="section-heading">
        <h2>Recent campaigns</h2>
        <Link to="/campaigns">
          View all <ArrowRight size={15} />
        </Link>
      </div>
      <CampaignTable rows={data.recent} />
      <section className="split-summary">
        <div className="panel">
          <h2>Subscriber activity</h2>
          <p>New signups over the last 30 days</p>
          {data.activity.length ? (
            <div
              className="activity-chart"
              aria-label="Daily subscriber signups"
            >
              {data.activity.map((d) => (
                <div key={d.day} title={`${d.day}: ${d.count}`}>
                  <span
                    style={{
                      height: Math.max(
                        6,
                        (d.count /
                          Math.max(...data.activity.map((x) => x.count))) *
                          100,
                      ),
                    }}
                  />
                  <small>{d.day.slice(5)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="subtle-empty">New subscribers will appear here.</p>
          )}
        </div>
        <div className="panel">
          <h2>Campaign status</h2>
          <div className="summary-row">
            <span>Drafts in progress</span>
            <strong>{number(data.campaigns.drafts)}</strong>
          </div>
          <div className="summary-row">
            <span>Scheduled issues</span>
            <strong>{number(data.campaigns.scheduled)}</strong>
          </div>
          <div className="summary-row">
            <span>Awaiting confirmation</span>
            <strong>{number(data.contacts.pending)}</strong>
          </div>
        </div>
      </section>
    </>
  );
}
