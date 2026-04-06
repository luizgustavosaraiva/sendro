import type { DashboardCompanyViewModel } from "../../../lib/trpc";

const escapeHtml = (value: string | number | boolean | null | undefined) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString();
};

const statusCopy: Record<string, string> = {
  created: "Criada",
  queued: "Na fila",
  offered: "Ofertada",
  assigned: "Atribuída",
  accepted: "Aceita",
  picked_up: "Coletada",
  in_transit: "Em trânsito",
  delivered: "Entregue",
  cancelled: "Cancelada",
  failed_attempt: "Tentativa falhou"
};

const waitingReasonCopy: Record<string, string> = {
  max_private_attempts_reached: "Máximo de tentativas privadas atingido",
  no_candidates_available: "Nenhum entregador elegível disponível"
};

const strikeConsequenceCopy: Record<string, string> = {
  warning: "Advertência",
  bond_suspended: "Vínculo suspenso",
  bond_revoked: "Vínculo revogado"
};

const bondStatusCopy: Record<string, string> = {
  active: "Ativo",
  suspended: "Suspenso",
  revoked: "Revogado"
};

const operationalStateCopy: Record<string, string> = {
  available: "Disponível",
  offered: "Com oferta pendente",
  busy: "Em entrega ativa",
  suspended: "Suspenso",
  revoked: "Revogado",
  pending_bond: "Vínculo pendente"
};

const transitionOptions = [
  { value: "assigned", label: "Atribuir" },
  { value: "picked_up", label: "Coletar" },
  { value: "in_transit", label: "Marcar em trânsito" }
] as const;

const isProofCompletable = (status: string) => ["accepted", "picked_up", "in_transit"].includes(status);

const renderProof = (proof: {
  deliveredAt: string;
  note: string | null;
  photoUrl: string | null;
  submittedByActorType: string;
  submittedByActorId: string | null;
  policy: { requireNote: boolean; requirePhoto: boolean };
} | null) => {
  if (!proof) {
    return '<p data-testid="delivery-proof-empty">Nenhuma prova de entrega registrada.</p>';
  }

  return `<div class="delivery-proof" data-testid="delivery-proof">
    <div>deliveredAt: <code data-testid="delivery-proof-delivered-at">${escapeHtml(formatDate(proof.deliveredAt))}</code></div>
    <div>submittedBy: <code data-testid="delivery-proof-submitted-by">${escapeHtml(proof.submittedByActorType)}</code></div>
    <div>submittedByActorId: <code>${escapeHtml(proof.submittedByActorId ?? "n/a")}</code></div>
    <div>note: <code data-testid="delivery-proof-note">${escapeHtml(proof.note ?? "n/a")}</code></div>
    <div>photoUrl: <code data-testid="delivery-proof-photo-url">${escapeHtml(proof.photoUrl ?? "n/a")}</code></div>
    <div>policy: <code data-testid="delivery-proof-policy">note=${String(proof.policy.requireNote)} photo=${String(proof.policy.requirePhoto)}</code></div>
  </div>`;
};

const renderBondItems = (
  items: Array<{
    bondId: string;
    entityId: string;
    entityName: string;
    entityType: string;
    status: string;
    entitySlug?: string | null;
    entityLifecycle?: string | null;
  }>,
  emptyCopy: string,
  testId: string
) => {
  if (items.length === 0) {
    return `<p data-testid="${testId}-empty">${escapeHtml(emptyCopy)}</p>`;
  }

  return `<ul data-testid="${testId}-list">${items
    .map(
      (item) => `<li>
        <strong>${escapeHtml(item.entityName)}</strong>
        <div>entityId: <code>${escapeHtml(item.entityId)}</code></div>
        <div>bondId: <code>${escapeHtml(item.bondId)}</code></div>
        <div>status: <code>${escapeHtml(item.status)}</code></div>
        <div>tipo: <code>${escapeHtml(item.entityType)}</code></div>
        <div>slug: <code>${escapeHtml(item.entitySlug ?? "n/a")}</code></div>
        <div>lifecycle: <code>${escapeHtml(item.entityLifecycle ?? "n/a")}</code></div>
      </li>`
    )
    .join("")}</ul>`;
};

const renderInvitationItems = (
  items: DashboardCompanyViewModel["invitations"]["invitations"],
  emptyCopy: string
) => {
  if (items.length === 0) {
    return `<p data-testid="invitation-list-empty">${escapeHtml(emptyCopy)}</p>`;
  }

  return `<ul data-testid="invitation-list">${items
    .map(
      (item) => `<li>
        <strong>${escapeHtml(item.channel)}</strong>
        <div>status: <code>${escapeHtml(item.status)}</code></div>
        <div>convite: <code>${escapeHtml(item.invitationId)}</code></div>
        <div>token: <code data-testid="invitation-token">${escapeHtml(item.token)}</code></div>
        <div>contato: <code>${escapeHtml(item.invitedContact ?? "n/a")}</code></div>
        <div>expira em: <code>${escapeHtml(formatDate(item.expiresAt))}</code></div>
        <div>aceito em: <code>${escapeHtml(formatDate(item.acceptedAt))}</code></div>
      </li>`
    )
    .join("")}</ul>`;
};

