type FormState = {
  title: string;
  action: string;
  submitLabel: string;
  error?: string;
};

type RegisterPageState = {
  selectedRole?: string;
  inviteToken?: string | null;
  inviteStatus?: "pending" | "accepted" | "expired" | "revoked" | "invalid-role" | null;
  inviteError?: string | null;
  inviteCompanyName?: string | null;
  inviteCompanySlug?: string | null;
  values?: Record<string, string>;
};

const roles = [
  { value: "company", label: "Empresa" },
  { value: "retailer", label: "Lojista" },
  { value: "driver", label: "Entregador" }
] as const;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const renderAuthLayout = (state: FormState, content: string) => `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${state.title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #f6f7fb; color: #111827; }
      main { max-width: 720px; margin: 48px auto; padding: 32px; background: #fff; border-radius: 16px; box-shadow: 0 12px 30px rgba(0,0,0,.08); }
      form { display: grid; gap: 16px; }
      label { display: grid; gap: 6px; font-weight: 600; }
      input, select, button { font: inherit; padding: 12px; border-radius: 10px; border: 1px solid #d1d5db; }
      button { background: #111827; color: #fff; cursor: pointer; }
      .error { padding: 12px; border-radius: 10px; background: #fef2f2; color: #991b1b; }
      .hint { color: #4b5563; font-size: 14px; }
      .switcher { display: flex; gap: 8px; }
      .switcher a { color: #2563eb; }
      .invite-card { padding: 16px; border-radius: 12px; background: #eff6ff; border: 1px solid #93c5fd; display: grid; gap: 6px; }
      .invite-card code { background: #dbeafe; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <main>
      <h1>${state.title}</h1>
      <p class="hint">Falhas de sessão e handshake aparecem nesta tela com mensagem legível para depuração local.</p>
      ${state.error ? `<div class="error" role="alert">${state.error}</div>` : ""}
      ${content}
    </main>
  </body>
</html>`;

export const renderRoleSelector = (selectedRole?: string, options?: { disabled?: boolean }) => `
<label>
  Tipo de conta
  <select name="role" id="role-select"${options?.disabled ? " disabled" : ""}>
    ${roles.map((role) => `<option value="${role.value}"${selectedRole === role.value ? " selected" : ""}>${role.label}</option>`).join("")}
  </select>
</label>`;

export const roleSpecificFields = (role: string, values: Record<string, string>) => {
  if (role === "company") {
    return `<label>Nome da empresa<input name="companyName" value="${escapeHtml(values.companyName ?? "")}" required /></label>`;
  }

  if (role === "retailer") {
    return `<label>Nome do lojista<input name="retailerName" value="${escapeHtml(values.retailerName ?? "")}" required /></label>`;
  }

  return `
<label>Nome do entregador<input name="driverName" value="${escapeHtml(values.driverName ?? "")}" required /></label>
<label>Telefone<input name="phone" value="${escapeHtml(values.phone ?? "")}" required /></label>`;
};

export const resolveRegisterPageState = (state?: RegisterPageState) => {
  const inviteLockedToDriver = Boolean(state?.inviteToken && state.inviteStatus !== "invalid-role");
  const selectedRole = inviteLockedToDriver ? "driver" : state?.selectedRole ?? "company";
  const values = state?.values ?? {};

  return {
    selectedRole,
    inviteLockedToDriver,
    values,
    inviteToken: state?.inviteToken ?? null,
    inviteStatus: state?.inviteStatus ?? null,
    inviteError: state?.inviteError ?? null,
    inviteCompanyName: state?.inviteCompanyName ?? null,
    inviteCompanySlug: state?.inviteCompanySlug ?? null
  };
};

export const renderInvitationHint = (state?: RegisterPageState) => {
  const resolved = resolveRegisterPageState(state);

  if (!resolved.inviteToken) {
    return "";
  }

  if (resolved.inviteStatus === "invalid-role") {
    return `<div class="error" role="alert" data-testid="invite-invalid-role">Este convite é destinado a entregadores. Entre com uma conta de entregador ou crie uma nova com essa role.</div>`;
  }

  if (resolved.inviteError) {
    return `<div class="error" role="alert" data-testid="invite-error">${escapeHtml(resolved.inviteError)}</div>`;
  }

  return `<div class="invite-card" data-testid="invite-card">
    <strong>Convite de entregador detectado</strong>
    <div>Empresa: <code>${escapeHtml(resolved.inviteCompanyName ?? "n/a")}</code></div>
    <div>Slug: <code>${escapeHtml(resolved.inviteCompanySlug ?? "n/a")}</code></div>
    <div>Token: <code data-testid="invite-token">${escapeHtml(resolved.inviteToken)}</code></div>
    <div>Status: <code data-testid="invite-status">${escapeHtml(resolved.inviteStatus ?? "pending")}</code></div>
    <p class="hint">A role foi travada em entregador e o aceite acontece automaticamente após o cadastro.</p>
  </div>`;
};
