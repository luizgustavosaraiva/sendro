import type { DashboardCompanyViewModel } from "../../../../lib/trpc";

const escapeHtml = (value: string | number | boolean | null | undefined) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatMoney = (amountCents: number, currency: string) => `${currency} ${(amountCents / 100).toFixed(2)}`;

const formatDateInput = (iso: string) => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toISOString().slice(0, 10);
};

export const renderBillingPage = (viewModel: DashboardCompanyViewModel) => {
  const billing =
    viewModel.billing ?? {
      state: "error",
      rules: [],
      error: "billing_state_missing",
      connect: { state: "error", error: "billing_connect_state_missing" },
      financialKpis: { state: "error", error: "billing_kpis_state_missing" },
      report: {
        state: "error",
        filters: {
          periodStart: new Date(0).toISOString(),
          periodEnd: new Date(0).toISOString(),
          page: 1,
          limit: 50
        },
        error: "billing_report_state_missing"
      }
    } as DashboardCompanyViewModel["billing"];

  const connect = billing.connect;

  const connectBody =
    connect.state === "not-company"
      ? `<p data-testid="billing-connect-not-company">Somente contas empresa podem conectar Stripe Connect.</p>`
      : connect.state === "error"
        ? `<p role="alert" data-testid="billing-connect-error">${escapeHtml(connect.error ?? "billing_connect_unavailable")}</p>`
        : connect.status?.status === "connected"
          ? `<p data-testid="billing-connect-connected">Conta conectada e com capacidades de cobrança/pagamento habilitadas.</p>
             <p data-testid="billing-connect-capabilities">charges_enabled=${escapeHtml(connect.status.chargesEnabled)} payouts_enabled=${escapeHtml(connect.status.payoutsEnabled)}</p>
             <p data-testid="billing-connect-account-id">Conta Stripe: ${escapeHtml(connect.status.stripeAccountId ?? "n/a")}</p>`
          : `<p data-testid="billing-connect-pending">Conexão pendente. Complete o onboarding Stripe para habilitar cobranças e repasses.</p>
             <p data-testid="billing-connect-capabilities">charges_enabled=${escapeHtml(connect.status?.chargesEnabled ?? false)} payouts_enabled=${escapeHtml(connect.status?.payoutsEnabled ?? false)}</p>
             <p data-testid="billing-connect-account-id">Conta Stripe: ${escapeHtml(connect.status?.stripeAccountId ?? "ainda não criada")}</p>`;

  const connectForm =
    connect.state === "not-company"
      ? ""
      : `<form method="post" action="/dashboard/billing/connect" data-testid="billing-connect-form" style="margin-top:12px;display:block;">
          <button type="submit" data-testid="billing-connect-submit">Iniciar onboarding Stripe Connect</button>
        </form>
        <p data-testid="billing-connect-redirect-note" style="margin-top:10px;color:#cbd5e1;">
          Você será redirecionado para uma página externa segura da Stripe para concluir o cadastro.
        </p>`;

  const pricingBody =
    billing.state === "not-company"
      ? `<p data-testid="billing-not-company">Somente contas empresa podem gerenciar regras de cobrança.</p>`
      : billing.state === "error"
        ? `<p role="alert" data-testid="billing-error">${escapeHtml(billing.error ?? "billing_unavailable")}</p>`
        : billing.state === "empty"
          ? `<p data-testid="billing-empty">Nenhuma regra de cobrança cadastrada para esta empresa.</p>`
          : `<table data-testid="billing-rules-table" border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">
              <thead><tr><th>Região</th><th>Tipo</th><th>Peso (g)</th><th>Preço</th></tr></thead>
              <tbody>
                ${billing.rules
                  .map(
                    (rule) => `<tr data-testid="billing-rule-row-${escapeHtml(rule.ruleId)}">
                        <td>${escapeHtml(rule.region)}</td>
                        <td>${escapeHtml(rule.deliveryType)}</td>
                        <td>${escapeHtml(rule.weightMinGrams)} - ${escapeHtml(rule.weightMaxGrams ?? "∞")}</td>
                        <td>${escapeHtml(formatMoney(rule.amountCents, rule.currency))}</td>
                      </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`;

  const kpiBlock =
    billing.financialKpis.state === "not-company"
      ? `<p data-testid="billing-kpis-not-company">Somente contas empresa visualizam KPIs financeiros.</p>`
      : billing.financialKpis.state === "error"
        ? `<p role="alert" data-testid="billing-kpis-error">${escapeHtml(billing.financialKpis.error ?? "billing_kpis_unavailable")}</p>`
        : billing.financialKpis.state === "empty"
          ? `<p data-testid="billing-kpis-empty">Nenhum valor de receita disponível para o recorte atual.</p>`
          : `<div class="kpi-grid" data-testid="billing-kpis-loaded">
              <article class="kpi-card" data-testid="billing-kpi-gross">
                <h3>Receita bruta</h3>
                <strong>${escapeHtml(formatMoney(billing.financialKpis.grossRevenueCents ?? 0, "BRL"))}</strong>
              </article>
              <article class="kpi-card" data-testid="billing-kpi-net">
                <h3>Receita líquida</h3>
                <strong>${escapeHtml(formatMoney(billing.financialKpis.netRevenueCents ?? 0, "BRL"))}</strong>
              </article>
            </div>`;

  const report = billing.report;
  const reportHeaderMeta = `<p data-testid="billing-report-filters-summary">Período ${escapeHtml(
    report.filters.periodStart
  )} até ${escapeHtml(report.filters.periodEnd)} • página ${report.filters.page} • limite ${report.filters.limit}</p>`;

  const reportBody =
    report.state === "not-company"
      ? `<p data-testid="billing-report-not-company">Somente contas empresa visualizam relatórios financeiros.</p>`
      : report.state === "error"
        ? `<p role="alert" data-testid="billing-report-error">${escapeHtml(report.error ?? "billing_report_unavailable")}</p>`
        : report.state === "empty"
          ? `<p data-testid="billing-report-empty">Nenhuma entrega concluída encontrada para os filtros selecionados.</p>`
          : `
              <table data-testid="billing-report-table" border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">
                <thead>
                  <tr>
                    <th>Entrega</th>
                    <th>Entregue em</th>
                    <th>Região</th>
                    <th>Tipo</th>
                    <th>Diagnóstico</th>
                    <th>Regra</th>
                    <th>Bruta</th>
                    <th>Líquida</th>
                  </tr>
                </thead>
                <tbody>
                  ${(report.data?.rows ?? [])
                    .map(
                      (row) => `<tr data-testid="billing-report-row-${escapeHtml(row.deliveryId)}">
                        <td>${escapeHtml(row.deliveryId)}</td>
                        <td>${escapeHtml(row.deliveredAt)}</td>
                        <td>${escapeHtml(row.region ?? "n/a")}</td>
                        <td>${escapeHtml(row.deliveryType ?? "n/a")}</td>
                        <td data-testid="billing-report-diagnostic-${escapeHtml(row.deliveryId)}">${escapeHtml(row.priceDiagnostic)}</td>
                        <td>${escapeHtml(row.matchedRuleId ?? "fallback")}</td>
                        <td>${escapeHtml(formatMoney(row.grossRevenueCents, "BRL"))}</td>
                        <td>${escapeHtml(formatMoney(row.netRevenueCents, "BRL"))}</td>
                      </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
              <p data-testid="billing-report-pagination">total_rows=${report.data?.totalRows ?? 0} total_pages=${report.data?.totalPages ?? 0} page=${
                report.data?.page ?? report.filters.page
              } limit=${report.data?.limit ?? report.filters.limit}</p>
              <p data-testid="billing-report-totals">gross_total=${escapeHtml(
                formatMoney(report.data?.totals.grossRevenueCents ?? 0, "BRL")
              )} net_total=${escapeHtml(formatMoney(report.data?.totals.netRevenueCents ?? 0, "BRL"))}</p>
            `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cobrança – Dashboard Sendro</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
      main { max-width: 980px; margin: 48px auto; padding: 32px; }
      .card { background: rgba(15,23,42,.85); border: 1px solid #334155; border-radius: 16px; padding: 24px; margin-bottom: 16px; }
      .nav a { color: #93c5fd; text-decoration: none; margin-right: 12px; }
      form { display:grid; gap:12px; grid-template-columns: repeat(auto-fit,minmax(200px,1fr)); align-items:end; }
      label { display:grid; gap:6px; }
      input,button { font: inherit; padding: 10px; border-radius: 8px; border: 1px solid #334155; background:#020617; color:#e2e8f0; }
      button { background:#2563eb; border-color:#2563eb; cursor:pointer; }
      .kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap: 12px; }
      .kpi-card { border:1px solid #334155; border-radius:10px; padding:12px; }
    </style>
  </head>
  <body>
    <main>
      <nav class="nav" data-testid="billing-nav">
        <a href="/dashboard">📦 Entregas</a>
        <a href="/dashboard/billing">💸 Cobrança</a>
      </nav>

      <section class="card">
        <h1>Regras de cobrança</h1>
        <p data-testid="billing-state">${escapeHtml(billing.state)}</p>
        ${billing.createFeedback ? `<p data-testid="billing-feedback">${escapeHtml(billing.createFeedback.message)}</p>` : ""}
      </section>

      <section class="card" data-testid="billing-financial-kpis">
        <h2>KPIs financeiros</h2>
        <p data-testid="billing-kpis-state">${escapeHtml(billing.financialKpis.state)}</p>
        ${kpiBlock}
      </section>

      <section class="card" data-testid="billing-report-panel">
        <h2>Relatório financeiro</h2>
        <p data-testid="billing-report-state">${escapeHtml(report.state)}</p>
        ${reportHeaderMeta}
        <form method="get" action="/dashboard/billing" data-testid="billing-report-filter-form">
          <label>Início
            <input type="date" name="periodStart" value="${escapeHtml(formatDateInput(report.filters.periodStart))}" data-testid="billing-filter-period-start" />
          </label>
          <label>Fim
            <input type="date" name="periodEnd" value="${escapeHtml(formatDateInput(report.filters.periodEnd))}" data-testid="billing-filter-period-end" />
          </label>
          <label>Página
            <input type="number" min="1" step="1" name="page" value="${escapeHtml(report.filters.page)}" data-testid="billing-filter-page" />
          </label>
          <label>Limite
            <input type="number" min="1" max="200" step="1" name="limit" value="${escapeHtml(report.filters.limit)}" data-testid="billing-filter-limit" />
          </label>
          <button type="submit" data-testid="billing-filter-submit">Atualizar relatório</button>
        </form>
        ${reportBody}
      </section>

      <section class="card" data-testid="billing-connect-panel">
        <h2>Stripe Connect Express</h2>
        ${connectBody}
        ${connectForm}
      </section>

      <section class="card">
        <h2>Cadastrar regra</h2>
        <form method="post" action="/dashboard/billing" data-testid="billing-form">
          <label>Região
            <input name="region" placeholder="sudeste" data-testid="billing-input-region" />
          </label>
          <label>Tipo de entrega
            <input name="deliveryType" placeholder="bike" data-testid="billing-input-delivery-type" />
          </label>
          <label>Peso mínimo (g)
            <input name="weightMinGrams" type="number" min="0" step="1" data-testid="billing-input-weight-min" />
          </label>
          <label>Peso máximo (g)
            <input name="weightMaxGrams" type="number" min="1" step="1" data-testid="billing-input-weight-max" />
          </label>
          <label>Preço (centavos)
            <input name="amountCents" type="number" min="0" step="1" data-testid="billing-input-amount" />
          </label>
          <button type="submit" data-testid="billing-submit">Salvar regra</button>
        </form>
      </section>

      <section class="card">
        <h2>Regras cadastradas</h2>
        ${pricingBody}
      </section>
    </main>
  </body>
</html>`;
};