const renderTimeline = (timeline: Array<{
  eventId: string;
  status: string;
  actorType: string;
  actorLabel: string | null;
  sequence: number;
  createdAt: string;
  metadata: Record<string, unknown>;
}>) => {
  if (timeline.length === 0) {
    return '<p data-testid="delivery-timeline-empty">Nenhum evento registrado para esta entrega.</p>';
  }

  return `<ol data-testid="delivery-timeline-list">${timeline
    .map(
      (event) => `<li data-testid="delivery-event-${escapeHtml(event.eventId)}">
        <div><strong data-testid="delivery-event-status">${escapeHtml(statusCopy[event.status] ?? event.status)}</strong></div>
        <div>sequence: <code data-testid="delivery-event-sequence">${event.sequence}</code></div>
        <div>ator: <code data-testid="delivery-event-actor">${escapeHtml(event.actorLabel ?? event.actorType)}</code></div>
        <div>timestamp: <code data-testid="delivery-event-created-at">${escapeHtml(formatDate(event.createdAt))}</code></div>
        <div>metadata: <code>${escapeHtml(JSON.stringify(event.metadata))}</code></div>
      </li>`
    )
    .join("")}</ol>`;
};

const renderDispatchDiagnostics = (
  delivery:
    | DashboardCompanyViewModel["companyDeliveries"]["deliveries"][number]
    | DashboardCompanyViewModel["driverDeliveries"]["deliveries"][number]
) => {
  if (!delivery.dispatch) {
    return '<p data-testid="dispatch-diagnostics-empty">Sem estado explícito de dispatch para esta entrega.</p>';
  }

  const lastAttempt = delivery.dispatch.attempts.at(-1) ?? null;
  const lastEvent = delivery.timeline.at(-1) ?? null;

  return `<div class="dispatch-diagnostics" data-testid="dispatch-diagnostics">
    <div>phase: <code data-testid="dispatch-phase">${escapeHtml(delivery.dispatch.phase)}</code></div>
    <div>attempt ativa: <code data-testid="dispatch-active-attempt">${delivery.dispatch.activeAttemptNumber}</code></div>
    <div>deadline: <code data-testid="dispatch-deadline">${escapeHtml(formatDate(delivery.dispatch.deadlineAt))}</code></div>
    <div>waiting reason: <code data-testid="dispatch-waiting-reason">${escapeHtml(delivery.dispatch.waitingReason ? (waitingReasonCopy[delivery.dispatch.waitingReason] ?? delivery.dispatch.waitingReason) : "n/a")}</code></div>
    <div>última tentativa: <code data-testid="dispatch-last-attempt">${lastAttempt ? `${lastAttempt.attemptNumber}:${lastAttempt.offerStatus}` : "n/a"}</code></div>
    <div>último evento: <code data-testid="dispatch-last-event-at">${escapeHtml(formatDate(lastEvent?.createdAt))}</code></div>
    <div>snapshot candidatos: <code data-testid="dispatch-snapshot-count">${delivery.dispatch.latestSnapshot.length}</code></div>
    <div>strikes: <code data-testid="dispatch-strike-count">${delivery.dispatch.strikes.length}</code></div>
  </div>`;
};

const renderOperationalQueue = (
  items: DashboardCompanyViewModel["companyDeliveries"]["activeQueue"],
  type: "active" | "waiting"
) => {
  const emptyTestId = type === "active" ? "dispatch-active-empty" : "dispatch-waiting-empty";
  const listTestId = type === "active" ? "dispatch-active-list" : "dispatch-waiting-list";
  const cardTestId = type === "active" ? "dispatch-active-card" : "dispatch-waiting-card";

  if (items.length === 0) {
    return `<p data-testid="${emptyTestId}">${escapeHtml(
      type === "active"
        ? "Nenhuma entrega com oferta ativa no momento."
        : "Nenhuma entrega em waiting queue no momento."
    )}</p>`;
  }

  return `<ul data-testid="${listTestId}">${items
    .map((delivery) => `<li data-testid="${cardTestId}-${escapeHtml(delivery.deliveryId)}">
      <article class="delivery-card-inner">
        <header class="delivery-header">
          <div>
            <strong>${escapeHtml(delivery.externalReference ?? delivery.deliveryId)}</strong>
            <div>deliveryId: <code>${escapeHtml(delivery.deliveryId)}</code></div>
          </div>
          <div>
            <span>${escapeHtml(statusCopy[delivery.status] ?? delivery.status)}</span>
            <div><code>${escapeHtml(delivery.dispatch?.phase ?? "n/a")}</code></div>
          </div>
        </header>
        ${renderDispatchDiagnostics(delivery)}
      </article>
    </li>`)
    .join("")}</ul>`;
};

