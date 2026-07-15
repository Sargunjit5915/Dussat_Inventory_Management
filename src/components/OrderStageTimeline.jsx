// src/components/OrderStageTimeline.jsx — shared order-lifecycle stage indicator
// Used by both the user's order page and the admin order pages so everyone
// sees the same stage labels/ordering.

import { ORDER_STAGES, STAGE_BY_VALUE, normalizeStatus } from "../firebase/firestoreService";

const MAIN_LINE = ORDER_STAGES.filter((s) => s.order >= 0).sort((a, b) => a.order - b.order);

export default function OrderStageTimeline({ status, variant = "badge" }) {
  const stage = STAGE_BY_VALUE[normalizeStatus(status)] || STAGE_BY_VALUE.draft;

  if (variant === "badge") {
    return <span className={`badge ${stage.cls}`}>{stage.label}</span>;
  }

  if (stage.value === "rejected") {
    return (
      <div className="stage-timeline stage-timeline--rejected">
        <span className="badge badge--faulty">Rejected</span>
      </div>
    );
  }

  return (
    <div className="stage-timeline">
      {MAIN_LINE.map((s) => {
        const state = s.order < stage.order ? "done" : s.order === stage.order ? "active" : "upcoming";
        return (
          <div key={s.value} className={`stage-step stage-step--${state}`}>
            <span className="stage-step-dot">{state === "done" ? "✓" : ""}</span>
            <span className="stage-step-label">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
