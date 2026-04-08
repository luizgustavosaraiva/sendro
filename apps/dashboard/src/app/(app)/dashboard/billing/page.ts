import type { DashboardCompanyViewModel } from "../../../../lib/trpc";

const escapeHtml = (value: string | number | boolean | null | undefined) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatMoney = (amountCents: number, currency: string) => `${currency} ${(amountCents / 100).toFixed(2)}`;

export const renderBillingPage = (viewModel: DashboardCompanyViewModel) => {
  const billing = viewModel.billing ?? { state: "error", rules: [], error: "billing_state_missing" };

  const body = billing.state === "not-company"
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
        ${body}
      </section>
    </main>
  </body>
</html>`;
};