const renderOperationsSummary = (viewModel: DashboardCompanyViewModel) => {
  if (viewModel.summaryState === "not-company") {
    return '<p data-testid="operations-summary-not-company">Somente contas empresa visualizam KPIs operacionais da empresa.</p>';
  }

  if (viewModel.summaryState === "error") {
    return `<p role="alert" data-testid="operations-summary-error">${escapeHtml(viewModel.summaryError ?? "operations_summary_unavailable")}</p>`;
  }

  if (!viewModel.summary) {
    return '<p data-testid="operations-summary-empty">Nenhum KPI operacional disponível para o recorte atual.</p>';
  }

  return `<div class="delivery-grid" data-testid="operations-summary-kpis">
    <article class="delivery-section" data-testid="kpi-awaiting-acceptance">
      <h3>Aguardando aceite</h3>
      <strong>${viewModel.summary.kpis.awaitingAcceptance}</strong>
    </article>
    <article class="delivery-section" data-testid="kpi-waiting-queue">
      <h3>Waiting queue</h3>
      <strong>${viewModel.summary.kpis.waitingQueue}</strong>
    </article>
    <article class="delivery-section" data-testid="kpi-failed-attempts">
      <h3>Tentativas falhas</h3>
      <strong>${viewModel.summary.kpis.failedAttempts}</strong>
    </article>
    <article class="delivery-section" data-testid="kpi-delivered">
      <h3>Entregas concluídas</h3>
      <strong>${viewModel.summary.kpis.delivered}</strong>
    </article>
    <article class="delivery-section" data-testid="kpi-active-drivers">
      <h3>Entregadores ativos</h3>
      <strong>${viewModel.summary.kpis.activeDrivers}</strong>
    </article>
    <article class="delivery-section" data-testid="kpi-on-time">
      <h3>On-time</h3>
      <div><code data-testid="kpi-on-time-state">${escapeHtml(viewModel.summary.onTime.state)}</code></div>
      <div data-testid="kpi-on-time-value">${viewModel.summary.onTime.value === undefined ? "n/a" : `${viewModel.summary.onTime.value.toFixed(1)}%`}</div>
      <small data-testid="kpi-on-time-reason">${escapeHtml(viewModel.summary.onTime.reason)}</small>
    </article>
  </div>`;
};

const renderDriversOperational = (viewModel: DashboardCompanyViewModel) => {
  const drivers = viewModel.driversOperational ?? [];

  if (viewModel.driversState === "not-company") {
    return '<p data-testid="drivers-operational-not-company">Somente contas empresa visualizam a disponibilidade operacional dos entregadores.</p>';
  }

  if (viewModel.driversState === "error") {
    return `<p role="alert" data-testid="drivers-operational-error">${escapeHtml(viewModel.driversError ?? "drivers_operational_unavailable")}</p>`;
  }

  if (drivers.length === 0) {
    return '<p data-testid="drivers-operational-empty">Nenhum entregador operacional encontrado para esta empresa.</p>';
  }

  return `<ul data-testid="drivers-operational-list">${drivers
    .map(
      (driver) => `<li data-testid="driver-operational-${escapeHtml(driver.driverId)}">
        <article class="delivery-card-inner">
          <header class="delivery-header">
            <div>
              <strong>${escapeHtml(driver.driverName)}</strong>
              <div>driverId: <code>${escapeHtml(driver.driverId)}</code></div>
            </div>
            <div><code data-testid="driver-operational-state">${escapeHtml(operationalStateCopy[driver.operationalState] ?? driver.operationalState)}</code></div>
          </header>
          <div class="delivery-meta-grid">
            <div>status vínculo: <code data-testid="driver-operational-bond-status">${escapeHtml(bondStatusCopy[driver.bondStatus] ?? driver.bondStatus)}</code></div>
            <div>strikes: <code data-testid="driver-operational-strike-count">${driver.strikeCount}</code></div>
            <div>consequência: <code data-testid="driver-operational-strike-consequence">${escapeHtml(driver.strikeConsequence ? (strikeConsequenceCopy[driver.strikeConsequence] ?? driver.strikeConsequence) : "n/a")}</code></div>
            <div>ofertas pendentes: <code data-testid="driver-operational-pending-offers">${driver.pendingOfferCount}</code></div>
            <div>entregas ativas: <code data-testid="driver-operational-active-deliveries">${driver.activeDeliveriesCount}</code></div>
            <div>falhas: <code data-testid="driver-operational-failed-attempts">${driver.failedAttemptsCount}</code></div>
            <div>última oferta: <code data-testid="driver-operational-last-offer">${escapeHtml(formatDate(driver.lastOfferAt))}</code></div>
            <div>última resolução: <code data-testid="driver-operational-last-resolution">${escapeHtml(formatDate(driver.lastResolution))}</code></div>
          </div>
        </article>
      </li>`
    )
    .join("")}</ul>`;
};

