import { renderAuthLayout, renderInvitationHint, renderRoleSelector, resolveRegisterPageState, roleSpecificFields } from "../shared";

type RegisterPageOptions = {
  inviteToken?: string | null;
  inviteStatus?: "pending" | "accepted" | "expired" | "revoked" | "invalid-role" | null;
  inviteError?: string | null;
  inviteCompanyName?: string | null;
  inviteCompanySlug?: string | null;
  selectedRole?: string;
  values?: Record<string, string>;
};

export default function RegisterPage(options?: RegisterPageOptions) {
  const state = resolveRegisterPageState(options);
  const companyFields = roleSpecificFields("company", state.values);
  const retailerFields = roleSpecificFields("retailer", state.values);
  const driverFields = roleSpecificFields("driver", state.values);

  return renderAuthLayout(
    {
      title: "Cadastro Sendro",
      action: "/register",
      submitLabel: "Criar conta"
    },
    `<form method="post" action="/register">
      ${renderInvitationHint(options)}
      <label>Nome<input name="name" autocomplete="name" value="${state.values.name ?? ""}" required /></label>
      <label>E-mail<input type="email" name="email" autocomplete="email" value="${state.values.email ?? ""}" required /></label>
      <label>Senha<input type="password" name="password" autocomplete="new-password" required minlength="8" /></label>
      ${renderRoleSelector(state.selectedRole, { disabled: state.inviteLockedToDriver })}
      ${state.inviteLockedToDriver ? '<input type="hidden" name="role" value="driver" />' : ""}
      ${state.inviteToken ? `<input type="hidden" name="inviteToken" value="${state.inviteToken}" />` : ""}
      <div id="role-fields">${state.selectedRole === "company" ? companyFields : state.selectedRole === "retailer" ? retailerFields : driverFields}</div>
      <button type="submit">Criar conta</button>
      <div class="switcher"><span>Já possui conta?</span><a href="/login">Entrar</a></div>
    </form>
    <script>
      const select = document.getElementById('role-select');
      const container = document.getElementById('role-fields');
      const templates = {
        company: ${JSON.stringify(companyFields)},
        retailer: ${JSON.stringify(retailerFields)},
        driver: ${JSON.stringify(driverFields)}
      };
      if (select && !select.disabled) {
        select.addEventListener('change', (event) => {
          const target = event.target;
          container.innerHTML = templates[target.value] ?? templates.company;
        });
      }
    </script>`
  );
}
