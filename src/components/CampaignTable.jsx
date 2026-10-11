import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { Button, Empty, Badge, number, date } from "@/components/app-ui";

export default function CampaignTable({ rows }) {
  if (!rows.length)
    return (
      <div className="panel">
        <Empty
          title="Your next issue starts here"
          description="Write something worth opening. Drafts and sent issues will appear here."
        >
          <Link to="/campaigns">
            <Button variant="secondary">
              Open campaigns <ArrowRight size={16} />
            </Button>
          </Link>
        </Empty>
      </div>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Status</th>
            <th>Sent</th>
            <th>Created</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link className="table-title" to={`/campaigns/${row.id}`}>
                  {row.subject || "Untitled issue"}
                </Link>
                <small>{row.newsletter_name}</small>
              </td>
              <td>
                <Badge status={row.status} />
              </td>
              <td>{number(row.sent)}</td>
              <td>{date(row.created_at)}</td>
              <td>
                <Link
                  aria-label={`Open ${row.subject || "Untitled issue"}`}
                  to={`/campaigns/${row.id}`}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