const renderDeliveryList = (
  items:
    | DashboardCompanyViewModel["companyDeliveries"]["deliveries"]
    | DashboardCompanyViewModel["retailerDeliveries"]["deliveries"]
    | DashboardCompanyViewModel["driverDeliveries"]["deliveries"],
  mode: "company" | "retailer" | "driver"
) => {
  if (items.length === 0) {
    return `<p data-testid="${mode}-deliveries-empty">${escapeHtml(
      mode === "company"
        ? "Nenhuma entrega está na fila operacional desta empresa."
        : mode === "retailer"
          ? "Nenhuma entrega criada por este lojista até agora."
          : "Nenhuma entrega vinculada a este entregador até agora."
    )}</p>`;
  }

  return `<ul data-testid="${mode}-deliveries-list">${items
    .map(
      (delivery) => `<li data-testid="delivery-item-${escapeHtml(delivery.deliveryId)}">
        <article class="delivery-card-inner">
          <header class="delivery-header">
            <div>
              <strong data-testid="delivery-reference">${escapeHtml(delivery.externalReference ?? delivery.deliveryId)}</strong>
              <div>deliveryId: <code>${escapeHtml(delivery.deliveryId)}</code></div>
            </div>
            <div>
              <span data-testid="delivery-status-current">${escapeHtml(statusCopy[delivery.status] ?? delivery.status)}</span>
              <div><code>${escapeHtml(delivery.status)}</code></div>
            </div>
          </header>
          <div class="delivery-meta-grid">
            <div>companyId: <code>${escapeHtml(delivery.companyId)}</code></div>
            <div>retailerId: <code>${escapeHtml(delivery.retailerId)}</code></div>
            <div>driverId: <code>${escapeHtml(delivery.driverId ?? "n/a")}</code></div>
            <div>pickup: <code>${escapeHtml(delivery.pickupAddress ?? "n/a")}</code></div>
            <div>dropoff: <code>${escapeHtml(delivery.dropoffAddress ?? "n/a")}</code></div>
            <div>createdAt: <code>${escapeHtml(formatDate(delivery.createdAt))}</code></div>
          </div>
          <div>metadata: <code>${escapeHtml(JSON.stringify(delivery.metadata))}</code></div>
          ${mode === "company"
            ? `<form method="post" action="/dashboard/deliveries/transition" class="delivery-transition-form" data-testid="delivery-transition-form">
                <input type="hidden" name="deliveryId" value="${escapeHtml(delivery.deliveryId)}" />
                <label>Próximo status
                  <select name="status" data-testid="delivery-transition-select">
                    ${transitionOptions
                      .map(
                        (option) => `<option value="${option.value}"${option.value === delivery.status ? " selected" : ""}>${escapeHtml(option.label)}</option>`
                      )
                      .join("")}
                  </select>
                </label>
                <label>Notas da transição (opcional)
                  <input name="notes" placeholder="motivo ou contexto" data-testid="delivery-transition-notes" />
                </label>
                <button type="submit" data-testid="delivery-transition-submit">Atualizar entrega</button>
              </form>`
            : ""}
          ${(mode === "company" || mode === "driver") && isProofCompletable(delivery.status)
            ? `<form method="post" action="/dashboard/deliveries/complete" class="delivery-transition-form" data-testid="delivery-complete-form">
                <input type="hidden" name="deliveryId" value="${escapeHtml(delivery.deliveryId)}" />
                <label>Nota da prova (opcional conforme política)
                  <input name="proofNote" placeholder="recebido na portaria, nome de quem recebeu" data-testid="delivery-proof-note-input" />
                </label>
                <label>Foto/URL da prova (opcional conforme política)
                  <input name="proofPhotoUrl" placeholder="https://cdn.sendro.test/proofs/pod-123.jpg" data-testid="delivery-proof-photo-input" />
                </label>
                <button type="submit" data-testid="delivery-complete-submit">Concluir com prova</button>
              </form>`
            : ""}
          ${mode === "driver" && delivery.dispatch?.phase === "offered" && delivery.dispatch.activeAttemptId
            ? `<form method="post" action="/dashboard/driver-offer" class="driver-offer-form" data-testid="driver-offer-form">
                <input type="hidden" name="deliveryId" value="${escapeHtml(delivery.deliveryId)}" />
                <label>Motivo da recusa (opcional)
                  <input name="reason" placeholder="capacidade, distância, indisponibilidade" data-testid="driver-offer-reason-input" />
                </label>
                <div class="driver-offer-actions">
                  <button type="submit" name="decision" value="accept" data-testid="driver-offer-accept-submit">Aceitar oferta</button>
                  <button type="submit" name="decision" value="reject" data-testid="driver-offer-reject-submit">Recusar oferta</button>
                </div>
              </form>`
            : ""}
          <section class="timeline-card">
            <h4>Proof of delivery</h4>
            ${renderProof(delivery.proof)}
          </section>
          <section class="timeline-card">
            <h4>Timeline</h4>
            ${renderTimeline(delivery.timeline)}
          </section>
          ${mode !== "retailer" ? `<section class="timeline-card"><h4>Diagnóstico de dispatch</h4>${renderDispatchDiagnostics(delivery)}</section>` : ""}
        </article>
      </li>`
    )
    .join("")}</ul>`;
};

