type FormState = {
  title: string;
  action: string;
  submitLabel: string;
  error?: string;
};

const roles = [
  { value: "company", label: "Empresa" },
  { value: "retailer", label: "Lojista" },
  { value: "driver", label: "Entregador" }
] as const;

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

export const renderRoleSelector = (selectedRole?: string) => `
<label>
  Tipo de conta
  <select name="role" id="role-select">
    ${roles.map((role) => `<option value="${role.value}"${selectedRole === role.value ? " selected" : ""}>${role.label}</option>`).join("")}
  </select>
</label>`;

export const roleSpecificFields = (role: string, values: Record<string, string>) => {
  if (role === "company") {
    return `<label>Nome da empresa<input name="companyName" value="${values.companyName ?? ""}" required /></label>`;
  }

  if (role === "retailer") {
    return `<label>Nome do lojista<input name="retailerName" value="${values.retailerName ?? ""}" required /></label>`;
  }

  return `
<label>Nome do entregador<input name="driverName" value="${values.driverName ?? ""}" required /></label>
<label>Telefone<input name="phone" value="${values.phone ?? ""}" required /></label>`;
};