const renderDriverOfferCard = (viewModel: DashboardCompanyViewModel["driverDeliveries"]) => {
  if (viewModel.offerState === "not-driver") {
    return '<p data-testid="driver-offer-not-driver">Somente entregadores visualizam ofertas ativas.</p>';
  }

  if (viewModel.offerState === "error") {
    return `<p role="alert" data-testid="driver-offer-error">${escapeHtml(viewModel.offerError ?? viewModel.error ?? "driver_offer_unavailable")}</p>`;
  }

  if (!viewModel.activeOffer) {
    return '<p data-testid="driver-offer-empty">Nenhuma oferta ativa encontrada para este entregador.</p>';
  }

  const offer = viewModel.activeOffer;
  return `<article class="delivery-card-inner" data-testid="driver-offer-card-${escapeHtml(offer.deliveryId)}">
    <header class="delivery-header">
      <div>
        <strong>${escapeHtml(offer.externalReference ?? offer.deliveryId)}</strong>
        <div>deliveryId: <code>${escapeHtml(offer.deliveryId)}</code></div>
      </div>
      <div><code data-testid="driver-offer-status">${escapeHtml(offer.status)}</code></div>
    </header>
    <div class="delivery-meta-grid">
      <div>pickup: <code>${escapeHtml(offer.pickupAddress ?? "n/a")}</code></div>
      <div>dropoff: <code>${escapeHtml(offer.dropoffAddress ?? "n/a")}</code></div>
      <div>deadline: <code data-testid="driver-offer-deadline">${escapeHtml(formatDate(offer.dispatch?.deadlineAt))}</code></div>
      <div>attempt: <code data-testid="driver-offer-attempt">${offer.dispatch?.activeAttemptNumber ?? 0}</code></div>
    </div>
    <div>phase: <code data-testid="driver-offer-phase">${escapeHtml(offer.dispatch?.phase ?? "n/a")}</code></div>
    ${renderDispatchDiagnostics(offer)}
    <form method="post" action="/dashboard/driver-offer" class="driver-offer-form" data-testid="driver-offer-form-inline">
      <input type="hidden" name="deliveryId" value="${escapeHtml(offer.deliveryId)}" />
      <label>Motivo da recusa (opcional)
        <input name="reason" placeholder="capacidade, distância, indisponibilidade" data-testid="driver-offer-reason-input-inline" />
      </label>
      <div class="driver-offer-actions">
        <button type="submit" name="decision" value="accept" data-testid="driver-offer-accept-submit-inline">Aceitar oferta</button>
        <button type="submit" name="decision" value="reject" data-testid="driver-offer-reject-submit-inline">Recusar oferta</button>
      </div>
    </form>
  </article>`;
};

const renderDriverStrikeCard = (viewModel: DashboardCompanyViewModel["driverDeliveries"]) => {
  if (viewModel.strikeState === "not-driver") {
    return '<p data-testid="driver-strike-not-driver">Somente entregadores visualizam o próprio histórico de strikes.</p>';
  }

  if (viewModel.strikeState === "error") {
    return `<p role="alert" data-testid="driver-strike-error">${escapeHtml(viewModel.error ?? "driver_strike_unavailable")}</p>`;
  }

  if (!viewModel.strikeSummary || viewModel.strikeSummary.total === 0) {
    return '<p data-testid="driver-strike-empty">Nenhum strike registrado para este entregador nesta empresa.</p>';
  }

  const { strikeSummary } = viewModel;
  return `<div data-testid="driver-strike-summary">
    <div>total: <code data-testid="driver-strike-total">${strikeSummary.total}</code></div>
    <div>última consequência: <code data-testid="driver-strike-consequence">${escapeHtml(strikeConsequenceCopy[strikeSummary.activeConsequence ?? ""] ?? strikeSummary.activeConsequence ?? "n/a")}</code></div>
    <div>status do vínculo: <code data-testid="driver-bond-status">${escapeHtml(bondStatusCopy[strikeSummary.bondStatus ?? ""] ?? strikeSummary.bondStatus ?? "n/a")}</code></div>
    ${strikeSummary.lastStrike
      ? `<div>último strike: <code data-testid="driver-strike-id">${escapeHtml(strikeSummary.lastStrike.strikeId)}</code></div>
         <div>motivo: <code data-testid="driver-strike-reason">${escapeHtml(strikeSummary.lastStrike.reason)}</code></div>`
      : ""}
  </div>`;
};

export const renderDashboardPage = (viewModel: DashboardCompanyViewModel) => `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dashboard Sendro</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
      main { max-width: 1100px; margin: 48px auto; padding: 32px; }
      .card { background: rgba(15,23,42,.85); border: 1px solid #334155; border-radius: 16px; padding: 24px; margin-bottom: 16px; }
      .meta { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; }
      .bond-grid, .delivery-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(260px,1fr)); gap: 16px; }
      .bond-section, .delivery-section, .timeline-card { border: 1px solid #334155; border-radius: 12px; padding: 16px; background: rgba(2,6,23,.55); }
      .status-error { border-color: #ef4444; }
      .status-empty { border-color: #f59e0b; }
      .invite-form, .delivery-form, .delivery-transition-form, .driver-offer-form { display: grid; gap: 12px; margin-bottom: 16px; }
      .invite-form-row, .delivery-form-row { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); }
      .driver-offer-actions { display: flex; gap: 12px; flex-wrap: wrap; }
      label { display: grid; gap: 6px; }
      input, select, button { font: inherit; padding: 12px; border-radius: 10px; border: 1px solid #334155; background: #020617; color: #e2e8f0; }
      button { cursor: pointer; background: #2563eb; border-color: #2563eb; }
      .invite-generated, .delivery-feedback { margin-bottom: 16px; padding: 16px; border-radius: 12px; background: rgba(37,99,235,.12); border: 1px solid #2563eb; }
      .delivery-card-inner { display: grid; gap: 16px; }
      .delivery-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
      .delivery-meta-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 10px; }
      code { background: #020617; padding: 2px 6px; border-radius: 6px; }
      ul, ol { padding-left: 20px; }
      li + li { margin-top: 12px; }
    </style>
  </head>
  <body>
    <main>
      <nav style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;">
        <a href="/dashboard" style="color:#93c5fd;text-decoration:none;padding:8px 16px;border:1px solid #334155;border-radius:8px;" data-testid="nav-dashboard">📦 Entregas</a>
        <a href="/dashboard/whatsapp" style="color:#93c5fd;text-decoration:none;padding:8px 16px;border:1px solid #334155;border-radius:8px;" data-testid="nav-whatsapp">📱 WhatsApp</a>
      </nav>
      <section class="card">
        <h1>Dashboard autenticado</h1>
        <p>Usuário SSR resolvido com sucesso a partir da sessão Better Auth.</p>
      </section>
      <section class="card meta">
        <div><strong>Nome</strong><div data-testid="user-name">${escapeHtml(viewModel.user.name)}</div></div>
        <div><strong>E-mail</strong><div data-testid="user-email">${escapeHtml(viewModel.user.email)}</div></div>
        <div><strong>Role</strong><div data-testid="user-role">${escapeHtml(viewModel.user.role)}</div></div>
        <div><strong>Perfil</strong><div data-testid="profile-name">${escapeHtml(viewModel.profile?.name ?? "n/a")}</div></div>
      </section>
      <section class="card">
        <h2>Diagnóstico</h2>
        <ul>
          <li>role: <code>${escapeHtml(viewModel.diagnostics?.role ?? "unknown")}</code></li>
          <li>profileCreated: <code>${String(viewModel.diagnostics?.profileCreated ?? false)}</code></li>
          <li>stripeStage: <code>${escapeHtml(viewModel.diagnostics?.stripeStage ?? "unknown")}</code></li>
          <li>stripeCustomerId: <code>${escapeHtml(viewModel.profile?.stripeCustomerId ?? "none")}</code></li>
          <li>bondsState: <code data-testid="bonds-state">${escapeHtml(viewModel.bondsState)}</code></li>
          <li>invitationsState: <code data-testid="invitations-state">${escapeHtml(viewModel.invitations.state)}</code></li>
          <li>retailerDeliveriesState: <code data-testid="retailer-deliveries-state">${escapeHtml(viewModel.retailerDeliveries.state)}</code></li>
          <li>companyDeliveriesState: <code data-testid="company-deliveries-state">${escapeHtml(viewModel.companyDeliveries.state)}</code></li>
          <li>summaryState: <code data-testid="summary-state">${escapeHtml(viewModel.summaryState)}</code></li>
          <li>driversState: <code data-testid="drivers-state">${escapeHtml(viewModel.driversState)}</code></li>
          <li>driverDeliveriesState: <code data-testid="driver-deliveries-state">${escapeHtml(viewModel.driverDeliveries.state)}</code></li>
        </ul>
      </section>
      <section class="card ${viewModel.driverDeliveries.state === "error" ? "status-error" : viewModel.driverDeliveries.state === "empty" ? "status-empty" : ""}">
        <h2>Resposta do entregador</h2>
        <p>Visualize a oferta ativa, responda exatamente uma vez via SSR e acompanhe os strikes progressivos.</p>
        ${viewModel.driverDeliveries.error ? `<p role="alert" data-testid="driver-deliveries-error">${escapeHtml(viewModel.driverDeliveries.error)}</p>` : ""}
        ${viewModel.driverDeliveries.resolutionFeedback
          ? `<div class="delivery-feedback" data-testid="driver-offer-feedback">
              <strong>Oferta respondida</strong>
              <div data-testid="driver-offer-feedback-message">${escapeHtml(viewModel.driverDeliveries.resolutionFeedback.message)}</div>
              <div>deliveryId: <code data-testid="driver-offer-feedback-delivery-id">${escapeHtml(viewModel.driverDeliveries.resolutionFeedback.deliveryId)}</code></div>
              <div>attemptId: <code data-testid="driver-offer-feedback-attempt-id">${escapeHtml(viewModel.driverDeliveries.resolutionFeedback.attemptId)}</code></div>
              <div>queueEntryId: <code data-testid="driver-offer-feedback-queue-id">${escapeHtml(viewModel.driverDeliveries.resolutionFeedback.queueEntryId)}</code></div>
              <div>resolution: <code data-testid="driver-offer-feedback-resolution">${escapeHtml(viewModel.driverDeliveries.resolutionFeedback.resolution)}</code></div>
              <div>status: <code data-testid="driver-offer-feedback-status">${escapeHtml(viewModel.driverDeliveries.resolutionFeedback.status)}</code></div>
              ${viewModel.driverDeliveries.resolutionFeedback.strike
                ? `<div>strike: <code data-testid="driver-offer-feedback-strike">${escapeHtml(viewModel.driverDeliveries.resolutionFeedback.strike.consequence)}</code></div>`
                : ""}
            </div>`
          : ""}
        ${viewModel.driverDeliveries.state === "not-driver" ? '<p data-testid="driver-deliveries-not-driver">Somente entregadores visualizam ofertas e strikes próprios no dashboard.</p>' : ""}
        <div class="delivery-grid">
          <section class="delivery-section">
            <h3>Oferta ativa</h3>
            ${renderDriverOfferCard(viewModel.driverDeliveries)}
          </section>
          <section class="delivery-section">
            <h3>Strikes e consequência</h3>
            ${renderDriverStrikeCard(viewModel.driverDeliveries)}
          </section>
        </div>
        ${renderDeliveryList(viewModel.driverDeliveries.deliveries, "driver")}
      </section>
      <section class="card ${viewModel.retailerDeliveries.state === "error" ? "status-error" : viewModel.retailerDeliveries.state === "empty" ? "status-empty" : ""}">
        <h2>Criação de entrega pelo lojista</h2>
        <p>Crie entregas pelo SSR do dashboard sem depender de fetch client-side.</p>
        ${viewModel.retailerDeliveries.error ? `<p role="alert" data-testid="retailer-deliveries-error">${escapeHtml(viewModel.retailerDeliveries.error)}</p>` : ""}
        ${viewModel.retailerDeliveries.createFeedback
          ? `<div class="delivery-feedback" data-testid="retailer-delivery-feedback">
              <strong>Entrega criada com sucesso</strong>
              <div data-testid="retailer-delivery-feedback-message">${escapeHtml(viewModel.retailerDeliveries.createFeedback.message)}</div>
              <div>deliveryId: <code>${escapeHtml(viewModel.retailerDeliveries.createFeedback.deliveryId)}</code></div>
              <div>status: <code>${escapeHtml(viewModel.retailerDeliveries.createFeedback.status)}</code></div>
            </div>`
          : ""}
        ${viewModel.retailerDeliveries.state === "not-retailer" ? '<p data-testid="retailer-deliveries-not-retailer">Somente lojistas podem criar entregas pelo dashboard.</p>' : ""}
        <form class="delivery-form" method="post" action="/dashboard/deliveries">
          <div class="delivery-form-row">
            <label>Company ID
              <input name="companyId" placeholder="UUID da empresa vinculada" data-testid="delivery-company-id-input" />
            </label>
            <label>Referência externa
              <input name="externalReference" placeholder="pedido-123" data-testid="delivery-reference-input" />
            </label>
          </div>
          <div class="delivery-form-row">
            <label>Endereço de coleta
              <input name="pickupAddress" placeholder="Rua da coleta, 123" data-testid="delivery-pickup-input" />
            </label>
            <label>Endereço de entrega
              <input name="dropoffAddress" placeholder="Rua do destino, 456" data-testid="delivery-dropoff-input" />
            </label>
          </div>
          <label>Notas operacionais
            <input name="notes" placeholder="detalhes do pacote ou observações" data-testid="delivery-notes-input" />
          </label>
          <button type="submit" data-testid="delivery-create-submit">Criar entrega</button>
        </form>
        ${renderDeliveryList(viewModel.retailerDeliveries.deliveries, "retailer")}
      </section>
      <section class="card ${viewModel.invitations.state === "error" ? "status-error" : viewModel.invitations.state === "empty" ? "status-empty" : ""}">
        <h2>Convites de entregador</h2>
        <p>Gere um link SSR e acompanhe o estado dos convites emitidos por esta empresa.</p>
        ${viewModel.invitations.error ? `<p role="alert" data-testid="invitation-error">${escapeHtml(viewModel.invitations.error)}</p>` : ""}
        ${viewModel.invitations.generatedInvitation
          ? `<div class="invite-generated" data-testid="generated-invitation">
              <strong>Convite gerado com sucesso</strong>
              <div>invitationId: <code>${escapeHtml(viewModel.invitations.generatedInvitation.invitationId)}</code></div>
              <div>token: <code>${escapeHtml(viewModel.invitations.generatedInvitation.token)}</code></div>
              <div>url: <code data-testid="generated-invite-url">${escapeHtml(viewModel.invitations.generatedInvitation.inviteUrl)}</code></div>
            </div>`
          : ""}
        ${viewModel.invitations.state === "not-company" ? '<p data-testid="invitation-not-company">Somente contas empresa podem gerar e listar convites.</p>' : ""}
        <form class="invite-form" method="post" action="/dashboard/invitations">
          <div class="invite-form-row">
            <label>Canal
              <select name="channel" data-testid="invitation-channel-select">
                <option value="link">Link</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label>Contato (opcional)
              <input name="invitedContact" placeholder="email, telefone ou apelido" data-testid="invited-contact-input" />
            </label>
          </div>
          <button type="submit" data-testid="generate-invitation-button">Gerar link de convite</button>
        </form>
        ${renderInvitationItems(viewModel.invitations.invitations, "Nenhum convite gerado no momento.")}
      </section>
      <section class="card ${viewModel.summaryState === "error" ? "status-error" : viewModel.summaryState === "empty" ? "status-empty" : ""}">
        <h2>KPIs operacionais (empresa)</h2>
        <p>Resumo SSR com indicadores mínimos de dispatch e estado explícito de on-time.</p>
        ${renderOperationsSummary(viewModel)}
      </section>
      <section class="card ${viewModel.driversState === "error" ? "status-error" : viewModel.driversState === "empty" ? "status-empty" : ""}">
        <h2>Disponibilidade operacional dos entregadores</h2>
        <p>Estado company-scoped por entregador com vínculo, strikes e atividade recente.</p>
        ${renderDriversOperational(viewModel)}
      </section>
      <section class="card ${viewModel.companyDeliveries.state === "error" ? "status-error" : viewModel.companyDeliveries.state === "empty" ? "status-empty" : ""}">
        <h2>Fila operacional da empresa</h2>
        <p>Acompanhe a fila SSR, o status atual e a timeline imutável de cada entrega.</p>
        ${viewModel.companyDeliveries.error ? `<p role="alert" data-testid="company-deliveries-error">${escapeHtml(viewModel.companyDeliveries.error)}</p>` : ""}
        ${viewModel.companyDeliveries.queueError ? `<p role="alert" data-testid="dispatch-active-error">${escapeHtml(viewModel.companyDeliveries.queueError)}</p>` : ""}
        ${viewModel.companyDeliveries.waitingError ? `<p role="alert" data-testid="dispatch-waiting-error">${escapeHtml(viewModel.companyDeliveries.waitingError)}</p>` : ""}
        ${viewModel.companyDeliveries.transitionFeedback
          ? `<div class="delivery-feedback" data-testid="company-delivery-feedback">
              <strong>Entrega atualizada com sucesso</strong>
              <div data-testid="company-delivery-feedback-message">${escapeHtml(viewModel.companyDeliveries.transitionFeedback.message)}</div>
              <div>deliveryId: <code>${escapeHtml(viewModel.companyDeliveries.transitionFeedback.deliveryId)}</code></div>
              <div>status: <code>${escapeHtml(viewModel.companyDeliveries.transitionFeedback.status)}</code></div>
            </div>`
          : ""}
        ${viewModel.companyDeliveries.completionFeedback
          ? `<div class="delivery-feedback" data-testid="company-delivery-completion-feedback">
              <strong>Entrega concluída com prova</strong>
              <div data-testid="company-delivery-completion-message">${escapeHtml(viewModel.companyDeliveries.completionFeedback.message)}</div>
              <div>deliveryId: <code>${escapeHtml(viewModel.companyDeliveries.completionFeedback.deliveryId)}</code></div>
              <div>status: <code>${escapeHtml(viewModel.companyDeliveries.completionFeedback.status)}</code></div>
            </div>`
          : ""}
        ${viewModel.companyDeliveries.reprocessFeedback
          ? `<div class="delivery-feedback" data-testid="dispatch-reprocess-feedback">
              <strong>Dispatch reprocessado</strong>
              <div data-testid="dispatch-reprocess-message">${escapeHtml(viewModel.companyDeliveries.reprocessFeedback.message)}</div>
              <div>processedAt: <code>${escapeHtml(formatDate(viewModel.companyDeliveries.reprocessFeedback.result.processedAt))}</code></div>
            </div>`
          : ""}
        ${viewModel.companyDeliveries.state === "not-company" ? '<p data-testid="company-deliveries-not-company">Somente contas empresa visualizam a fila operacional de entregas.</p>' : ""}
        <div class="delivery-grid">
          <section class="delivery-section">
            <h3>Fila ativa de dispatch</h3>
            <p>Entregas com oferta ativa, deadline e tentativa corrente.</p>
            ${renderOperationalQueue(viewModel.companyDeliveries.activeQueue, "active")}
          </section>
          <section class="delivery-section">
            <h3>Waiting queue</h3>
            <p>Entregas aguardando intervenção após fallback ou falta de candidatos.</p>
            ${renderOperationalQueue(viewModel.companyDeliveries.waitingQueue, "waiting")}
          </section>
        </div>
        ${renderDeliveryList(viewModel.companyDeliveries.deliveries, "company")}
      </section>
      <section class="card ${viewModel.bondsState === "error" ? "status-error" : viewModel.bondsState === "empty" ? "status-empty" : ""}">
        <h2>Vínculos da empresa</h2>
        ${viewModel.bondsError ? `<p role="alert" data-testid="bonds-error">${escapeHtml(viewModel.bondsError)}</p>` : ""}
        ${viewModel.bondsState === "empty" ? '<p data-testid="bonds-empty">Nenhum vínculo ativo ou pendente foi encontrado para esta empresa.</p>' : ""}
        ${viewModel.bondsState === "not-company" ? '<p data-testid="bonds-not-company">Somente contas empresa visualizam vínculos da empresa no dashboard.</p>' : ""}
        <div class="bond-grid">
          <section class="bond-section">
            <h3>Lojistas vinculados</h3>
            ${renderBondItems(
              viewModel.bonds.activeRetailers,
              "Nenhum lojista vinculado no momento.",
              "active-retailers"
            )}
          </section>
          <section class="bond-section">
            <h3>Solicitações pendentes</h3>
            ${renderBondItems(
              viewModel.bonds.pendingRetailers,
              "Nenhuma solicitação pendente no momento.",
              "pending-retailers"
            )}
          </section>
          <section class="bond-section">
            <h3>Entregadores vinculados</h3>
            ${renderBondItems(
              viewModel.bonds.activeDrivers,
              "Nenhum entregador vinculado no momento.",
              "active-drivers"
            )}
          </section>
        </div>
      </section>
    </main>
  </body>
</html>`;
